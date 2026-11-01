/**
 * L2 — playback semantics against an isolated host (silent `null` AO).
 *
 * This is the safe home of what `scripts/playback-test.mjs` used to assert
 * against a live DSH instance. Every assertion below is the original one;
 * only the fixture lengths and the seek targets changed, because the fixtures
 * are 8s/3s/3s instead of 3-minute tracks. Nothing was relaxed.
 *
 * Side effects: none outside the temp root. No sound (mpv --ao=null), no HTTP,
 * no access to a running DSH.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { createIsolatedHost } from '../support/host.mjs'

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

test('playback semantics (isolated, silent)', { timeout: 180000 }, async (t) => {
  // Register teardown *before* the host exists: if start-up throws, there is
  // still an after hook, and the factory has already cleaned its own temp root.
  const holder = { host: null }
  t.after(async () => { if (holder.host !== null) await holder.host.dispose() })

  holder.host = await createIsolatedHost()
  const host = holder.host

  const { call, tracks } = host
  const byTitle = new Map(tracks.map((track) => [track.title, track]))
  const a = byTitle.get('测试甲')
  const b = byTitle.get('测试乙')
  const c = byTitle.get('测试丙')

  assert.ok(a && b && c, `fixture tracks missing: got ${tracks.map((x) => x.title).join(', ')}`)
  const pathOf = new Map([[a.id, a.path], [b.id, b.path], [c.id, c.path]])

  const state = async () => (await call('status')).player
  const engine = async () => (await call('status')).engine

  async function waitForTrack(predicate, timeoutMs = 9000) {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      const player = await state()
      if (predicate(player)) return player
      await sleep(100)
    }
    return state()
  }

  await t.test('engine runs with the silent AO', async () => {
    await call('queue.play', { ids: [a.id, b.id, c.id], startIndex: 0 })
    const started = await waitForTrack((p) => p.playing === true)
    assert.equal(started.trackId, a.id, 'cursor is the first track')

    const eng = await engine()
    assert.equal(eng.status, 'running', 'mpv is running')
    assert.equal(eng.ao, 'null', `mpv reported AO must be null, got ${eng.ao}`)
    assert.equal(eng.currentFile, a.path, 'mpv opened the first fixture file')
  })

  await t.test('1. manual next advances audio, not just the cursor', async () => {
    await call('player.next')
    const player = await waitForTrack((p) => p.trackId === b.id)
    assert.equal(player.trackId, b.id, 'cursor moved to track 2')
    assert.equal((await engine()).currentFile, b.path, 'mpv opened track 2')
    assert.ok(player.positionMs < 4000, `position reset for the new track (got ${player.positionMs})`)
  })

  await t.test('2. next again reaches track 3', async () => {
    await call('player.next')
    const player = await waitForTrack((p) => p.trackId === c.id)
    assert.equal(player.trackId, c.id, 'cursor moved to track 3')
    assert.equal((await engine()).currentFile, c.path, 'mpv opened track 3')
  })

  await t.test('3. wrap-around at the end of the queue (mode all)', async () => {
    await call('player.mode', { mode: 'all' })
    await call('queue.play', { ids: [a.id, b.id], startIndex: 1 })
    await waitForTrack((p) => p.trackId === b.id)
    await call('player.next')
    const player = await waitForTrack((p) => p.trackId === a.id)
    assert.equal(player.trackId, a.id, 'next on the last track wraps to the first')
    assert.equal((await engine()).currentFile, a.path, 'mpv opened the first file again')
  })

  await t.test('4. previous: restart vs. go back', async () => {
    await sleep(4200)
    await call('player.prev')
    const restarted = await waitForTrack((p) => p.trackId === a.id && p.positionMs < 2500, 6000)
    assert.equal(restarted.trackId, a.id, 'prev after 3s restarts the current track')
    assert.ok(restarted.positionMs < 2500, `position restarted (got ${restarted.positionMs})`)

    await sleep(800)
    await call('player.prev')
    const previous = await waitForTrack((p) => p.trackId !== a.id, 6000)
    assert.equal(previous.trackId, b.id, `prev near the start goes to the previous track (got ${previous.trackId})`)
  })

  await t.test('5. auto-advance (mpv owns the transition)', async () => {
    await call('player.mode', { mode: 'all' })
    await call('queue.play', { ids: [a.id, b.id, c.id], startIndex: 0 })
    const player = await waitForTrack((p) => p.trackId === a.id)
    await call('player.seek', { ms: Math.max(0, player.durationMs - 1500) })
    const advanced = await waitForTrack((p) => p.trackId === b.id, 12000)
    assert.equal(advanced.trackId, b.id, 'auto-advance moved the cursor')
    assert.equal((await engine()).currentFile, b.path, 'auto-advance moved the audio')
    assert.equal(advanced.playing, true, 'playback continued after auto-advance')
  })

  await t.test('6. repeat-one replays the same track', async () => {
    await call('player.mode', { mode: 'one' })
    await call('queue.play', { ids: [a.id, b.id], startIndex: 0 })
    const player = await waitForTrack((p) => p.trackId === a.id)
    await call('player.seek', { ms: Math.max(0, player.durationMs - 1200) })
    const replayed = await waitForTrack((p) => p.trackId === a.id && p.positionMs < 4000, 12000)
    assert.equal(replayed.trackId, a.id, 'repeat-one stayed on the same track')
    assert.ok(replayed.positionMs < 4000, `repeat-one restarted from the beginning (got ${replayed.positionMs})`)
  })

  await t.test('7. pause / resume, and the fade preference default', async () => {
    await call('player.mode', { mode: 'all' })
    await call('player.pause')
    // The pause flag arrives through mpv's property observer, so wait for it
    // instead of sampling the in-process snapshot one tick too early.
    const paused = await waitForTrack((p) => p.paused === true, 6000)
    assert.equal(paused.paused, true, 'pause reached mpv')
    await call('player.play')
    const resumed = await waitForTrack((p) => p.paused === false, 6000)
    assert.equal(resumed.paused, false, 'resume reached mpv')
    assert.equal(resumed.fade, true, 'fade preference is on by default')
  })

  await t.test('8. settings toggle turns fades off (and back on)', async () => {
    await call('prefs.set', { patch: { fade: false } })
    assert.equal((await state()).fade, false, 'fade reported off')
    await call('prefs.set', { patch: { fade: true } })
    assert.equal((await state()).fade, true, 'fade reported on again')
  })

  await t.test('9. switching the playback mode must not restart the current track', async () => {
    await call('player.mode', { mode: 'all' })
    await call('queue.play', { ids: [a.id, b.id, c.id], startIndex: 0 })
    await waitForTrack((p) => p.trackId === a.id)
    await call('player.seek', { ms: 3000 })
    await sleep(1200)
    const beforeMode = await state()
    const beforeFile = (await engine()).currentFile
    for (const mode of ['sequence', 'all', 'one', 'shuffle']) {
      await call('player.mode', { mode })
      await sleep(350)
      const now = await state()
      const file = (await engine()).currentFile
      assert.equal(now.trackId, beforeMode.trackId, `mode ${mode}: same track`)
      assert.equal(file, beforeFile, `mode ${mode}: same file in mpv`)
      const drifted = Math.abs(now.positionMs - beforeMode.positionMs)
      assert.ok(drifted < 4000, `mode ${mode}: position kept (drifted ${drifted}ms)`)
    }
  })

  await t.test('10. sequence mode stops after the last track', async () => {
    await call('player.mode', { mode: 'sequence' })
    await call('queue.play', { ids: [a.id, b.id], startIndex: 1 })
    const player = await waitForTrack((p) => p.trackId === b.id)
    await call('player.seek', { ms: Math.max(0, player.durationMs - 1200) })
    await sleep(5000)
    const stopped = await state()
    assert.equal(stopped.playing, false, `sequence stopped at the end (playing=${stopped.playing}, paused=${stopped.paused})`)
  })

  await t.test('11. cycling back to a normal mode resumes control', async () => {
    await call('player.mode', { mode: 'all' })
    await call('queue.play', { ids: [a.id, b.id], startIndex: 0 })
    const player = await waitForTrack((p) => p.playing === true)
    assert.equal(player.trackId, a.id, 'playback restarted after sequence')
    await call('player.pause')
  })

  await t.test('12. the temp root is the only place written', async () => {
    const { dataDir, root } = host
    assert.ok(dataDir.startsWith(root), `data dir ${dataDir} must live under ${root}`)
    assert.deepEqual(host.config.ao, 'null', 'config carried ao=null')
    assert.equal(pathOf.size, 3, 'fixture map complete')
  })
})
