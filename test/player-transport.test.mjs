/**
 * L1 — playback state machine.
 *
 * Regression tests: each expectation is a behaviour we intend to keep, read off
 * the current implementation and pinned so a refactor cannot change it silently.
 * One test is different — it is prefixed `DIAGNOSTIC (known behaviour, B11)` and
 * only records a current weakness: passing means "still reproducible", not
 * "accepted". See `docs/TESTING.md` §2.1 for the distinction.
 *
 * The seam is the existing public surface: `playQueue / next / prev / seek /
 * setMode / enqueue / removeAt / move / setQueue / snapshot`, plus engine
 * events pushed through the injected adapter. No private function is exported
 * and no engine call count is asserted unless the count *is* the rule (e.g.
 * "switching the mode must not reload the file").
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { createPlayerHarness } from './support/player-harness.mjs'

test('an empty queue is inert', async (t) => {
  const h = await createPlayerHarness(t)
  const before = h.snap()

  assert.equal(before.trackId, null)
  assert.equal(before.cursor, -1)
  assert.equal(before.queue.length, 0)

  await h.player.next()
  await h.player.prev()

  assert.equal(h.snap().trackId, null, 'next/prev on an empty queue stay empty')
  assert.equal(h.engine.of('load').length, 0, 'nothing was handed to mpv')
})

test('playQueue starts on the picked entry and mirrors the rest', async (t) => {
  const h = await createPlayerHarness(t)
  await h.player.playQueue(['a', 'b', 'c'], 1)

  const snap = h.snap()
  assert.equal(snap.trackId, 'b', 'the picked entry is the current one')
  assert.equal(snap.cursor, 1)
  assert.deepEqual(snap.queue, ['a', 'b', 'c'])
  assert.equal(h.engine.state.currentFile, h.pathOf('b'))
  assert.deepEqual(h.engine.loadedFiles(), [h.pathOf('b'), h.pathOf('c')], 'mpv mirrors the remainder, current first')
})

test('next walks the queue and wraps at the end in mode all', async (t) => {
  const h = await createPlayerHarness(t)
  await h.player.playQueue(['a', 'b', 'c'], 0)
  assert.equal(h.snap().mode, 'all', 'list-repeat is the default mode')

  await h.player.next()
  assert.equal(h.snap().trackId, 'b')

  await h.player.next()
  assert.equal(h.snap().trackId, 'c')

  await h.player.next()
  assert.equal(h.snap().trackId, 'a', 'the last entry wraps to the first')
  assert.equal(h.snap().positionMs, 0, 'a wrap restarts the new track')
})

test('sequence stops on manual next at the last entry', async (t) => {
  const h = await createPlayerHarness(t)
  await h.player.setMode('sequence')
  await h.player.playQueue(['a', 'b'], 1)

  await h.player.next()

  assert.equal(h.snap().trackId, 'b', 'the cursor stays on the last entry')
  assert.equal(h.engine.state.pause, true, 'playback was paused instead of wrapped')
})

test('a single-entry queue still restarts itself', async (t) => {
  const h = await createPlayerHarness(t)
  await h.player.playQueue(['a'], 0)
  const loads = h.engine.of('load').length

  await h.player.next()

  assert.equal(h.snap().trackId, 'a')
  assert.equal(h.engine.of('load').length, loads + 1, 'mode all reloads the only entry')

  await h.player.prev()
  assert.equal(h.snap().trackId, 'a', 'prev on a single entry stays put')
})

test('prev restarts the current track after three seconds, and steps back before that', async (t) => {
  const h = await createPlayerHarness(t)
  await h.player.playQueue(['a', 'b', 'c'], 0)

  await h.player.seek(4000)
  await h.player.prev()
  assert.equal(h.snap().trackId, 'a', 'past 3s, prev restarts instead of stepping back')
  assert.equal(h.snap().positionMs, 0, 'the restart really moved the position to the start')

  await h.player.seek(1200)
  await h.player.prev()
  assert.equal(h.snap().trackId, 'c', 'before 3s, prev at the head wraps to the last entry in mode all')
})

test('switching the playback mode never reloads the current track', async (t) => {
  const h = await createPlayerHarness(t)
  await h.player.playQueue(['a', 'b', 'c'], 0)
  await h.player.seek(3000)
  const before = h.snap()
  const loads = h.engine.of('load').length

  for (const mode of ['sequence', 'all', 'one', 'shuffle']) {
    await h.player.setMode(mode)
    const now = h.snap()
    assert.equal(now.mode, mode, `mode ${mode} reported`)
    assert.equal(now.trackId, before.trackId, `mode ${mode}: same track`)
    assert.equal(now.positionMs, before.positionMs, `mode ${mode}: same position`)
    assert.equal(h.engine.state.currentFile, h.pathOf('a'), `mode ${mode}: the same file is still open`)
  }

  assert.equal(h.engine.of('load').length, loads, 'no mode change issued a reload')
})

test('DIAGNOSTIC (known behaviour, B11): repeat-one leaves the old queue tail in mpv', async (t) => {
  // Registered as B11 in LIMITATIONS.md. Characterization only: entering
  // repeat-one mid-playback rewrites nothing, so mpv keeps holding the tracks
  // that followed the current one. Changing this is a state-machine change and
  // needs its own impact analysis (AGENTS.md §4).
  const h = await createPlayerHarness(t)
  await h.player.playQueue(['a', 'b', 'c'], 0)
  const trimsBefore = h.engine.of('trimTail').length

  await h.player.setMode('one')

  assert.equal(h.engine.of('trimTail').length, trimsBefore, 'the mirrored tail is not trimmed')
  assert.equal(h.engine.of('append').length, 0, 'and nothing new is appended either')
  assert.equal(h.snap().queue.length, 3, 'the user-visible queue is untouched')
})
