/**
 * Host smoke test — isolated and silent by default.
 *
 *   node scripts/service-smoke.mjs                      # fixture library, ao=null
 *   node scripts/service-smoke.mjs --library <path> --allow-real-library
 *
 * Default mode generates a temporary fixture library and never touches a real
 * profile, a running DSH instance, or the audio device.
 *
 * The real-library mode is a read-only diagnostic: files are never modified,
 * playback stays silent (ao=null), and the assertions are generic invariants
 * rather than expectations about a specific private library.
 */
import { createIsolatedHost } from '../test/support/host.mjs'

function parseArgs(argv) {
  const options = { library: null, allowReal: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--allow-real-library') options.allowReal = true
    else if (arg === '--library') { options.library = argv[i + 1] ?? null; i += 1 }
  }
  return options
}

function refuse(reason, lines = []) {
  console.error(`\nrefused: ${reason}`)
  for (const line of lines) console.error(`  ${line}`)
  process.exit(2)
}

const options = parseArgs(process.argv.slice(2))
if (options.library !== null && options.allowReal !== true) {
  refuse('--library requires --allow-real-library', [
    'Scanning a real library is a diagnostic, not part of the default test run:',
    '',
    '  node scripts/service-smoke.mjs --library <path> --allow-real-library',
    '',
    'It stays read-only and silent (mpv --ao=null), but it does read your files.',
  ])
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

let failures = 0
function check(condition, message, extra) {
  if (condition) console.log(`  ok   ${message}`)
  else { failures += 1; console.log(`  FAIL ${message}${extra === undefined ? '' : ` — ${JSON.stringify(extra)}`}`) }
}

const host = await createIsolatedHost({ fixtureLibrary: options.library === null })
console.log(`temp root : ${host.root}`)
console.log(`data dir  : ${host.dataDir}`)
console.log(`mpv       : ${host.tooling.mpv}`)
console.log(`config.ao : ${host.config.ao}`)
console.log(`engine    : ${host.service.engineMode}`)

try {
  const { call } = host

  check(host.service.engineMode === 'mpv', 'mpv engine started')

  let tracks = []
  if (options.library === null) {
    tracks = host.tracks
    check(tracks.length === 3, `fixture library indexed 3 tracks (got ${tracks.length})`)
    const titles = tracks.map((track) => track.title).sort()
    // Code-unit order: 丙 (U+4E19) < 乙 (U+4E59) < 甲 (U+7532)
    check(titles.join(',') === '测试丙,测试乙,测试甲', 'parsed numbered Chinese titles', { titles })
    const wav = tracks.find((track) => track.title === '测试甲')
    check(wav?.bitsPerSample === 24 && wav?.sampleRate === 48000, 'measured 24bit/48kHz for the generated wav')
    check(wav?.channels === 2, 'measured 2 channels')
    check(tracks.some((track) => track.ext === '.mp3'), 'indexed the mp3 fixture')
    check(tracks.every((track) => track.hasCover === true), 'folder cover applied to every track')
    const folders = await call('library.groups', { kind: 'folder' })
    check(folders.length === 1, `one folder group (got ${folders.length})`)
  } else {
    const row = await call('roots.add', { path: options.library })
    for (let i = 0; i < 240; i += 1) {
      const runs = await call('library.scanStatus', {})
      if (runs.find((run) => run.rootId === row.id)?.status === 'done') break
      await sleep(500)
    }
    const runs = await call('library.scanStatus', {})
    check(runs.every((run) => run.status === 'done'), 'scan finished')
    tracks = await call('library.list', { view: 'all' })
    console.log(`  diagnostic: ${tracks.length} tracks indexed`)
    check(tracks.length > 0, 'library is not empty')
    check(tracks.every((track) => typeof track.id === 'string' && track.durationMs > 0), 'every track has an id and duration')
    const detail = await call('library.detail', { id: tracks[0].id })
    check(detail !== null && typeof detail.path === 'string', 'detail resolves for the first track')
    check(detail.artist === null || typeof detail.artist === 'string', 'artist is either absent or a string (never invented)')
  }

  const ids = tracks.map((track) => track.id)
  const snapshot = await call('queue.play', { ids, startIndex: 0 })
  check(snapshot.trackId === ids[0], 'queue.play started the first track')
  await sleep(1500)

  const status = await call('status', {})
  check(status.engine.ao === 'null', `mpv is using the silent AO (got ${status.engine.ao})`)
  check(status.player.positionMs > 300, 'position advancing')
  check(status.engine.audioDecoded?.format === 's32' || status.engine.audioDecoded?.format === 's16',
    'decoded PCM format reported', { decoded: status.engine.audioDecoded })

  await call('player.pause')
  const pausedAt = (await call('status', {})).player.positionMs
  await sleep(900)
  const stillPaused = (await call('status', {})).player.positionMs
  check(Math.abs(stillPaused - pausedAt) <= 1100, 'pause stopped the position clock')

  await call('player.seek', { ms: 1000 })
  await sleep(500)
  check((await call('status', {})).player.positionMs >= 900, 'seek landed near 1s')

  await call('player.volume', { value: 40 })
  check((await call('status', {})).player.volume === 40, 'volume applied')

  await call('player.mode', { mode: 'shuffle' })
  check((await call('status', {})).player.mode === 'shuffle', 'mode switched to shuffle')
  await call('player.mode', { mode: 'all' })

  await call('favorite.set', { id: ids[1], on: true })
  const favorites = await call('library.list', { view: 'favorites' })
  check(favorites.length === 1, 'favorite persisted')

  const playlist = await call('playlists.create', { name: '测试列表' })
  await call('playlists.add', { id: playlist.id, trackIds: [ids[0], ids[1]] })
  const playlists = await call('playlists.list', {})
  check(playlists[0]?.trackIds.length === 2, 'playlist items stored')

  await call('queue.enqueue', { ids: [ids[2]], position: 'next' })
  const afterEnqueue = await call('player.state', {})
  check(afterEnqueue.cursor === 0 && afterEnqueue.queue[1] === ids[2], 'play-next inserted after the current track')

  const searchTerm = options.library === null ? '测试' : tracks[0].title.slice(0, 1)
  const searched = await call('library.list', { query: searchTerm })
  check(searched.length >= 1, `search "${searchTerm}" matched ${searched.length} track(s)`)

  await call('player.pause')
} catch (error) {
  failures += 1
  console.error(`FAIL — ${error?.message ?? error}`)
} finally {
  const cleanup = await host.dispose()
  if (cleanup.removed !== true) {
    failures += 1
    console.error(`FAIL — temp root not removed: ${host.root}`)
  } else {
    console.log('  ok   temp root removed')
  }
}

console.log(failures === 0 ? '\nSMOKE PASSED' : `\n${failures} SMOKE CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
