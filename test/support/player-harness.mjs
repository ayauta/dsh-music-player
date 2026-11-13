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
 *     speaking JSON over a named pipe). The fake models the *playlist* — paths,
 *     position, count — so a test asserts the state mpv would be in, not the
 *     sequence of calls the player happened to make.
 *   - `db`: the SQLite adapter. The fake is a Map with the same two methods.
 *   - `delay`: time is a boundary. Passing `() => Promise.resolve()` removes
 *     the 160–280 ms fade waits without touching the fade algorithm.
 *
 * Nothing inside `player.js` is stubbed: `mirror`, `adoptMirror`, `commit` and
 * friends run for real.
 */

/** A stand-in for `createEngine(...)` that keeps an actual playlist. */
export function createFakeEngine(initial = {}) {
  const calls = []
  const listeners = new Set()
  // `slowStopMs` / `slowPauseMs` model mpv's real behaviour: a command returns
  // before the engine has reported the resulting property change.
  // `failRewrite` makes the next tail write report a failure without applying.
  const { slowStopMs = 0, slowPauseMs = 0, failRewrite = null, ...engineState } = initial
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
    timePosMs: 0,
    pause: false,
    currentFile: null,
    ...engineState,
  }

  let playlist = []
  let pos = 0
  let pendingFailure = failRewrite
  let pendingPauseFailure = null
  let heldRead = null
  let suspendedReads = 0
  let pendingCorruption = null
  let ghostSeen = false
  let moveBeforeWrite = false
  let moveDuringWrite = false
  let lastVolume = null

  const record = (name, args = []) => { calls.push({ name, args }) }
  const currentPath = () => playlist[pos] ?? null
  const sync = () => { state.playlistCount = playlist.length; state.playlistPos = pos; state.currentFile = currentPath() }
  const facts = () => ({
    at: pos,
    seen: currentPath(),
    pos,
    count: playlist.length,
    currentFile: currentPath(),
  })

  function advanceBy(step = 1) {
    const next = Math.min(pos + step, Math.max(0, playlist.length - 1))
    pos = next
    sync()
    return currentPath()
  }

  return {
    get state() { return state },
    calls,
    /** Every recorded call name, in order — for coarse "did it reload" checks. */
    names() { return calls.map((call) => call.name) },
    /** Calls of one kind, so a test can assert semantics, not total counts. */
    of(name) { return calls.filter((call) => call.name === name) },
    /** The files handed to mpv, in load order. */
    loadedFiles() { return this.of('load').flatMap((call) => call.args[0]) },
    /** What mpv's playlist holds right now (the state, not the calls). */
    playlist() { return playlist.slice() },
    get lastVolume() { return lastVolume },

    on(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    /** Push an mpv event into the player (`pos`, `endFile`, `fileLoaded`…). */
    emit(event) { for (const listener of [...listeners]) listener(event) },

    /** Natural EOF: mpv moves on by itself. */
    advance(step = 1) { return advanceBy(step) },
    /** The next tail write will discover the current entry has already moved. */
    moveBeforeNextWrite() { moveBeforeWrite = true },
    /** The next tail write will see mpv advance while it is writing. */
    moveDuringNextWrite() { moveDuringWrite = true },
    /** The next tail write reports a failure and changes nothing. */
    failNextWrite(reason = 'timeout') { pendingFailure = reason },
    /** Move the position mpv would report for `time-pos`. */
    setTimePos(ms) { state.timePosMs = ms },
    /**
     * Hold the next `time-pos` read open. It answers with the value that was
     * current when the read *started*, and only when the caller releases it —
     * the shape of an I/O read that straddles a seek or a pause.
     */
    holdNextTimePos() {
      let release
      const promise = new Promise((done) => { release = done })
      heldRead = { promise }
      return () => { heldRead = null; release() }
    },
    /** How many held reads are still suspended. */
    suspendedReads: () => suspendedReads,
    /** The next pause command is acknowledged but never confirmed. */
    failNextPause(reason = 'timeout') { pendingPauseFailure = reason },
    /** The next write lands, but the playlist ends up in the wrong shape. */
    corruptNextWrite(kind = 'swap') { pendingCorruption = kind },
    /** The next successful write reports an entry the queue has never heard of. */
    reportUnknownSeen() { ghostSeen = true },

    async setVolume(value) { record('setVolume', [value]); lastVolume = value; return true },
    async setMute(flag) { record('setMute', [flag]); return true },
    /**
     * Mirrors the production contract: `ok` means mpv has already reported the
     * requested pause state, not merely that the command was accepted.
     */
    async pause(flag) {
      record('pause', [flag])
      const want = Boolean(flag)
      if (pendingPauseFailure !== null) {
        const reason = pendingPauseFailure
        pendingPauseFailure = null
        return { ok: false, reason, paused: state.pause }
      }
      if (state.pause === want) return { ok: true, reason: 'ok', paused: state.pause }
      if (slowPauseMs > 0) await new Promise((done) => setTimeout(done, slowPauseMs))
      state.pause = want
      return { ok: true, reason: 'ok', paused: state.pause }
    },
    // mpv moves its own 	ime-pos on a seek, and the player reads it back when it pauses.
    async seek(ms) { record('seek', [ms]); state.timePosMs = ms; return true },
    async command(...args) {
      record('command', args)
      if (args[0] === 'stop') {
        const clear = () => { playlist = []; pos = 0; sync(); state.idleActive = true; state.currentFile = null }
        if (slowStopMs > 0) setTimeout(clear, slowStopMs)
        else clear()
      }
      return { error: 'success' }
    },
    async getProperty(name) {
      record('getProperty', [name])
      if (name === 'duration') return state.durationMs === null ? null : state.durationMs / 1000
      if (name === 'time-pos') {
        // The value mpv would report *right now*; a held read keeps answering
        // with it even after the state has moved on — that is how a real read
        // that was in flight during a pause behaves.
        const value = state.timePosMs / 1000
        if (heldRead !== null) {
          const { promise, release } = heldRead
          heldRead = null
          suspendedReads += 1
          await promise
          suspendedReads -= 1
          return value
        }
        return value
      }
      if (name === 'playlist-pos') return pos
      if (name === 'playlist-count') return playlist.length
      return null
    },

    /** Replace the playlist and start at `index`. Confirms the whole list. */
    async load(paths, index, startMs = 0) {
      record('load', [paths, index, startMs])
      const list = (paths ?? []).filter((p) => typeof p === 'string' && p !== '')
      if (list.length === 0) { playlist = []; pos = 0; sync(); state.idleActive = true; state.currentFile = null; return { ok: false, reason: 'no-current', ...facts() } }
      playlist = list.slice()
      pos = Math.min(Math.max(0, index), list.length - 1)
      state.idleActive = false
      state.timePosMs = startMs
      state.pause = false
      sync()
      return { ok: true, reason: 'ok', at: pos, seen: currentPath(), pos, count: playlist.length, currentFile: currentPath() }
    },

    /**
     * Make everything after the current entry equal `tail`, without touching the
     * current one. Mirrors the production contract: `ok` means the playlist
     * really reached the target, and a current that moved is reported instead of
     * silently overwritten.
     */
    async rewriteTail({ expectCurrent = null, tail = [] } = {}) {
      record('rewriteTail', [{ expectCurrent, tail: (tail ?? []).slice() }])
      const list = (tail ?? []).filter((p) => typeof p === 'string' && p !== '')
      if (pendingFailure !== null) {
        const reason = pendingFailure
        pendingFailure = null
        return { ok: false, reason, ...facts() }
      }
      if (moveBeforeWrite) {
        moveBeforeWrite = false
        advanceBy(1)
        return { ok: false, reason: 'current-moved', ...facts() }
      }
      if (expectCurrent !== null && expectCurrent !== currentPath()) {
        return { ok: false, reason: 'current-moved', ...facts() }
      }

      const at = pos
      playlist = playlist.slice(0, pos + 1).concat(list)
      if (moveDuringWrite) { moveDuringWrite = false; advanceBy(1) }

      // Same verification the production engine performs: the count is not
      // proof, so the entries themselves are checked before claiming success.
      const corruption = pendingCorruption
      pendingCorruption = null
      if (corruption === 'swap' && playlist.length > at + 2) {
        const last = playlist.length - 1
        const held = playlist[last]
        playlist[last] = playlist[last - 1]
        playlist[last - 1] = held
      } else if (corruption === 'foreign' && playlist.length > at + 1) {
        playlist[playlist.length - 1] = 'C:/fixtures/__foreign__.wav'
      }
      sync()

      if (corruption !== null) {
        return { ok: false, reason: 'playlist-mismatch', mismatch: 1, ...facts(), at, seen: playlist[at] }
      }
      if (pos !== at) return { ok: false, reason: 'current-moved', ...facts(), at, seen: playlist[at] ?? currentPath() }

      const seen = expectCurrent ?? playlist[at]
      if (ghostSeen) {
        ghostSeen = false
        return { ok: true, reason: 'ok', at, seen: 'C:/fixtures/__ghost__.wav', pos, count: playlist.length, currentFile: currentPath() }
      }
      return { ok: true, reason: 'ok', at, seen, pos, count: playlist.length, currentFile: currentPath() }
    },
  }
}

let lastVolume = null

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
    pollMs: options.pollMs,
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
    /** Simulate a file disappearing from the library after it was queued. */
    markMissing: (id) => { const track = byId.get(id); if (track !== undefined) track.missing = true },
    /** Snapshot shorthand: the only read surface a caller has. */
    snap: () => player.snapshot(),
    dispose,
  }
}
