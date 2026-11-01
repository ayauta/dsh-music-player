/**
 * L1 harness for `lib/host/player.js`.
 *
 * The player module is already dependency-injected at its constructor: it takes
 * an `engine` and a `db`, and since Phase 0B-2 it also accepts `delay` and
 * `random`. So the seam for unit tests is the *existing* interface — no extra
 * export, no test-only branch in production code.
 *
 * What is faked, and why that is legitimate:
 *   - `engine`: it is the mpv adapter, a real system boundary (a child process
 *     speaking JSON over a named pipe). The fake records commands and lets a
 *     test push events back in, which is the same interface mpv has.
 *   - `db`: the SQLite adapter. The fake is a Map with the same two methods.
 *   - `delay`: time is a boundary. Passing `() => Promise.resolve()` removes
 *     the 160–280 ms fade waits without touching the fade algorithm.
 *
 * Nothing inside `player.js` is stubbed: `rebuildPlays`, `syncToEngine`,
 * `handleEndOfTrack` and friends run for real.
 */

/** A recording stand-in for `createEngine(...)`. */
export function createFakeEngine(initial = {}) {
  const calls = []
  const listeners = new Set()
  const state = {
    status: 'running',
    error: null,
    binary: 'fake-mpv',
    audioOut: null,
    audioDecoded: null,
    codec: null,
    ao: 'null',
    device: null,
    exclusive: false,
    playlistPos: 0,
    playlistCount: 0,
    eofReached: false,
    idleActive: false,
    durationMs: null,
    pause: false,
    currentFile: null,
    ...initial,
  }

  let lastVolume = null
  const record = (name, args = []) => { calls.push({ name, args }) }

  return {
    get state() { return state },
    calls,
    /** Every recorded call name, in order — for coarse "did it reload" checks. */
    names() { return calls.map((call) => call.name) },
    /** Calls of one kind, so a test can assert semantics, not total counts. */
    of(name) { return calls.filter((call) => call.name === name) },
    /** The files handed to mpv, in load order. */
    loadedFiles() { return this.of('load').flatMap((call) => call.args[0]) },
    get lastVolume() { return lastVolume },

    on(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    /** Push an mpv event into the player (`pos`, `endFile`, `fileLoaded`…). */
    emit(event) { for (const listener of [...listeners]) listener(event) },

    async setVolume(value) { record('setVolume', [value]); lastVolume = value; return true },
    async setMute(flag) { record('setMute', [flag]); return true },
    async pause(flag) { record('pause', [flag]); state.pause = Boolean(flag); return true },
    async seek(ms) { record('seek', [ms]); return true },
    async command(...args) {
      record('command', args)
      if (args[0] === 'stop') { state.currentFile = null; state.idleActive = true }
      return { error: 'success' }
    },
    async getProperty(name) {
      record('getProperty', [name])
      if (name === 'duration') return state.durationMs === null ? null : state.durationMs / 1000
      if (name === 'time-pos') return 0
      return null
    },
    async load(paths, index, startMs = 0) {
      record('load', [paths, index, startMs])
      state.currentFile = paths[index] ?? paths[0] ?? null
      state.idleActive = state.currentFile === null
      return true
    },
    async append(paths) { record('append', [paths]); return true },
    async trimTail() { record('trimTail'); return true },
  }
}

/** A Map-backed stand-in for the `app_state` part of the SQLite adapter. */
export function createFakeDb(initial = {}) {
  const store = new Map()
  for (const [key, value] of Object.entries(initial)) store.set(key, clone(value))
  return {
    store,
    getState(key) { return store.has(key) ? clone(store.get(key)) : null },
    setState(key, value) { store.set(key, clone(value)) },
  }
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

/**
 * Build a player over fakes and register teardown on a `node:test` context.
 *
 * @param {object} t `node:test` context (for `t.after`)
 * @param {{
 *   tracks?: Array<{id: string, path?: string, durationMs?: number, missing?: boolean}>,
 *   stored?: Record<string, unknown>,
 *   prefs?: object,
 *   engineState?: object,
 *   random?: () => number,
 *   init?: boolean,
 * }} [options]
 */
export async function createPlayerHarness(t, options = {}) {
  const { createPlayer } = await import('../../lib/host/player.js')

  const tracks = options.tracks ?? [
    { id: 'a', durationMs: 8000 },
    { id: 'b', durationMs: 3000 },
    { id: 'c', durationMs: 3000 },
  ]
  const byId = new Map(tracks.map((track) => {
    const path = track.path ?? `C:/fixtures/${track.id}.wav`
    return [track.id, {
      id: track.id,
      path,
      durationMs: track.durationMs ?? 0,
      missing: track.missing === true,
    }]
  }))

  const engine = createFakeEngine(options.engineState)
  const db = createFakeDb(options.stored)
  if (options.prefs !== undefined) db.setState('prefs', options.prefs)

  const player = createPlayer({
    engine,
    db,
    resolveTrack: (id) => byId.get(id) ?? null,
    log: () => {},
    getPrefs: () => db.getState('prefs') ?? {},
    delay: () => Promise.resolve(),
    random: options.random ?? Math.random,
  })

  if (options.init !== false) await player.init()

  let disposed = false
  const dispose = async () => {
    if (disposed) return
    disposed = true
    await player.dispose()
  }
  t?.after?.(dispose)

  return {
    player,
    engine,
    db,
    tracks,
    pathOf: (id) => byId.get(id)?.path ?? null,
    /** Snapshot shorthand: the only read surface a caller has. */
    snap: () => player.snapshot(),
    dispose,
  }
}
