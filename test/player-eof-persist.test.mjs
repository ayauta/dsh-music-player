/**
 * L1 — end-of-track events and the persisted resume state.
 *
 * The engine adapter is what delivers mpv's `end-file` / `playlist-pos` events,
 * so pushing those events in is the same entry point mpv uses. `handleEndOfTrack`
 * is never called directly: it is reached through the event, which is the only
 * way the production code reaches it too.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { createPlayerHarness } from './support/player-harness.mjs'

/** Let the event handler's promises drain (it is invoked as `void`). */
const settle = () => new Promise((done) => setTimeout(done, 0))

test('seek clamps to the track duration and never goes negative', async (t) => {
  const h = await createPlayerHarness(t)
  await h.player.playQueue(['a'], 0)

  await h.player.seek(99_000)
  assert.equal(h.snap().positionMs, 8000, 'clamped to the seeded duration')

  await h.player.seek(-5)
  assert.equal(h.snap().positionMs, 0)
})

test('mpv advancing on its own moves the cursor without a reload', async (t) => {
  const h = await createPlayerHarness(t)
  await h.player.playQueue(['a', 'b', 'c'], 0)
  const loads = h.engine.of('load').length

  h.engine.emit({ type: 'pos', value: 1 })
  await settle()

  assert.equal(h.snap().trackId, 'b', 'the cursor followed mpv')
  assert.equal(h.snap().positionMs, 0, 'the new track starts at zero')
  assert.equal(h.engine.of('load').length, loads, 'auto-advance is mpv-owned, not reloaded by us')
})

test('end of the last entry wraps in mode all', async (t) => {
  const h = await createPlayerHarness(t)
  await h.player.playQueue(['a', 'b'], 1)
  const loads = h.engine.of('load').length

  h.engine.emit({ type: 'endFile', reason: 'eof' })
  await settle()

  assert.equal(h.snap().trackId, 'a', 'the wrap restarted at the head')
  assert.equal(h.engine.of('load').length, loads + 1, 'and it did reload')
})

test('end of the last entry stops in mode sequence', async (t) => {
  const h = await createPlayerHarness(t)
  await h.player.setMode('sequence')
  await h.player.playQueue(['a', 'b'], 1)
  const loads = h.engine.of('load').length

  h.engine.emit({ type: 'endFile', reason: 'eof' })
  await settle()
  // mpv reaches EOF with --keep-open=no: it reports itself idle and drops the
  // file. The player reads that from the engine snapshot, not from the event.
  h.engine.state.idleActive = true
  h.engine.state.currentFile = null
  await settle()

  const snap = h.snap()
  assert.equal(h.engine.of('load').length, loads, 'sequence does not wrap')
  assert.equal(snap.remainingMs, 0, 'the snapshot reports the track as finished')
  assert.equal(snap.playing, false, 'and playback is not reported as running')
})

test('end of the last entry replays the same track in mode one', async (t) => {
  const h = await createPlayerHarness(t)
  await h.player.setMode('one')
  await h.player.playQueue(['a', 'b'], 0)
  const loads = h.engine.of('load').length

  h.engine.emit({ type: 'endFile', reason: 'eof' })
  await settle()

  assert.equal(h.snap().trackId, 'a', 'repeat-one stayed on the same track')
  assert.equal(h.snap().positionMs, 0, 'and restarted it from the beginning')
  assert.equal(h.engine.of('load').length, loads + 1)
})

test('end of the last entry reshuffles in mode shuffle', async (t) => {
  const h = await createPlayerHarness(t, { random: () => 0 })
  await h.player.setMode('shuffle')
  await h.player.playQueue(['a', 'b', 'c'], 2) // the last entry is playing
  const loads = h.engine.of('load').length

  h.engine.emit({ type: 'endFile', reason: 'eof' })
  await settle()

  const snap = h.snap()
  assert.equal(h.engine.of('load').length, loads + 1, 'a fresh round reloaded a file')
  assert.ok(['a', 'b', 'c'].includes(snap.trackId), 'the new round started inside the queue')
  assert.equal(snap.cursor, 0, 'a new shuffle round starts at index 0')
})

test('a decode error is recorded and the transport skips forward', async (t) => {
  const h = await createPlayerHarness(t)
  await h.player.playQueue(['a', 'b'], 0)

  h.engine.emit({ type: 'endFile', reason: 'error', error: 'boom' })
  await settle()

  assert.equal(h.snap().error, 'boom', 'the error surfaced in the snapshot')
  assert.equal(h.snap().trackId, 'b', 'the broken track was skipped')
})

test('the resume state survives a dispose/init round trip without auto-playing', async (t) => {
  const h = await createPlayerHarness(t)
  await h.player.playQueue(['a', 'b', 'c'], 1)
  await h.player.setMode('sequence')
  await h.player.setVolume(40)
  await h.player.seek(2000)
  await h.dispose()

  const saved = h.db.getState('player')
  assert.equal(saved.cursorId, 'b', 'the persisted shape stores the current id, not an index')

  const h2 = await createPlayerHarness(t, { stored: { player: saved } })
  const snap = h2.snap()

  assert.deepEqual(snap.queue, ['a', 'b', 'c'])
  assert.equal(snap.trackId, 'b')
  assert.equal(snap.cursor, 1)
  assert.equal(snap.mode, 'sequence')
  assert.equal(snap.volume, 40)
  assert.equal(snap.positionMs, 2000)
  assert.equal(h2.engine.of('load').length, 0, 'restoring arms the state but does not start playback')
})

