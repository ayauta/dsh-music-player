/**
 * L1 — the player ↔ engine mirror contract.
 *
 * These tests pin the seam that C2 introduced: the player owns the queue and
 * the current entry; the engine owns mpv's playlist and only answers `ok` once
 * the playlist really reached the requested shape. Assertions are about the
 * state mpv ends up in (`engine.playlist()`), not about call counts.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { createPlayerHarness } from './support/player-harness.mjs'

const ALL = [
  { id: 'a', durationMs: 8000 },
  { id: 'b', durationMs: 3000 },
  { id: 'c', durationMs: 3000 },
  { id: 'd', durationMs: 3000 },
]

const settle = () => new Promise((done) => setTimeout(done, 0))

test('a tail rewrite leaves mpv holding exactly the visible queue', async (t) => {
  const h = await createPlayerHarness(t, { tracks: ALL })
  await h.player.playQueue(['a', 'b'], 0)

  await h.player.enqueue(['c', 'd'], 'end')

  assert.deepEqual(h.engine.playlist(), [h.pathOf('a'), h.pathOf('b'), h.pathOf('c'), h.pathOf('d')],
    'mpv holds the whole queue, current first')
  assert.deepEqual(h.snap().queue, ['a', 'b', 'c', 'd'])
  assert.equal(h.snap().trackId, 'a')
})

test('a rewrite whose tail was computed for an older current is re-issued, not applied twice', async (t) => {
  // mpv finishes the current file between "player decided the tail" and
  // "engine looked at the playlist". Applying the stale tail would duplicate
  // the new current entry; the correct move is to adopt the new current and
  // rewrite once more from there.
  const h = await createPlayerHarness(t, { tracks: ALL })
  await h.player.playQueue(['a', 'b', 'c'], 0)

  h.engine.moveBeforeNextWrite()
  await h.player.enqueue(['d'], 'end')

  assert.deepEqual(h.engine.playlist(), [h.pathOf('a'), h.pathOf('b'), h.pathOf('c'), h.pathOf('d')],
    'the playlist has no duplicated entry')
  assert.equal(h.snap().trackId, 'b', 'the track mpv moved on to is now current')
  assert.equal(h.snap().cursor, 1, 'and the cursor followed it')
  assert.equal(h.engine.of('rewriteTail').length, 2, 'exactly one corrective rewrite was issued')
})

test('an advance during the write lands on the next entry, anchored', async (t) => {
  const h = await createPlayerHarness(t, { tracks: ALL })
  await h.player.playQueue(['a', 'b', 'c'], 0)

  h.engine.moveDuringNextWrite()
  await h.player.enqueue(['d'], 'end')

  const snap = h.snap()
  assert.equal(snap.trackId, 'b', 'the current followed the file that started playing')
  assert.equal(snap.cursor, 1)

  h.engine.emit({ type: 'pos', value: h.engine.state.playlistPos + 1 })
  await settle()
  assert.equal(h.snap().trackId, 'c', 'the next auto-advance still maps onto the queue')
})

test('a failed rewrite changes nothing and keeps the anchor', async (t) => {
  const h = await createPlayerHarness(t, { tracks: ALL })
  await h.player.playQueue(['a', 'b', 'c'], 0)

  h.engine.failNextWrite('timeout')
  await h.player.enqueue(['d'], 'end')

  assert.deepEqual(h.snap().queue, ['a', 'b', 'c', 'd'], 'the queue edit still happened')
  assert.deepEqual(h.engine.playlist(), [h.pathOf('a'), h.pathOf('b'), h.pathOf('c')],
    'but mpv was not told a lie about it')
  assert.equal(h.snap().trackId, 'a')

  h.engine.emit({ type: 'pos', value: 1 })
  await settle()
  assert.equal(h.snap().trackId, 'b', 'the anchor still maps mpv onto the queue')
})

test('a stopped engine does not break queue edits', async (t) => {
  const h = await createPlayerHarness(t, { tracks: ALL })
  await h.player.playQueue(['a', 'b'], 0)
  h.engine.state.status = 'stopped'

  await h.player.enqueue(['c'], 'end')

  assert.deepEqual(h.snap().queue, ['a', 'b', 'c'])
  assert.equal(h.snap().trackId, 'a', 'the player keeps its own state')
})

test('loading a queue confirms the whole playlist, not just the first file', async (t) => {
  const h = await createPlayerHarness(t, { tracks: ALL })

  await h.player.playQueue(['a', 'b', 'c'], 1)

  assert.deepEqual(h.engine.playlist(), [h.pathOf('b'), h.pathOf('c')],
    'the mirror starts at the chosen entry')
  assert.equal(h.snap().cursor, 1)
  assert.equal(h.snap().trackId, 'b')
})

test('a playlist with the right count but the wrong files is not reported as success', async (t) => {
  // The engine reads the entries back before answering `ok`. When they do not
  // match, the player must not believe the mirror — and must not move its
  // anchor on the strength of it.
  const h = await createPlayerHarness(t, { tracks: ALL })
  await h.player.playQueue(['a', 'b', 'c'], 0)

  h.engine.corruptNextWrite('swap')
  await h.player.enqueue(['d'], 'end')

  assert.deepEqual(h.snap().queue, ['a', 'b', 'c', 'd'], 'the queue edit itself still happened')
  assert.equal(h.snap().trackId, 'a', 'the current entry did not move on a failed confirmation')

  h.engine.emit({ type: 'pos', value: 1 })
  await settle()
  assert.equal(h.snap().trackId, 'b', 'the anchor was left where it was, so pos still maps correctly')
})

test('an entry the queue does not know is never turned into an anchor', async (t) => {
  const h = await createPlayerHarness(t, { tracks: ALL })
  await h.player.playQueue(['a', 'b', 'c'], 0)

  h.engine.reportUnknownSeen()
  await h.player.enqueue(['d'], 'end')

  assert.equal(h.snap().cursor, 0, 'the reported entry is not in the queue, so nothing was adopted')
  assert.equal(h.snap().trackId, 'a')

  h.engine.emit({ type: 'pos', value: 1 })
  await settle()
  assert.equal(h.snap().trackId, 'b', 'the old anchor is still the one in force')
})

test('mode one mirrors a single entry and leaves the rest of the queue alone', async (t) => {
  const h = await createPlayerHarness(t, { tracks: ALL })
  await h.player.playQueue(['a', 'b', 'c'], 0)

  await h.player.setMode('one')
  assert.deepEqual(h.engine.playlist(), [h.pathOf('a'), h.pathOf('b'), h.pathOf('c')],
    'switching mode does not rewrite the playlist')
  await h.player.next() // manual next still advances

  assert.equal(h.snap().trackId, 'b')
  assert.deepEqual(h.engine.playlist(), [h.pathOf('b')],
    'repeat-one mirrors one entry, which is what keeps a manual next able to advance')
})
