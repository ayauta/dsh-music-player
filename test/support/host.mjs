/**
 * Isolated host harness for L2 tests.
 *
 * Guarantees, in this order:
 *   1. It creates its own unique temp root and *overwrites* DSH_HOME, so a
 *      caller cannot point the tests at a real profile.
 *   2. Every database, cache, log and fixture lives under that root.
 *   3. The mpv engine runs with the silent `null` AO.
 *   4. Nothing here speaks HTTP: tests call `service.api.dispatch` in-process,
 *      so no port is opened and a running DSH can never be reached.
 *   5. Cleanup disposes the host first, then removes the directory with retries
 *      (Windows keeps file handles briefly).
 */
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'

import { createFixtureLibrary, detectTooling } from './fixtures.mjs'

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

function isInside(child, parent) {
  const c = resolve(child)
  const p = resolve(parent)
  return c === p || c.startsWith(p.endsWith(sep) ? p : p + sep)
}

async function removeDir(root) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      rmSync(root, { recursive: true, force: true })
    } catch { /* handle still open, retry */ }
    if (!existsSync(root)) return true
    await sleep(200)
  }
  return !existsSync(root)
}

/**
 * Start an isolated host.
 *
 * @param {{ao?: string, config?: object}} [options]
 * @returns {Promise<{root: string, dataDir: string, service: any, call: Function,
 *   fixture: ReturnType<typeof createFixtureLibrary>, tracks: any[], dispose: Function}>}
 */
export async function createIsolatedHost(options = {}) {
  const tooling = detectTooling()
  const missing = ['mpv', 'ffprobe', 'ffmpeg'].filter((name) => tooling[name] === null)
  if (missing.length > 0) {
    throw new Error(`missing required tooling: ${missing.join(', ')}`)
  }

  // The harness owns the root. Any DSH_HOME the caller may have set is ignored
  // on purpose: tests must never be able to inherit a real profile.
  const root = mkdtempSync(join(tmpdir(), 'dsh-music-test-'))
  process.env.DSH_HOME = root

  // Everything after mkdtemp can fail (missing plugin module, ffmpeg error,
  // mpv refusing to start, scan failure). None of it may leave the temp root
  // or a half-started host behind: the caller never receives a handle on the
  // failure path, so the factory has to clean up after itself.
  let service = null
  try {
    const { startMusicService, normalizeConfig, dataRoot } = await import('../../lib/host/plugin.js')
    const dataDir = dataRoot()
    if (!isInside(dataDir, root)) {
      throw new Error(`refusing to run: data dir ${dataDir} is outside the temp root ${root}`)
    }

    const fixture = options.fixtureLibrary === false ? null : createFixtureLibrary(root, tooling)
    const logLines = []
    const log = (level, message) => { if (level !== 'info') logLines.push(`${level}: ${message}`) }

    const config = normalizeConfig({ engine: 'mpv', ao: options.ao ?? 'null', ...(options.config ?? {}) })
    service = await startMusicService(config, { ctx: null, log })

    const call = (op, payload) => service.api.dispatch(op, payload)

    // Index the fixture library inside the temp root, then wait for the scan.
    let tracks = []
    if (fixture !== null) {
      const row = await call('roots.add', { path: fixture.dir })
      for (let attempt = 0; attempt < 240; attempt += 1) {
        const runs = await call('library.scanStatus', {})
        if (runs.find((run) => run.rootId === row.id)?.status === 'done') break
        await sleep(250)
      }
      tracks = await call('library.list', { view: 'all' })
    }

    let disposed = false
    const dispose = async () => {
      if (disposed) return { removed: true }
      disposed = true
      try { await service.dispose() } catch { /* best effort */ }
      const removed = await removeDir(root)
      return { removed, logLines }
    }

    return { root, dataDir, service, call, fixture, tracks, tooling, config, dispose }
  } catch (error) {
    if (service !== null) {
      try { await service.dispose() } catch { /* best effort */ }
    }
    const removed = await removeDir(root)
    const detail = removed ? '' : ` (temp root left behind: ${root})`
    throw new Error(`isolated host failed to start: ${error?.message ?? error}${detail}`, { cause: error })
  }
}

/** Register cleanup on a node:test context. */
export function useIsolatedHost(t, options = {}) {
  let host = null
  t.after(async () => {
    if (host !== null) await host.dispose()
  })
  return async () => {
    host = await createIsolatedHost(options)
    return host
  }
}
