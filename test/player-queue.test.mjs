/**
 * L1 — the queue as the single visible play order.
 *
 * Every assertion here goes through the player's public surface (`playQueue`,
 * `enqueue`, `removeAt`, `move`, `setQueue`, `clear`, `setMode`, `next`,
 * `snapshot`) plus the engine event stream. The fake engine is the adapter, so
 * "what mpv was told" is the observable, not how the player is written.
 *
 * The queue is unique: a trackId appears at most once, and the array a caller
 * reads is the order playback actually follows.
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

const settle = () => new Promise((done) => setTimeout(done, 0))

/* ── queue contents ───────────────────────────────────────── */

test('playQueue keeps one entry per track and drops unusable ids', async (t) => {
  const h = await createPlayerHarness(t, { tracks: [...ALL, { id: 'gone', missing: true }] })

  await h.player.playQueue(['a', 'b', 'a', 'gone', null, 'c'], 0)

  assert.deepEqual(h.snap().queue, ['a', 'b', 'c'], 'duplicates and unusable ids are gone')
  assert.equal(h.snap().trackId, 'a')
  assert.deepEqual(h.engine.loadedFiles(), [h.pathOf('a'), h.pathOf('b'), h.pathOf('c')],
    'the mirrored playlist has no holes, so its indices line up with the queue')
})

test('a repeated track never enters the queue twice', async (t) => {
  const h = await createPlayerHarness(t, { tracks: ALL })
  await h.player.playQueue(['a', 'b'], 0)

  await h.player.enqueue(['b', 'b', 'x'], 'end')

  assert.deepEqual(h.snap().queue, ['a', 'b', 'x'], 'the batch was deduped and "b" already existed')
})

test('a track that disappears never shifts the mpv mirror', async (t) => {
  const h = await createPlayerHarness(t, { tracks: ALL })
  await h.player.playQueue(['a', 'b', 'c'], 0)

  h.markMissing('b')
  await h.player.enqueue(['x'], 'end')

  assert.deepEqual(h.snap().queue, ['a', 'c', 'x'], 'the vanished entry was dropped from the queue')
  assert.deepEqual(h.engine.of('rewriteTail').at(-1).args[0].tail, [h.pathOf('c'), h.pathOf('x')],
    'and the mirror has no hole, so its indices still line up with the queue')
})

test('enqueue end ignores a track that is already queued', async (t) => {
  const h = await createPlayerHarness(t, { tracks: ALL })
  await h.player.playQueue(['a', 'b'], 0)
  const loads = h.engine.of('load').length

  await h.player.enqueue(['b'], 'end')

  assert.deepEqual(h.snap().queue, ['a', 'b'])
  assert.equal(h.engine.of('load').length, loads, 'a no-op edit does not reload')
})

test('enqueue next moves an existing entry instead of duplicating it', async (t) => {  const h = await createPlayerHarness(t, { tracks: ALL })
  await h.player.playQueue(['a', 'b', 'c', 'd'], 0)

  await h.player.enqueue(['d'], 'next')

  assert.deepEqual(h.snap().queue, ['a', 'd', 'b', 'c'], 'the existing entry moved')
  assert.equal(h.snap().trackId, 'a', 'the playing track did not move')
  await h.player.next()
  assert.equal(h.snap().trackId, 'd')
  assert.equal(h.engine.state.currentFile, h.pathOf('d'), 'mpv opened the moved entry')
})

test('play next on the playing track changes nothing', async (t) => {
  const h = await createPlayerHarness(t, { tracks: ALL })
  await h.player.playQueue(['a', 'b'], 0)

  await h.player.enqueue(['a'], 'next')

  assert.deepEqual(h.snap().queue, ['a', 'b'])
  assert.equal(h.snap().trackId, 'a')
})

/* ── structural edits keep the playing track ──────────────── */

