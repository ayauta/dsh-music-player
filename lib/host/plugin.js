/**
 * Host half: wires storage, library, engine, player and the HTTP surface into
 * one Cordis plugin, and owns the full teardown path.
 */
import { mkdirSync, appendFileSync, statSync, truncateSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

import { openDatabase } from './db.js'
import { createLibrary } from './library.js'
import { createCovers } from './covers.js'
import { createEngine } from './engine.js'
import { createPlayer } from './player.js'
import { createApi } from './api.js'
import { createServiceProcesses, createLocalProcesses } from './process.js'
import { resolveMpv, resolveFfprobe, resolveFfmpeg } from './binaries.js'

export const VERSION = '1.0.0'

const DEFAULTS = {
  engine: 'auto', // auto | mpv | browser
  mpvPath: null,
  ffprobePath: null,
  exclusiveAudio: false,
  defaultVolume: 100,
  scanConcurrency: 4,
  pollMs: 1000,
  ao: 'wasapi', // wasapi | null — 'null' is for silent, isolated tests only
}

/** Audio output drivers this build is allowed to select. */
export const AO_VALUES = ['wasapi', 'null']

export function pluginDir() {
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..')
}

export function dataRoot() {
  const home = process.env.DSH_HOME && process.env.DSH_HOME !== '' ? process.env.DSH_HOME : join(homedir(), '.dsh')
  return join(home, 'plugin-data', 'dsh-music')
}

export function normalizeConfig(raw) {
  const merged = { ...DEFAULTS, ...(raw ?? {}) }
  if (merged.engine !== 'mpv' && merged.engine !== 'browser') merged.engine = 'auto'
  // The AO is deliberately a closed set: production keeps wasapi, tests may ask
  // for the silent null driver, and anything else falls back to the default.
  if (!AO_VALUES.includes(merged.ao)) merged.ao = DEFAULTS.ao
  merged.pluginDir = pluginDir()
  merged.version = VERSION
  return merged
}

export async function startMusicService(config, { ctx, log }) {
  const dataDir = dataRoot()
  mkdirSync(join(dataDir, 'cache', 'covers'), { recursive: true })
  mkdirSync(join(dataDir, 'logs'), { recursive: true })
  mkdirSync(join(dataDir, 'backups'), { recursive: true })

  const subprocessService = typeof ctx?.get === 'function' ? ctx.get('subprocess') : undefined
  const processes = subprocessService !== undefined && subprocessService !== null
    ? createServiceProcesses({ subprocess: subprocessService }, log)
    : createLocalProcesses()

  const db = await openDatabase(join(dataDir, 'library.db'))
  const prefs = db.getState('prefs') ?? {}
  const ffprobePath = resolveFfprobe(config)
  const ffmpegPath = resolveFfmpeg(config)
  const covers = createCovers({ dataDir, processes, ffmpegPath, log })
  const library = createLibrary({ db, processes, ffprobePath, covers, log })
  library.refresh()

  const mpvPath = config.engine === 'browser' ? null : resolveMpv({ ...config, pluginDir: config.pluginDir ?? pluginDir() })
  let engine = null
  let player = null
  let engineFailure = null

  if (mpvPath !== null && config.engine !== 'browser') {
    engine = createEngine({
      processes,
      log,
      config: { ...config, mpvPath, exclusiveAudio: prefs.exclusive === true || config.exclusiveAudio === true },
    })
    try {
      await engine.start()
      player = createPlayer({
        engine,
        db,
        resolveTrack: (id) => library.track(id),
        log,
        getPrefs: () => db.getState('prefs') ?? {},
      })
      await player.init()
    } catch (error) {
      engineFailure = error
      log?.('error', `mpv engine unavailable, falling back to browser audio: ${error.message}`)
      try { await engine.stop() } catch { /* nothing to stop */ }
      engine = null
      player = null
    }
  } else {
    engineFailure = new Error('mpv executable not found')
    log?.('warn', 'mpv not found; the browser fallback engine will be used')
  }

  const api = createApi({ library, player, engine, covers, config, dataDir, db, processes, log })

  let disposed = false

  return {
    api,
    library,
    engine,
    player,
    dataDir,
    config,
    engineMode: player === null ? 'browser' : 'mpv',
    engineFailure,
    async dispose() {
      if (disposed) return
      disposed = true
      try { if (player !== null) await player.dispose() } catch { /* best effort */ }
      try { if (engine !== null) await engine.stop() } catch { /* best effort */ }
      try { processes.disposeAll() } catch { /* best effort */ }
      try { db.close() } catch { /* best effort */ }
    },
  }
}

/** Append-only log file with a hard size cap, so diagnostics never grow forever. */
export function makeFileLogger(dataDir) {
  const file = join(dataDir, 'logs', 'music.log')
  return (level, message) => {
    const line = `${new Date().toISOString()} [${level}] ${message}\n`
    try {
      mkdirSync(dirname(file), { recursive: true })
      const info = statSync(file, { throwIfNoEntry: false })
      if (info !== undefined && info !== null && info.size > 2 * 1024 * 1024) truncateSync(file, 0)
      appendFileSync(file, line)
    } catch { /* logging must never throw */ }
  }
}
