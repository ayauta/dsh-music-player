/**
 * L1 — queue editing and the cursor.
 *
 * Two kinds of test live here, and they mean different things:
 *
 *   - **Regression** tests assert behaviour we intend to keep. A failure is a
 *     regression.
 *   - **DIAGNOSTIC (known behaviour / pending decision)** tests pin a current
 *     defect so it cannot change silently. Passing only means "still
 *     reproducible", never "requirement accepted". They are named with the
 *     `DIAGNOSTIC (...)` prefix and the defect id, and they will be converted
 *     into regression assertions by the commit that actually fixes the defect.
 *
 * Current diagnostics: B10 (shuffle + "play next"), B12 (removing the playing
 * entry rewinds to the head), B13 (duplicate ids and the cursor), B14
 * (`queue.set` desync). None of them is fixed here.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { createPlayerHarness } from './support/player-harness.mjs'

const ALL = [
  { id: 'a', durationMs: 8000 },
  { id: 'b', durationMs: 3000 },
  { id: 'c', durationMs: 3000 },
  { id: 'd', durationMs: 3000 },
  { id: 'x', durationMs: 3000 },
  { id: 'y', durationMs: 3000 },
]

test('move keeps the current track, its position, and the open file', async (t) => {
  const h = await createPlayerHarness(t, { tracks: ALL })
  await h.player.playQueue(['a', 'b', 'c'], 1)
  await h.player.seek(2500)
  const loads = h.engine.of('load').length

  await h.player.move(0, 2)

  const snap = h.snap()
  assert.deepEqual(snap.queue, ['b', 'c', 'a'], 'the user order really changed')
  assert.equal(snap.trackId, 'b', 'the same track is still current')
  assert.equal(snap.cursor, 0, 'the cursor followed the track to its new index')
  assert.equal(snap.positionMs, 2500, 'the position survived the reorder')
  assert.equal(h.engine.of('load').length, loads, 'reordering the queue did not reload the file')
})

test('removing an upcoming track leaves the current one alone', async (t) => {
  const h = await createPlayerHarness(t, { tracks: ALL })
  await h.player.playQueue(['a', 'b', 'c'], 1)
  const loads = h.engine.of('load').length

  await h.player.removeAt(2)

  assert.deepEqual(h.snap().queue, ['a', 'b'])
  assert.equal(h.snap().trackId, 'b')
  assert.equal(h.snap().cursor, 1, 'the cursor did not drift')
  assert.equal(h.engine.of('load').length, loads, 'no reload')
})

test('DIAGNOSTIC (pending decision, B12): removing the playing track restarts from the head of the queue', async (t) => {
  // Recorded behaviour. Removing the entry that is playing rewinds to the first
  // queue entry rather than advancing to the following one; whether that is the
  // wanted product behaviour is an open question (LIMITATIONS.md B12).
  const h = await createPlayerHarness(t, { tracks: ALL })
  await h.player.playQueue(['a', 'b', 'c'], 1)

  await h.player.removeAt(1)

  assert.deepEqual(h.snap().queue, ['a', 'c'])
  assert.equal(h.snap().trackId, 'a', 'playback restarted at the head, not at the next entry')
  assert.equal(h.snap().cursor, 0)
  assert.equal(h.engine.state.currentFile, h.pathOf('a'))
})

test('enqueue end keeps the current track and re-mirrors the tail (current engine protocol)', async (t) => {
  // NOT a product contract: this pins *how this build mirrors the queue into
  // mpv* — "trim everything after the current entry, then append the whole
  // remainder". A future refactor of the mirror (architecture candidate A) may
  // legitimately change the exact `append` payload while keeping the user-facing
  // behaviour identical, so treat a failure here as "the adapter changed" first
  // and only then as a regression.
  const h = await createPlayerHarness(t, { tracks: ALL })
  await h.player.playQueue(['a', 'b'], 0)
  const loads = h.engine.of('load').length

  await h.player.enqueue(['c'], 'end')

  assert.deepEqual(h.snap().queue, ['a', 'b', 'c'])
  assert.equal(h.snap().trackId, 'a')
  assert.equal(h.engine.of('load').length, loads, 'no reload happened')
  assert.equal(h.engine.of('trimTail').length >= 1, true, 'the tail was trimmed before appending')
  assert.deepEqual(h.engine.of('append').at(-1).args[0], [h.pathOf('b'), h.pathOf('c')], 'the remainder is re-appended (adapter protocol)')
})

test('enqueue next puts the entry right after the current one', async (t) => {
  const h = await createPlayerHarness(t, { tracks: ALL })
  await h.player.playQueue(['a', 'b', 'c'], 1)

  await h.player.enqueue(['d'], 'next')

  assert.deepEqual(h.snap().queue, ['a', 'b', 'd', 'c'], 'inserted directly after the current entry')
  assert.equal(h.snap().trackId, 'b')
  assert.deepEqual(h.engine.of('append').at(-1).args[0], [h.pathOf('d'), h.pathOf('c')], 'the mirrored tail matches')
})

test('setQueue keeps a surviving current track', async (t) => {
  const h = await createPlayerHarness(t, { tracks: ALL })
  await h.player.playQueue(['a', 'b', 'c'], 1)
  const loads = h.engine.of('load').length

  await h.player.setQueue(['x', 'b', 'y'])

  assert.equal(h.snap().trackId, 'b', 'the current track survived a queue replacement')
  assert.deepEqual(h.snap().queue, ['x', 'b', 'y'])
  assert.equal(h.engine.of('load').length, loads, 'a surviving track is not reloaded')
})

test('DIAGNOSTIC (known behaviour, B14): setQueue can desync the cursor from the file mpv plays', async (t) => {
  // Registered as B14. Replacing the queue so that the current entry disappears
  // resets the cursor to the new head but passes `restart:false`, so mpv keeps
  // playing the old file while the snapshot already reports the new track.
  // Characterization only.
  const h = await createPlayerHarness(t, { tracks: ALL })
  await h.player.playQueue(['a', 'b', 'c'], 1)
  const loads = h.engine.of('load').length

  await h.player.setQueue(['x', 'y'])

  const snap = h.snap()
  assert.deepEqual(snap.queue, ['x', 'y'])
  assert.equal(snap.trackId, 'x', 'the snapshot reports the new head')
  assert.equal(snap.cursor, 0)
  assert.equal(h.engine.of('load').length, loads, 'but nothing was reloaded')
  assert.equal(h.engine.state.currentFile, h.pathOf('b'), 'mpv is still on the dropped track')
  assert.notEqual(snap.trackPath, h.engine.state.currentFile, 'so trackPath and engineFile disagree')
})

test('shuffle starts on the entry the user picked', async (t) => {
  const h = await createPlayerHarness(t, { tracks: ALL, random: () => 0 })
  await h.player.setMode('shuffle')
  await h.player.playQueue(['a', 'b', 'c'], 1)

  assert.equal(h.snap().trackId, 'b', 'the clicked entry plays even though the order was shuffled')
  assert.equal(h.snap().mode, 'shuffle')
  assert.deepEqual(h.engine.loadedFiles()[0], h.pathOf('b'))
})

test('shuffle never leaves the queue when stepping forward', async (t) => {
  const h = await createPlayerHarness(t, { tracks: ALL, random: () => 0 })
  await h.player.setMode('shuffle')
  await h.player.playQueue(['a', 'b', 'c'], 0)

  const seen = new Set([h.snap().trackId])
  for (let step = 0; step < 6; step += 1) {
    await h.player.next()
    const id = h.snap().trackId
    assert.ok(['a', 'b', 'c'].includes(id), `step ${step} stayed inside the queue (got ${id})`)
    seen.add(id)
  }
  assert.deepEqual([...seen].sort(), ['a', 'b', 'c'], 'every entry is reachable under shuffle')
})

test('DIAGNOSTIC (known behaviour, B10): enqueue next is misplaced while shuffled', async (t) => {
  // Registered as B10. The cursor indexes the shuffled `plays` order while
  // `enqueue` splices the user-visible `queue`, so "play next" lands at the
  // wrong offset and the following rebuild reshuffles anyway. Characterization
  // only — the fix is a state-machine change with its own impact analysis.
  const h = await createPlayerHarness(t, { tracks: ALL, random: () => 0 })
  await h.player.setMode('shuffle')
  await h.player.playQueue(['a', 'b', 'c'], 0)
  assert.equal(h.snap().trackId, 'a', 'current track before the edit')
  assert.equal(h.snap().cursor, 2, 'the current entry sits at the end of the shuffled order')

  await h.player.enqueue(['d'], 'next')

  const snap = h.snap()
  assert.deepEqual(snap.queue, ['a', 'b', 'c', 'd'], 'the entry landed at the tail of the user queue')
  assert.notEqual(snap.queue[1], 'd', 'it is not next to the current track, so "play next" was not honoured')
  assert.equal(snap.trackId, 'a', 'the current track itself was preserved')
})

test('DIAGNOSTIC (known behaviour, B13): a duplicate entry takes the cursor of the first copy', async (t) => {
  // Registered as B13 / tracked as D-09. Entry identity is the array index, so
  // `indexOf` resolves any duplicate to its first occurrence.
  const h = await createPlayerHarness(t, { tracks: ALL })
  await h.player.playQueue(['a', 'b', 'a'], 0)
  await h.player.next()
  await h.player.next()
  assert.equal(h.snap().cursor, 2, 'the second copy of "a" is current')

  await h.player.move(0, 1)

  assert.deepEqual(h.snap().queue, ['b', 'a', 'a'])
  assert.equal(h.snap().trackId, 'a', 'the same id is still current')
  assert.equal(h.snap().cursor, 1, 'but the cursor jumped to the first copy of that id')
})