test('malformed stored state degrades to defaults instead of throwing', async (t) => {
  const h = await createPlayerHarness(t, {
    stored: {
      player: {
        queue: ['a', 'ghost', null],
        cursorId: 'ghost',
        mode: 'bogus',
        volume: 'loud',
        muted: 'yes',
        positionMs: 'soon',
      },
    },
  })

  const snap = h.snap()
  assert.deepEqual(snap.queue, ['a'], 'unresolvable ids were dropped')
  assert.equal(snap.cursor, 0)
  assert.equal(snap.trackId, 'a')
  assert.equal(snap.mode, 'all', 'an unknown mode falls back to the default')
  assert.equal(snap.volume, 100, 'a non-numeric volume falls back to 100')
  assert.equal(snap.muted, true, 'muted is coerced, not trusted')
  assert.equal(snap.positionMs, 0)
})

test('playing again after a sequence queue ends starts over from the top', async (t) => {
  // The sequence branch records "finished" as position = duration on the last
  // entry. Playing again must not reuse that as a seek target — it would land
  // on the end of the last track and stop immediately.
  const h = await createPlayerHarness(t)
  await h.player.setMode('sequence')
  await h.player.playQueue(['a', 'b'], 1)
  h.engine.state.idleActive = true
  h.engine.state.currentFile = null
  h.engine.emit({ type: 'endFile', reason: 'eof' })
  await settle()

  assert.equal(h.snap().playing, false, 'the queue ended')
  assert.equal(h.snap().trackId, 'b', 'the playhead is still on the finished track')
  assert.equal(h.snap().positionMs, h.snap().durationMs, 'and it is recorded at the end')

  const loads = h.engine.of('load').length
  await h.player.resume()

  const load = h.engine.of('load').at(-1)
  assert.equal(h.engine.of('load').length, loads + 1, 'playing loaded a file')
  assert.deepEqual(load.args[0], [h.pathOf('a'), h.pathOf('b')], 'the queue restarts from the top')
  assert.equal(load.args[2], 0, 'and seeks to 0, not to the old end position')
  assert.equal(h.snap().trackId, 'a')
  assert.equal(h.snap().cursor, 0)
  assert.equal(h.snap().positionMs, 0)
})

test('resuming a paused track continues where it stopped', async (t) => {
  const h = await createPlayerHarness(t)
  await h.player.playQueue(['a', 'b'], 0)
  await h.player.seek(4000)
  await h.player.pause()
  const loads = h.engine.of('load').length

  await h.player.resume()

  assert.equal(h.snap().paused, false, 'playback resumed')
  assert.equal(h.snap().trackId, 'a', 'on the same track')
  assert.equal(h.snap().positionMs, 4000, 'from the paused position')
  assert.equal(h.engine.of('load').length, loads, 'without reloading the file')
})

test('restoreQueue:false starts empty and honours the default volume', async (t) => {
  const h = await createPlayerHarness(t, {
    stored: { player: { queue: ['a', 'b'], cursorId: 'a', mode: 'sequence', volume: 10 } },
    prefs: { restoreQueue: false, defaultVolume: 55 },
  })

  const snap = h.snap()
  assert.deepEqual(snap.queue, [], 'the stored queue was deliberately ignored')
  assert.equal(snap.trackId, null)
  assert.equal(snap.mode, 'all', 'even the stored mode is ignored without a queue')
  assert.equal(snap.volume, 55, 'the configured default volume applies instead')
})

test('a reordered queue keeps the auto-advance mapping anchored', async (t) => {
  // Rewriting the queue moves the cursor while mpv keeps playing the same file
  // at its own playlist-pos. If the anchor between the two is not refreshed, the
  // next `pos` event lands one entry off — the snapshot then names a track that
  // is not the one that started playing.
  const h = await createPlayerHarness(t, { tracks: [
    { id: 'a', durationMs: 3000 }, { id: 'b', durationMs: 3000 }, { id: 'c', durationMs: 3000 },
  ] })
  await h.player.playQueue(['a', 'b', 'c'], 1)   // b is playing, cursor 1
  await h.player.move(0, 2)                      // queue [b, c, a], cursor 0
  assert.equal(h.snap().cursor, 0)
  assert.equal(h.snap().trackId, 'b', 'the reorder kept the same track playing')

  h.engine.emit({ type: 'pos', value: 1 })       // mpv moves to its own slot 1
  await settle()

  assert.equal(h.snap().cursor, 1, 'the cursor advanced by one, not by the stale anchor')
  assert.equal(h.snap().trackId, 'c', 'the snapshot follows the reordered queue')
})