test('move keeps the current track, its position, and the open file', async (t) => {
  const h = await createPlayerHarness(t, { tracks: ALL })
  await h.player.playQueue(['a', 'b', 'c'], 1)
  await h.player.seek(2500)
  const loads = h.engine.of('load').length

  await h.player.move(0, 2)

  const snap = h.snap()
  assert.deepEqual(snap.queue, ['b', 'c', 'a'], 'the visible order really changed')
  assert.equal(snap.trackId, 'b', 'the same track is still current')
  assert.equal(snap.cursor, 0, 'the cursor followed the track')
  assert.equal(snap.positionMs, 2500, 'the position survived the reorder')
  assert.equal(h.engine.of('load').length, loads, 'reordering did not reload the file')
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

test('removing the playing entry advances to the next one', async (t) => {
  const h = await createPlayerHarness(t, { tracks: ALL })
  await h.player.playQueue(['a', 'b', 'c'], 1)

  await h.player.removeAt(1)

  const snap = h.snap()
  assert.deepEqual(snap.queue, ['a', 'c'], 'the playing entry is gone from the queue')
  assert.equal(snap.trackId, 'c', 'playback continued with the successor')
  assert.equal(snap.cursor, 1, 'the successor took the same slot')
  assert.equal(h.engine.state.currentFile, h.pathOf('c'), 'and mpv really opened it')
})

test('removing the last playing entry stops but keeps the queue', async (t) => {
  const h = await createPlayerHarness(t, { tracks: ALL })
  await h.player.playQueue(['a', 'b'], 1)

  await h.player.removeAt(1)

  const snap = h.snap()
  assert.deepEqual(snap.queue, ['a'], 'the removed entry is really gone, the rest stays')
  assert.equal(snap.trackId, null, 'nothing is current any more')
  assert.equal(snap.cursor, -1)
  assert.equal(snap.playing, false)
  assert.equal(h.engine.state.currentFile, null, 'mpv was stopped')
})

test('removing the only entry leaves an empty queue and no current track', async (t) => {
  const h = await createPlayerHarness(t, { tracks: ALL })
  await h.player.playQueue(['a'], 0)

  await h.player.removeAt(0)

  assert.deepEqual(h.snap().queue, [])
  assert.equal(h.snap().trackId, null)
  assert.equal(h.snap().cursor, -1)
  assert.equal(h.snap().playing, false)
})

/* ── pause discipline ─────────────────────────────────────── */

test('a paused reload reports paused before the op returns', async (t) => {
  // Same lag as `stop`: mpv accepts `set_property pause` and reports the change
  // a moment later. Returning in between reported "playing" for an edit that
  // was supposed to keep the player paused.
  const h = await createPlayerHarness(t, { tracks: ALL, engineState: { slowPauseMs: 30 } })
  await h.player.playQueue(['a', 'b', 'c'], 1)
  await h.player.pause()
  await new Promise((done) => setTimeout(done, 40)) // let the engine report the pause

  await h.player.setQueue(['x', 'y']) // the playing entry is dropped → forced reload

  const snap = h.snap()
  assert.equal(snap.trackId, 'x', 'the reload happened')
  assert.equal(snap.paused, true, 'and it is reported as paused')
  assert.equal(snap.playing, false)
})

test('queue edits never turn a paused player into a playing one', async (t) => {
  const h = await createPlayerHarness(t, { tracks: ALL })
  await h.player.playQueue(['a', 'b', 'c'], 1)
  await h.player.pause()

  await h.player.move(0, 2)
  assert.equal(h.snap().paused, true, 'a reorder keeps the pause')

  await h.player.removeAt(h.snap().cursor)
  assert.equal(h.snap().paused, true, 'replacing the playing entry keeps the pause')
  assert.equal(h.snap().trackId, 'c', 'and it really loaded the successor')

  await h.player.setQueue(['a', 'c', 'x'])
  assert.equal(h.snap().paused, true, 'a queue replacement keeps the pause')
  assert.equal(h.snap().playing, false, 'nothing is playing')
})

/* ── queue replacement ────────────────────────────────────── */

test('setQueue keeps a surviving current track without reloading', async (t) => {
  const h = await createPlayerHarness(t, { tracks: ALL })
  await h.player.playQueue(['a', 'b', 'c'], 1)
  const loads = h.engine.of('load').length

  await h.player.setQueue(['x', 'b', 'y'])

  assert.equal(h.snap().trackId, 'b', 'the current track survived a queue replacement')
  assert.deepEqual(h.snap().queue, ['x', 'b', 'y'])
  assert.equal(h.engine.of('load').length, loads, 'a surviving track is not reloaded')
})

test('setQueue makes mpv follow when the current track is dropped', async (t) => {
  const h = await createPlayerHarness(t, { tracks: ALL })
  await h.player.playQueue(['a', 'b', 'c'], 1)

  await h.player.setQueue(['x', 'y'])

  const snap = h.snap()
  assert.deepEqual(snap.queue, ['x', 'y'])
  assert.equal(snap.trackId, 'x', 'the snapshot reports the new head')
  assert.equal(snap.cursor, 0)
  assert.equal(h.engine.state.currentFile, h.pathOf('x'), 'mpv is playing the track the snapshot names')
  assert.equal(snap.trackPath, h.engine.state.currentFile, 'the two fields agree')
})

test('setQueue on a stopped player arms the queue without playing', async (t) => {
  const h = await createPlayerHarness(t, { tracks: ALL })
  await h.player.playQueue(['a'], 0)
  await h.player.clear()
  const loads = h.engine.of('load').length

  await h.player.setQueue(['x', 'y'])

  assert.deepEqual(h.snap().queue, ['x', 'y'])
  assert.equal(h.snap().trackId, null, 'nothing became current')
  assert.equal(h.snap().playing, false)
  assert.equal(h.engine.of('load').length, loads, 'and no file was opened')
})

/* ── shuffle: only the future is randomised ───────────────── */

test('entering shuffle keeps the played history and the current slot', async (t) => {
  const h = await createPlayerHarness(t, { tracks: ALL, random: () => 0 })
  await h.player.playQueue(['a', 'b', 'c', 'd'], 1)
  const loads = h.engine.of('load').length

  await h.player.setMode('shuffle')

  const snap = h.snap()
  assert.deepEqual(snap.queue.slice(0, 2), ['a', 'b'], 'history and the current entry stay in place')
  assert.deepEqual(snap.queue.slice(2).sort(), ['c', 'd'], 'only the upcoming entries were permuted')
  assert.equal(snap.trackId, 'b', 'the playing track is unchanged')
  assert.equal(snap.cursor, 1, 'and so is its slot')
  assert.equal(h.engine.of('load').length, loads, 'mode switching does not reload')
  assert.equal(h.engine.state.currentFile, h.pathOf('b'))
})

test('leaving shuffle keeps the order the user can see', async (t) => {
  const h = await createPlayerHarness(t, { tracks: ALL, random: () => 0 })
  await h.player.playQueue(['a', 'b', 'c', 'd'], 0)
  await h.player.setMode('shuffle')
  const shuffled = h.snap().queue

  await h.player.setMode('sequence')

  assert.deepEqual(h.snap().queue, shuffled, 'no hidden order was restored')
  assert.equal(h.snap().trackId, 'a')
})

test('manual play next wins over the shuffled tail', async (t) => {
  const h = await createPlayerHarness(t, { tracks: ALL, random: () => 0 })
  await h.player.playQueue(['a', 'b', 'c', 'd'], 0)
  await h.player.setMode('shuffle')

  await h.player.enqueue(['d'], 'next')

  assert.equal(h.snap().queue[1], 'd', 'the requested entry is the next slot, not a reshuffled one')
  await h.player.next()
  assert.equal(h.snap().trackId, 'd')
  assert.equal(h.engine.state.currentFile, h.pathOf('d'), 'mpv opened it')
})

/* ── clear ─────────────────────────────────────────────────── */

test('a stop is not reported as done before the engine drops the file', async (t) => {
  // mpv answers `stop` before it reports `path: null` / `idle-active: true`. A
  // snapshot taken in between said "no current track, still playing <old file>",
  // which is exactly the contradiction the queue work is meant to remove.
  const h = await createPlayerHarness(t, { tracks: ALL, engineState: { slowStopMs: 30 } })
  await h.player.playQueue(['a', 'b'], 0)

  await h.player.clear()

  const snap = h.snap()
  assert.equal(snap.trackId, null)
  assert.equal(snap.engineFile, null, 'the engine had not dropped the file yet when the op returned')
  assert.equal(snap.playing, false, 'and it is not reported as playing')
})

test('clear stops playback and empties the mpv playlist', async (t) => {
  const h = await createPlayerHarness(t, { tracks: ALL })
  await h.player.playQueue(['a', 'b'], 0)
  await h.player.seek(1500)

  await h.player.clear()

  const snap = h.snap()
  assert.deepEqual(snap.queue, [])
  assert.equal(snap.trackId, null)
  assert.equal(snap.cursor, -1)
  assert.equal(snap.positionMs, 0)
  assert.equal(snap.playing, false)
  assert.equal(h.engine.state.currentFile, null, 'mpv stopped')
  assert.equal(h.engine.names().includes('command'), true)
  const commands = h.engine.of('command').map((call) => call.args[0])
  assert.ok(commands.includes('stop'), 'playback was stopped')
  assert.ok(commands.includes('playlist-clear'), 'the mpv playlist was cleared')
})

test('resuming after the queue stops starts from the head', async (t) => {
  const h = await createPlayerHarness(t, { tracks: ALL })
  await h.player.playQueue(['a', 'b'], 1)
  await h.player.removeAt(1)          // the last entry was playing: stop, keep "a"
  await h.player.pause()
  const loads = h.engine.of('load').length

  await h.player.resume()

  assert.equal(h.snap().trackId, 'a', 'playback restarts at the head')
  assert.equal(h.engine.of('load').length, loads + 1)
})

/* ── events ───────────────────────────────────────────────── */

test('mpv advancing on its own moves the cursor through the visible order', async (t) => {
  const h = await createPlayerHarness(t, { tracks: ALL })
  await h.player.playQueue(['a', 'b', 'c'], 0)

  h.engine.emit({ type: 'pos', value: 1 })
  await settle()

  assert.equal(h.snap().trackId, 'b')
  assert.equal(h.snap().cursor, 1, 'the cursor indexes the same array the caller reads')
})
