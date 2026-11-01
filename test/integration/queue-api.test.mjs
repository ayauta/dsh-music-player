/**
 * L2 — queue reads agree with each other.
 *
 * `status.player.queue` (ids, from the player) and `queue.list` (rows, joined
 * against the library) are two reads of the same thing, and the client merges
 * them by array position. These tests pin the part that must never drift: same
 * ids, same order, same metadata for the same id — plus the rule that a write
 * op's own snapshot is already authoritative, so a caller need not re-poll.
 *
 * Scope note: agreeing with each other is NOT the same as matching mpv. The
 * `trackId`/`trackPath` ↔ `engine.currentFile` question is a separate contract
 * and it is covered by its own test at the bottom (B14). Do not treat this file
 * as a substitute for that one.
 *
 * Isolated host: temporary DSH_HOME, own database, `--ao=null`, in-process
 * dispatch, no HTTP. Silent.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { createIsolatedHost } from '../support/host.mjs'

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

test('queue reads and write results agree (isolated, silent)', { timeout: 120000 }, async (t) => {
  const holder = { host: null }
  t.after(async () => { if (holder.host !== null) await holder.host.dispose() })

  holder.host = await createIsolatedHost()
  const { call, tracks } = holder.host

  const byTitle = new Map(tracks.map((track) => [track.title, track]))
  const a = byTitle.get('测试甲')
  const b = byTitle.get('测试乙')
  const c = byTitle.get('测试丙')
  assert.ok(a && b && c, `fixture tracks missing: got ${tracks.map((x) => x.title).join(', ')}`)

  const status = () => call('status')
  const queueIds = async () => (await status()).player.queue
  const rows = async () => {
    const list = await call('queue.list', {})
    return Array.isArray(list) ? list : []
  }

  async function waitForEngineFile(path, timeoutMs = 9000) {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      const current = (await status()).engine.currentFile
      if (current === path) return true
      await sleep(100)
    }
    return false
  }

  await t.test('queue.list mirrors the snapshot ids, in order', async () => {
    await call('queue.play', { ids: [a.id, b.id, c.id], startIndex: 0 })

    assert.deepEqual(await queueIds(), [a.id, b.id, c.id], 'the snapshot reports the queue it was given')
    const list = await rows()
    assert.deepEqual(list.map((row) => row.id), [a.id, b.id, c.id], 'row order matches id order')
    assert.deepEqual(list.map((row) => row.title), ['测试甲', '测试乙', '测试丙'], 'and each row carries its own title')
  })

  await t.test('enqueue next is visible in both reads at the same offset', async () => {
    await call('queue.play', { ids: [a.id, c.id], startIndex: 0 })
    const cursor = (await status()).player.cursor

    await call('queue.enqueue', { ids: [b.id], position: 'next' })

    const ids = await queueIds()
    assert.deepEqual(ids, [a.id, b.id, c.id], 'the entry landed right after the current one')
    assert.equal(ids[cursor + 1], b.id)
    const list = await rows()
    assert.deepEqual(list.map((row) => row.id), ids, 'rows still line up with ids')
    assert.equal(list[cursor + 1].title, '测试乙', 'and the row at that offset is the enqueued track')
  })

  await t.test('a write op returns an authoritative snapshot', async () => {
    await call('queue.play', { ids: [a.id, b.id, c.id], startIndex: 0 })
    const enqueued = await call('queue.enqueue', { ids: [b.id], position: 'end' })
    const after = (await status()).player

    assert.deepEqual(enqueued.queue, after.queue, 'the returned queue is current')
    assert.equal(enqueued.cursor, after.cursor, 'the returned cursor is current')
    assert.equal(enqueued.mode, after.mode)
    assert.equal(enqueued.trackId, after.trackId, 'no re-poll was needed to learn the new state')
  })

  await t.test('move and remove agree across both reads', async () => {
    await call('queue.play', { ids: [a.id, b.id, c.id], startIndex: 0 })
    await call('queue.move', { from: 0, to: 2 })

    let ids = await queueIds()
    assert.deepEqual(ids, [b.id, c.id, a.id], 'the order moved')
    assert.deepEqual((await rows()).map((row) => row.id), ids)

    await call('queue.remove', { index: 1 })
    ids = await queueIds()
    assert.deepEqual(ids, [b.id, a.id], 'the middle entry was removed')
    assert.deepEqual((await rows()).map((row) => row.id), ids)
  })

  await t.test('queue rows carry the same metadata as the library row', async () => {
    await call('queue.play', { ids: [a.id], startIndex: 0 })
    const [row] = await rows()
    const [libraryRow] = await call('library.list', { view: 'all', query: '测试甲' })

    for (const field of ['title', 'artist', 'durationMs', 'ext', 'hasCover', 'mtimeMs']) {
      assert.deepEqual(row[field], libraryRow[field], `${field} matches the library read`)
    }
  })

  await t.test('queue.clear empties both reads', async () => {
    await call('queue.clear', {})
    assert.deepEqual(await queueIds(), [])
    assert.deepEqual(await rows(), [])
  })

  await t.test('DIAGNOSTIC (known behaviour, B14, real mpv): queue.set can desync the cursor from mpv', async () => {
    // Registered as B14. Reached through the public op when the current entry is
    // dropped from the new queue; the shipped client only ever calls it with the
    // current entry included, which is why this has not been seen in the UI.
    await call('queue.play', { ids: [a.id, b.id, c.id], startIndex: 1 })
    assert.equal(await waitForEngineFile(b.path), true, 'mpv opened the second track')

    await call('queue.set', { ids: [a.id, c.id] })

    const player = (await status()).player
    const engine = (await status()).engine
    assert.deepEqual(player.queue, [a.id, c.id])
    assert.equal(player.trackId, a.id, 'the snapshot reports the new head')
    assert.equal(engine.currentFile, b.path, 'while mpv is still playing the dropped track')
    assert.notEqual(player.trackPath, engine.currentFile, 'the two fields in one snapshot contradict each other')
  })

  await t.test('B10: play next opens the enqueued file (real mpv, shuffle)', async () => {
    // The acceptance rule is about the file mpv opens, not about the queue array:
    // playing A, "play next" C, press next -> C must be the sound.
    await call('player.mode', { mode: 'shuffle' })
    await call('queue.play', { ids: [a.id, b.id, c.id], startIndex: 0 })
    assert.equal(await waitForEngineFile(a.path), true, 'mpv opened the first track')

    await call('queue.enqueue', { ids: [c.id], position: 'next' })

    const queued = (await status()).player
    assert.equal(queued.queue[queued.queue.indexOf(a.id) + 1], c.id, 'the entry sits right after the current one')

    await call('player.next')
    assert.equal(await waitForEngineFile(c.path), true, 'mpv opened the enqueued file')

    const after = (await status()).player
    assert.equal(after.trackId, c.id, 'the snapshot agrees with the file that is playing')
    assert.equal(after.trackPath, c.path, 'and so does the reported path')
  })
})
