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
import { anchorOf, positionOf } from '../lib/shared/playhead.js'

/** Poll a predicate for up to a second; the loop must stay fast on success. */
async function waitFor(predicate, timeoutMs = 1000) {
  const started = Date.now()
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error('waitFor timed out')
    await new Promise((done) => setTimeout(done, 1))
  }
}

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
  const writesBefore = h.engine.of('rewriteTail').length

  await h.player.setMode('one')

  assert.equal(h.engine.of('rewriteTail').length, writesBefore, 'the mirrored tail is not rewritten')
  assert.deepEqual(h.engine.playlist(), [h.pathOf('a'), h.pathOf('b'), h.pathOf('c')],
    'mpv still holds the old tail')
  assert.equal(h.snap().queue.length, 3, 'the user-visible queue is untouched')
})

/**
 * B30: after a restart, the first press did nothing and the second one played.
 *
 * A freshly spawned mpv reports `pause: no` with nothing open (`engine.js` starts
 * from `pause: false`, `currentFile: null`), so "not paused" never meant "this is
 * playing". `toggle()` read that flag alone: the first press resolved to *pause*
 * (a no-op on an empty mpv), and only the second press — now paused — fell
 * through to `resume()`, which loads the file.
 *
 * The restored queue here is exactly what `init()` rebuilds from `app_state`.
 */
test('the first press on a cold engine starts playback instead of pausing (B30)', async (t) => {
  const h = await createPlayerHarness(t, {
    stored: {
      player: {
        queue: ['a', 'b', 'c'],
        cursorId: 'b',
        mode: 'sequence',
        volume: 85,
        muted: false,
        positionMs: 1500,
      },
    },
    engineState: { pause: false, currentFile: null },
  })
  assert.equal(h.snap().trackId, 'b', 'the restored queue puts b at the cursor')

  await h.player.toggle()

  assert.deepEqual(h.engine.of('pause'), [], 'there is no file to pause')
  assert.deepEqual(h.engine.loadedFiles(), [h.pathOf('b'), h.pathOf('c')],
    'the first press hands the file to mpv at the restored position')
  assert.equal(h.engine.of('load').at(-1).args[2], 1500, 'and it resumes where the session left off')
  const snap = h.snap()
  assert.equal(snap.playing, true, 'the snapshot agrees that it is playing')
  assert.equal(snap.paused, false)
})

test('pausing while a file is genuinely loaded pauses it, and stamps where it stopped (B33)', async (t) => {
  const h = await createPlayerHarness(t)
  await h.player.playQueue(['a', 'b', 'c'], 0)

  // Reproduce the real cadence: the host last polled at 41.6 s, the engine has
  // since reached 42.5 s, and the user presses pause in between. The client has
  // already painted up to ~42.3 s by interpolating from that poll.
  await h.player.seek(41_600)
  h.engine.setTimePos(42_500)
  const before = h.snap()
  const painted = positionOf(anchorOf(before, 0), 700)

  await h.player.pause()

  const after = h.snap()
  assert.deepEqual(h.engine.of('pause').map((call) => call.args[0]), [true], 'the engine was asked to pause')
  assert.equal(after.positionMs, 42_500,
    'the pause snapshot carries where mpv actually stopped, not the last polled position')
  assert.ok(after.positionSampledAt >= before.positionSampledAt, 'and the sample is freshly stamped')
  assert.ok(after.positionMs >= painted - 1,
    `the bar must not rip backwards when pause lands (painted ${Math.round(painted)}, froze at ${after.positionMs})`)
})

/**
 * B35: the rip that survived three fixes.
 *
 * The 1 Hz poll reads `time-pos` and then writes it. The read takes time: if it
 * was issued *before* the pause stamped its position, it resolves *after* — and
 * writes a smaller position with a **newer** `positionSampledAt`. Every client
 * then re-anchors on that older position (the stamp says "fresh", the value says
 * "before the pause"), the bar rips backwards, and the next poll rips it forward.
 * Whether it happens depends on a poll being in flight when you press pause —
 * which is exactly why it looked probabilistic.
 *
 * The old fake engine resolved `getProperty` synchronously, so this race could
 * not exist in a test. It can now.
 */
test('a poll that was already reading must not overwrite the pause stamp (B35)', async (t) => {
  // A slow poll so the released read's write is not immediately corrected by the next one.
  const h = await createPlayerHarness(t, { pollMs: 200 })
  await h.player.playQueue(['a', 'b', 'c'], 0)
  h.engine.setTimePos(41_600)

  // The poll starts reading now and will answer with 41.6 s whenever we let it.
  const release = h.engine.holdNextTimePos()
  await waitFor(() => h.engine.suspendedReads() === 1)

  // mpv moves on, the user pauses, the host stamps where it really stopped.
  h.engine.setTimePos(42_500)
  await h.player.pause()
  assert.equal(h.snap().positionMs, 42_500, 'the pause stamped the real position')

  // Now the late read lands, carrying the pre-pause value. Watch the state for
  // long enough to cover a further poll: the position must never regress.
  release()
  const seen = new Set()
  const watchUntil = Date.now() + 250
  while (Date.now() < watchUntil) {
    seen.add(h.snap().positionMs)
    await new Promise((done) => setTimeout(done, 2))
  }

  assert.deepEqual([...seen], [42_500],
    'the late read must not move the playhead back to 41 600 under a paused track')
})
test('toggling while a file is genuinely loaded still pauses (B30 must not break it)', async (t) => {
  const h = await createPlayerHarness(t)
  await h.player.playQueue(['a', 'b', 'c'], 0)
  const loadsAfterQueue = h.engine.of('load').length

  await h.player.toggle()

  assert.deepEqual(h.engine.of('pause').map((call) => call.args[0]), [true], 'a loaded, playing file is paused')
  assert.equal(h.snap().paused, true)

  await h.player.toggle()
  assert.deepEqual(h.engine.of('pause').map((call) => call.args[0]), [true, false],
    'and the next press resumes it in place')
  assert.equal(h.engine.of('load').length, loadsAfterQueue, 'resuming an open file does not reload it')
})
