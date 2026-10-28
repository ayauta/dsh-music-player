/**
 * Standalone integration smoke test for the Host half (no Cordis, no browser):
 * real SQLite, real ffprobe, real mpv, real 24-bit/48 kHz files.
 *
 *   node scripts/service-smoke.mjs [libraryRoot]
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = process.argv[2] ?? 'D:\\归档\\兰音专辑'
const scratch = mkdtempSync(join(tmpdir(), 'dsh-music-smoke-'))
process.env.DSH_HOME = scratch

const { startMusicService, normalizeConfig } = await import('../lib/host/plugin.js')

const lines = []
const log = (level, message) => {
  const line = `${level}: ${message}`
  lines.push(line)
  if (level !== 'info') console.log('  ' + line)
}

const fail = (message) => { console.error('FAIL — ' + message); throw new Error(message) }
const check = (condition, message) => { if (!condition) fail(message); console.log('  ok   ' + message) }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

console.log(`scratch DSH_HOME: ${scratch}`)
const service = await startMusicService(normalizeConfig({ engine: 'auto' }), { ctx: null, log })
console.log(`engine mode     : ${service.engineMode}`)

try {
  check(service.engineMode === 'mpv', 'mpv engine started')

  const rootRow = await service.api.dispatch('roots.add', { path: root })
  check(typeof rootRow.id === 'string', 'library root added')

  for (let i = 0; i < 120; i++) {
    const runs = await service.api.dispatch('library.scanStatus', {})
    const run = runs.find((r) => r.rootId === rootRow.id)
    if (run?.status === 'done') break
    await sleep(500)
  }
  const runs = await service.api.dispatch('library.scanStatus', {})
  check(runs.every((r) => r.status === 'done'), 'scan finished')

  const tracks = await service.api.dispatch('library.list', { view: 'all' })
  console.log(`  tracks indexed: ${tracks.length}`)
  check(tracks.length === 41, 'indexed all 41 audio files')

  const first = tracks.find((t) => t.title === '形神合一' && t.trackNo === 1)
  check(first !== undefined, 'parsed 01.《形神合一》')
  check(first.bitsPerSample === 24 && first.sampleRate === 48000, 'measured 24bit/48kHz')
  check(first.channels === 2, 'measured 2 channels')
  check(first.durationMs > 185000 && first.durationMs < 187000, 'measured duration ~186s')
  check(first.unknownTokens.includes('兰音'), 'kept 兰音 as an unrecognised token')
  check(first.artist === null, 'no artist invented')
  check(first.hasCover === true, 'folder cover.jpg detected')

  const detail = await service.api.dispatch('library.detail', { id: first.id })
  check(detail.claimMatchesMeasurement === true, 'filename claim matches the measurement')

  const mp3 = tracks.find((t) => t.ext === '.mp3' && t.title.startsWith('【解锁奖励1】'))
  check(mp3 !== undefined, 'parsed the 【解锁奖励1】 mp3 name verbatim')

  const noClaim = tracks.find((t) => t.basename === '1. 梦倾天下.wav')
  check(noClaim !== undefined && noClaim.bitsPerSample === 24, 'found 24-bit file whose name omits the bit depth')

  const folders = await service.api.dispatch('library.groups', { kind: 'folder' })
  console.log(`  folders: ${folders.length} (${folders.map((f) => f.title).join(' | ')})`)
  check(folders.length === 5, 'five folders (3 albums + 2 伴奏)')

  const ids = tracks.map((t) => t.id)
  const snapshot = await service.api.dispatch('queue.play', { ids, startIndex: 0 })
  check(snapshot.trackId === ids[0], 'queue.play started the first track')
  await sleep(2500)

  const status = await service.api.dispatch('status', {})
  console.log(`  position: ${status.player.positionMs}ms / ${status.player.durationMs}ms`)
  console.log(`  out  : ${JSON.stringify(status.engine.audioOut)}`)
  console.log(`  dec  : ${JSON.stringify(status.engine.audioDecoded)}`)
  check(status.player.positionMs > 500, 'position advancing')
  check(status.engine.audioOut?.samplerate === 48000, 'device output reports 48 kHz')
  check(status.engine.audioDecoded?.format === 's32', 'decoded PCM format is s32 (24-bit in 32-bit container)')

  const paused = await service.api.dispatch('player.pause', {})
  const posA = paused.positionMs
  await sleep(900)
  const status2 = await service.api.dispatch('status', {})
  check(Math.abs(status2.player.positionMs - posA) <= 1100, 'pause stopped the position clock')

  await service.api.dispatch('player.seek', { ms: 60000 })
  await sleep(700)
  const status3 = await service.api.dispatch('status', {})
  check(status3.player.positionMs >= 59000, 'seek landed near 60s')

  await service.api.dispatch('player.volume', { value: 40 })
  const status4 = await service.api.dispatch('status', {})
  check(status4.player.volume === 40, 'volume applied')

  await service.api.dispatch('player.mode', { mode: 'shuffle' })
  const status5 = await service.api.dispatch('status', {})
  check(status5.player.mode === 'shuffle', 'mode switched to shuffle')
  await service.api.dispatch('player.mode', { mode: 'all' })

  await service.api.dispatch('favorite.set', { id: ids[1], on: true })
  const favorites = await service.api.dispatch('library.list', { view: 'favorites' })
  check(favorites.length === 1, 'favorite persisted')

  const playlist = await service.api.dispatch('playlists.create', { name: '测试列表' })
  await service.api.dispatch('playlists.add', { id: playlist.id, trackIds: [ids[0], ids[1]] })
  const playlists = await service.api.dispatch('playlists.list', {})
  check(playlists[0].trackIds.length === 2, 'playlist items stored')

  await service.api.dispatch('queue.enqueue', { ids: [ids[5]], position: 'next' })
  const afterEnqueue = await service.api.dispatch('player.state', {})
  check(afterEnqueue.cursor === 0 && afterEnqueue.queue[1] === ids[5], 'play-next inserted after the current track')

  const searched = await service.api.dispatch('library.list', { query: '形神' })
  check(searched.length >= 2, `search 「形神」 matched ${searched.length} tracks`)
  const fuzzy = await service.api.dispatch('library.list', { query: '梦倾' })
  check(fuzzy.length >= 2, `search 「梦倾」 matched ${fuzzy.length} tracks`)

  await service.api.dispatch('queue.clear', {})
  console.log('\nALL HOST CHECKS PASSED')
} finally {
  await service.dispose()
  await sleep(600)
  try { rmSync(scratch, { recursive: true, force: true }) } catch { /* windows lock */ }
  console.log('service disposed')
}
process.exit(0)
