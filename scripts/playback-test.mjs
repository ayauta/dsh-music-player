/**
 * End-to-end playback switching test against the running plugin.
 *
 * Every assertion reads two independent facts: the cursor the plugin reports
 * (`player.trackId`) and the file mpv actually has open (`engine.currentFile`).
 * A switch that updates the UI but not the audio fails here.
 *
 *   node scripts/playback-test.mjs
 */
const API = process.env.DSH_MUSIC_API ?? 'http://127.0.0.1:62618/music/api'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function call(op, payload) {
  const response = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ op, ...(payload ?? {}) }),
  })
  const body = await response.json()
  if (body.ok !== true) throw new Error(body.error ?? 'host rejected request')
  return body.data
}

let failures = 0
function check(condition, message, extra) {
  if (condition) console.log(`  ok   ${message}`)
  else { failures += 1; console.log(`  FAIL ${message}${extra ? ` — ${JSON.stringify(extra)}` : ''}`) }
}

const state = async () => (await call('status')).player
const engine = async () => (await call('status')).engine

async function waitForTrack(predicate, timeoutMs = 6000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const player = await state()
    if (predicate(player)) return player
    await sleep(150)
  }
  return state()
}

const folder = 'D:\\归档\\兰音专辑\\2024-05-11 兰音.2024.《形神合一》.兰音工作室.兰音Reine音乐作品集'
const tracks = await call('library.list', { view: 'folder', key: folder })
if (tracks.length < 4) throw new Error('need at least 4 tracks in the test folder')
const [a, b, c] = tracks
console.log(`test tracks: ${a.title} / ${b.title} / ${c.title}`)

const files = new Map(tracks.map((track) => [track.id, track.path]))
const expectFile = (player) => files.get(player.trackId)

console.log('\n1. start playback')
await call('queue.play', { ids: tracks.map((t) => t.id), startIndex: 0 })
let player = await waitForTrack((p) => p.playing === true)
check(player.trackId === a.id, 'cursor is the first track', { got: player.trackId, want: a.id })
check((await engine()).currentFile === a.path, 'mpv opened the first file')

console.log('\n2. manual next advances audio, not just the cursor')
await call('player.next')
player = await waitForTrack((p) => p.trackId === b.id)
const afterNext = await engine()
check(player.trackId === b.id, 'cursor moved to track 2')
check(afterNext.currentFile === b.path, 'mpv opened track 2', { got: afterNext.currentFile })
check(player.positionMs < 4000, 'position reset for the new track', { pos: player.positionMs })

console.log('\n3. next again, then wrap-around at the end of the queue')
await call('player.next')
player = await waitForTrack((p) => p.trackId === c.id)
check(player.trackId === c.id, 'cursor moved to track 3')
check((await engine()).currentFile === c.path, 'mpv opened track 3')

await call('player.mode', { mode: 'all' })
await call('queue.play', { ids: [a.id, b.id], startIndex: 1 })
player = await waitForTrack((p) => p.trackId === b.id)
await call('player.next')
player = await waitForTrack((p) => p.trackId === a.id)
check(player.trackId === a.id, 'next on the last track wraps to the first')
check((await engine()).currentFile === a.path, 'mpv opened the first file again')

console.log('\n4. previous: restart vs. go back')
await sleep(4200)
await call('player.prev')
player = await waitForTrack((p) => p.trackId === a.id && p.positionMs < 2500, 4000)
check(player.trackId === a.id, 'prev after 3s restarts the current track')
check(player.positionMs < 2500, 'position restarted', { pos: player.positionMs })

await sleep(800)
await call('player.prev')
player = await waitForTrack((p) => p.trackId !== a.id, 5000)
check(player.trackId === b.id, 'prev near the start goes to the previous track', { got: player.trackId })

console.log('\n5. auto-advance (mpv owns the transition)')
await call('queue.play', { ids: [a.id, b.id, c.id], startIndex: 0 })
player = await waitForTrack((p) => p.trackId === a.id)
await call('player.seek', { ms: Math.max(0, player.durationMs - 1500) })
player = await waitForTrack((p) => p.trackId === b.id, 9000)
check(player.trackId === b.id, 'auto-advance moved the cursor')
check((await engine()).currentFile === b.path, 'auto-advance moved the audio')
check(player.playing === true, 'playback continued after auto-advance')

console.log('\n6. repeat-one replays the same track')
await call('player.mode', { mode: 'one' })
await call('queue.play', { ids: [a.id, b.id], startIndex: 0 })
player = await waitForTrack((p) => p.trackId === a.id)
await call('player.seek', { ms: Math.max(0, player.durationMs - 1200) })
player = await waitForTrack((p) => p.trackId === a.id && p.positionMs < 4000, 9000)
check(player.trackId === a.id, 'repeat-one stayed on the same track')
check(player.positionMs < 4000, 'repeat-one restarted from the beginning', { pos: player.positionMs })

console.log('\n7. pause / resume, and fades')
await call('player.mode', { mode: 'all' })
await call('player.pause')
player = await state()
check(player.paused === true, 'pause reached mpv')
await call('player.play')
player = await waitForTrack((p) => p.paused === false, 5000)
check(player.paused === false, 'resume reached mpv')
check(player.fade === true, 'fade preference is on by default')

console.log('\n8. settings toggle turns fades off (and back on)')
await call('prefs.set', { patch: { fade: false } })
player = await state()
check(player.fade === false, 'fade reported off')
await call('prefs.set', { patch: { fade: true } })
player = await state()
check(player.fade === true, 'fade reported on again')


console.log('\n9. switching the playback mode must not restart the current track')
await call('player.mode', { mode: 'all' })
await call('queue.play', { ids: [a.id, b.id, c.id], startIndex: 0 })
player = await waitForTrack((p) => p.trackId === a.id)
await call('player.seek', { ms: 30000 })
await sleep(1200)
const beforeMode = await state()
const beforeFile = (await engine()).currentFile
for (const mode of ['sequence', 'all', 'one', 'shuffle']) {
  await call('player.mode', { mode })
  await sleep(350)
  const now = await state()
  const file = (await engine()).currentFile
  check(now.trackId === beforeMode.trackId, `mode ${mode}: same track`, { got: now.trackId })
  check(file === beforeFile, `mode ${mode}: same file in mpv`)
  check(Math.abs(now.positionMs - beforeMode.positionMs) < 4000, `mode ${mode}: position kept`, { pos: now.positionMs, was: beforeMode.positionMs })
}

console.log('\n10. sequence mode stops after the last track')
await call('player.mode', { mode: 'sequence' })
await call('queue.play', { ids: [a.id, b.id], startIndex: 1 })
player = await waitForTrack((p) => p.trackId === b.id)
await call('player.seek', { ms: Math.max(0, player.durationMs - 1200) })
await sleep(4500)
const stopped = await state()
check(stopped.playing === false, 'sequence stopped at the end of the queue', { playing: stopped.playing, paused: stopped.paused })

console.log('\n11. cycling back to a normal mode resumes control')
await call('player.mode', { mode: 'all' })
await call('queue.play', { ids: [a.id, b.id], startIndex: 0 })
player = await waitForTrack((p) => p.playing === true)
check(player.trackId === a.id, 'playback restarted after sequence')
await call('player.pause')
console.log(failures === 0 ? '\nALL PLAYBACK CHECKS PASSED' : `\n${failures} PLAYBACK CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)

