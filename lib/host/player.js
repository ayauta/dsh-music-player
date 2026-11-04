/**
 * Playback state machine: queue, playback order, cursor, modes, volume, fades
 * and the persisted resume state. It owns no audio: every change becomes a
 * mpv command.
 *
 * Design notes
 *  - `queue` is the single order: what the user sees, the order playback
 *    follows, and the thing mpv mirrors. It holds each trackId at most once.
 *  - `cursor` indexes `queue` and is written by `commit()` only. Nothing else
 *    assigns it, so "which entry is playing" has exactly one derivation.
 *  - mpv mirrors the remainder of `queue`, which is what makes gapless advance
 *    work. The engine owns that playlist: it returns where the mirrored entries
 *    sit and which file it saw there, and only answers `ok` once mpv reports the
 *    requested shape. `baseCursor` maps mpv's `playlist-pos` back onto `queue`
 *    and is an adapter offset, not a second order.
 *  - Manual transport is deterministic: next/prev always reload the target file
 *    instead of trusting mpv's playlist index. Auto-advance stays gapless.
 *  - Queue edits never turn a paused player into a playing one, and never touch
 *    a stopped one.
 *  - Fades are volume ramps through mpv, enabled by default and switchable in
 *    settings. Any user volume change cancels a running ramp.
 *  - Position is sampled once per second and interpolated by the UI, so no
 *    per-frame IPC or React re-render is involved.
 */
import { delay as realDelay } from './engine.js'

export const MODES = ['sequence', 'all', 'one', 'shuffle']

/**
 * `delay` and `random` are accepted, not created, so a test can replace time
 * and entropy without changing production timing: the defaults are exactly what
 * this module used before. Nothing else here is injectable on purpose — the
 * fade algorithm, the queue/cursor rules and the mpv commands stay as they are.
 */
export function createPlayer({
  engine,
  db,
  resolveTrack,
  onChange,
  log,
  getPrefs,
  delay = realDelay,
  random = Math.random,
}) {
  const state = {
    queue: [],
    cursor: -1,
    baseCursor: 0,
    mode: 'all',
    volume: 100,
    muted: false,
    playing: false,
    positionMs: 0,
    positionSampledAt: 0,
    durationMs: 0,
    loading: false,
    lastError: null,
  }

  let pollTimer = null
  let persistTimer = null
  let unsubscribe = null
  const listeners = new Set()

  let fadeSeq = 0
  let selfLoad = false
  let loadingTrack = false
  const prefsNow = () => (typeof getPrefs === 'function' ? (getPrefs() ?? {}) : {})
  const fadeEnabled = () => prefsNow().fade !== false

  const notify = (reason) => {
    for (const listener of listeners) { try { listener(reason) } catch { /* listener bug */ } }
    onChange?.(reason)
  }

  /* ── the one place that knows what a queue entry is ──────── */

  const trackOf = (id) => (typeof id === 'string' ? resolveTrack(id) : null)
  const usable = (id) => {
    const track = trackOf(id)
    return track !== null && track !== undefined && track.missing !== true
  }

  /** Deduplicate, drop unusable ids. Every entry point funnels through here. */
  function normalize(ids) {
    if (!Array.isArray(ids)) return []
    const seen = new Set()
    const out = []
    for (const id of ids) {
      if (typeof id !== 'string' || seen.has(id) || !usable(id)) continue
      seen.add(id)
      out.push(id)
    }
    return out
  }

  function currentId() { return state.cursor >= 0 ? state.queue[state.cursor] ?? null : null }

  /** The only writer of `cursor`. Unknown ids leave it at -1. */
  function commit(id) {
    state.cursor = id === null || id === undefined ? -1 : state.queue.indexOf(id)
  }

  const pathsFor = (ids) => ids
    .map((id) => trackOf(id))
    .filter((t) => t !== null && t !== undefined && !t.missing && typeof t.path === 'string' && t.path !== '')
    .map((t) => t.path)

  /** mpv is attached and has a file: mirroring is safe. */
  const engineActive = () => engine.state.status === 'running'
    && engine.state.idleActive !== true
    && (engine.state.currentFile ?? null) !== null

  /** Drop entries that vanished from the library, never the one playing. */
  function pruneMissing() {
    const keep = currentId()
    const kept = state.queue.filter((id) => id === keep || usable(id))
    if (kept.length === state.queue.length) return false
    state.queue = kept
    commit(keep)
    return true
  }

  /** The library already knows every duration; mpv only refines it. */
  function seedDuration(id) {
    if (id === null) return
    const track = trackOf(id)
    if (track !== null && track !== undefined && typeof track.durationMs === 'number' && track.durationMs > 0) {
      state.durationMs = track.durationMs
    }
  }

  /* ── fades ───────────────────────────────────────────────── */

  async function fadeRange(from, to, ms) {
    if (!fadeEnabled() || ms <= 0) {
      fadeSeq += 1
      await engine.setVolume(to)
      return
    }
    const seq = ++fadeSeq
    const steps = Math.max(6, Math.round(ms / 16))
    for (let i = 0; i <= steps; i++) {
      if (seq !== fadeSeq) return
      const p = i / steps
      const value = from + (to - from) * p
      try { await engine.setVolume(value) } catch { return }
      if (i < steps) await delay(ms / steps)
    }
  }

  const fadeIn = (ms = 280) => fadeRange(0, state.volume, ms)
  const fadeOut = (ms = 200) => fadeRange(state.volume, 0, ms)

  /* ── playback order ──────────────────────────────────────── */

  function shuffle(ids) {
    const copy = ids.slice()
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      const tmp = copy[i]; copy[i] = copy[j]; copy[j] = tmp
    }
    return copy
  }

  /** Randomise only what is still ahead: history and the current slot stay. */
  function shuffleTail() {
    if (state.queue.length === 0) return
    const head = state.queue.slice(0, state.cursor + 1)
    state.queue = head.concat(shuffle(state.queue.slice(state.cursor + 1)))
  }

  /** A new shuffle round: everything is upcoming again. */
  function shuffleAll() {
    state.queue = shuffle(state.queue)
    state.cursor = state.queue.length > 0 ? 0 : -1
  }

  /**
   * Make mpv's playlist equal `queue.slice(cursor)` (or the single entry in
   * mode `one`). `restart` replaces the playlist and starts the file; otherwise
   * only the tail is rewritten and the current file is untouched.
   *
   * The engine reports which mpv index the first mirrored entry sits at and
   * which file it saw there, so the cursor is taken from mpv's answer rather
   * than from what this module hoped. A current entry that moved while the tail
   * was being written is adopted, then the tail is rewritten once from the new
   * position.
   */
  async function mirror({ restart = false, startMs = 0, paused = false, corrective = false } = {}) {
    if (pruneMissing()) notify('queue')
    seedDuration(currentId())
    if (state.cursor < 0 || state.queue.length === 0) { await stopEngine(true); return false }

    const ids = state.mode === 'one' ? [state.queue[state.cursor]] : state.queue.slice(state.cursor)
    const paths = pathsFor(ids)
    // A hole would shift every mpv index against the queue; refuse to mirror.
    if (paths.length !== ids.length || paths.length === 0) { await stopEngine(true); return false }

    if (restart) {
      const result = await loadWithFade(paths, 0, startMs, paused)
      if (result?.ok !== true) log?.('warn', `playlist load not confirmed: ${result?.reason ?? 'unknown'}`)
      if (!adoptMirror(ids, paths, result)) {
        log?.('warn', `playlist settled on an entry outside the queue: ${String(result?.seen)}`)
        return false
      }
      return result?.ok === true
    }

    if (state.mode === 'one') return true
    if (!engineActive()) return true

    const result = await engine.rewriteTail({ expectCurrent: paths[0], tail: paths.slice(1) })
    if (result?.reason === 'current-moved') {
      // mpv finished the current file before the write landed. Adopt the entry
      // it moved on to, then rewrite the tail once from there — applying the
      // stale tail would duplicate the new current.
      if (!adoptMirror(ids, paths, result)) {
        log?.('warn', `playlist moved to an entry outside the queue: ${String(result?.seen)}`)
        return false
      }
      if (corrective) { log?.('warn', 'playlist tail kept moving; leaving it to the next edit'); return false }
      return mirror({ restart: false, corrective: true })
    }
    if (result?.ok !== true) {
      // The engine read the playlist back and it is not what was asked for:
      // report the failure and leave the anchor where it was.
      log?.('warn', `playlist sync not confirmed: ${result?.reason ?? 'unknown'}`)
      return false
    }
    if (!adoptMirror(ids, paths, result)) {
      log?.('warn', `playlist settled on an entry outside the queue: ${String(result?.seen)}`)
      return false
    }
    return true
  }

  /**
   * Take the current entry from what mpv reported.
   *
   * `at` is the playlist index the write was based on and `seen` the file mpv
   * had there, so `at - seenIndex` is the mpv index of `ids[0]`; `pos` then maps
   * onto `ids` directly. `baseCursor` stays the queue index of mpv's entry 0.
   */
  function adoptMirror(ids, paths, result) {
    const at = Number.isInteger(result?.at) ? result.at : 0
    const seenIndex = typeof result?.seen === 'string' ? paths.indexOf(result.seen) : 0
    if (seenIndex < 0) return false
    const base = at - seenIndex
    const pos = Number.isInteger(result?.pos) ? result.pos : at
    const index = Math.max(0, Math.min(pos - base, ids.length - 1))
    const id = ids[index]
    if (id === undefined) return false
    if (id !== currentId()) {
      state.cursor = state.queue.indexOf(id)
      state.positionMs = 0
      seedDuration(id)
      notify('track')
    }
    state.baseCursor = state.cursor - pos
    return true
  }

  /** Load through a fade: silence first, then ramp the new track up. */
  async function loadWithFade(paths, index, startMs = 0, startPaused = false) {
    selfLoad = true
    loadingTrack = true
    let result = null
    try {
      await engine.setVolume(0)
      result = await engine.load(paths, index, startMs)
      if (startPaused) {
        // Stop first, then bring the level back: nothing is audible in between.
        await engine.pause(true)
        await awaitEngine(() => engine.state.pause === true)
        await engine.setVolume(state.volume)
        return result
      }
    } finally {
      selfLoad = false
      loadingTrack = false
    }
    await fadeIn(280)
    return result
  }

  /**
   * mpv answers a command before it reports the resulting property change.
   * Waiting for the engine to settle keeps the snapshot returned by the op
   * truthful instead of contradicting itself for one poll interval.
   */
  async function awaitEngine(predicate, timeoutMs = 400) {
    if (engine.state.status !== 'running') return true
    const started = Date.now()
    while (!predicate()) {
      if (Date.now() - started > timeoutMs) return false
      await new Promise((done) => setTimeout(done, 10))
    }
    return true
  }

  const awaitEngineIdle = () => awaitEngine(
    () => (engine.state.currentFile ?? null) === null && engine.state.idleActive === true,
  )

  async function stopEngine(clearPlaylist = false) {
    try { await engine.command('stop') } catch { /* engine may be down */ }
    if (clearPlaylist) {
      try { await engine.command('playlist-clear') } catch { /* older mpv */ }
    }
    await awaitEngineIdle()
    state.playing = false
    state.positionMs = 0
  }

  /** Deterministic reload of `queue[index]`, keeping a pause if asked to. */
  async function reloadAt(index, { startMs = 0, paused = false } = {}) {
    const target = Math.max(0, Math.min(index, state.queue.length - 1))
    if (!paused) await fadeOut(160)
    state.cursor = target
    state.positionMs = startMs
    seedDuration(currentId())
    await mirror({ restart: true, startMs, paused })
    notify('track')
    schedulePersist()
  }

  function startPolling() {
    if (pollTimer !== null) return
    pollTimer = setInterval(async () => {
      if (engine.state.status !== 'running') return
      try {
        const pos = await engine.getProperty('time-pos')
        if (typeof pos === 'number') {
          state.positionMs = Math.max(0, Math.round(pos * 1000))
          state.positionSampledAt = Date.now()
        }
        const duration = await engine.getProperty('duration')
        if (typeof duration === 'number') state.durationMs = Math.round(duration * 1000)
      } catch { /* engine busy or restarting */ }
    }, 1000)
    if (typeof pollTimer.unref === 'function') pollTimer.unref()
  }

  function schedulePersist() {
    if (persistTimer !== null) return
    persistTimer = setTimeout(() => {
      persistTimer = null
      persist()
    }, 1500)
    if (typeof persistTimer.unref === 'function') persistTimer.unref()
  }

  function persist() {
    try {
      db.setState('player', {
        queue: state.queue,
        cursorId: currentId(),
        mode: state.mode,
        volume: state.volume,
        muted: state.muted,
        positionMs: state.positionMs,
      })
    } catch (error) { log?.('warn', `persist failed: ${error.message}`) }
  }

  function attachEngine() {
    if (unsubscribe !== null) unsubscribe()
    unsubscribe = engine.on((event) => {
      switch (event.type) {
        case 'pos': {
          // While a load is in flight mpv reports intermediate positions, and
          // -1 when it goes idle; neither maps onto our queue.
          if (loadingTrack || event.value < 0) break
          const absolute = state.baseCursor + event.value
          if (absolute !== state.cursor && absolute >= 0 && absolute < state.queue.length) {
            state.cursor = absolute
            state.positionMs = 0
            seedDuration(currentId())
            notify('track')
            schedulePersist()
          }
          break
        }
        case 'pause':
          notify('transport')
          schedulePersist()
          break
        case 'status':
          notify('engine')
          break
        case 'endFile': {
          if (event.reason === 'eof') void handleEndOfTrack()
          else if (event.reason === 'error') {
            state.lastError = event.error ?? 'decode error'
            log?.('error', `playback error: ${state.lastError}`)
            void api.next(true)
          }
          break
        }
        case 'fileLoaded':
          if (!selfLoad) {
            // Auto-advance: mpv swapped the file itself, so soften the attack.
            void (async () => {
              try {
                await engine.setVolume(Math.min(30, state.volume))
                await fadeIn(240)
              } catch { /* engine restarting */ }
            })()
          }
          notify('track')
          break
        default:
          break
      }
    })
  }

  async function handleEndOfTrack() {
    // Repeat-one replays the same track no matter what the mirrored playlist
    // still holds behind it.
    if (state.mode === 'one') {
      // mpv drops the file at EOF, so the position must be reset before the
      // reload — otherwise the new load seeks straight to the end again.
      state.positionMs = 0
      await api.jumpTo(state.cursor)
      return
    }
    const last = state.cursor >= state.queue.length - 1
    if (!last) return // mpv already advanced; the `pos` event moved the cursor
    if (state.mode === 'all') { await api.jumpTo(0); return }
    if (state.mode === 'shuffle') { shuffleAll(); await api.jumpTo(0); return }
    // sequence: stop after the last track.
    state.playing = false
    state.positionMs = state.durationMs
    notify('transport')
  }

  const api = {
    state,
    on(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    currentId,

    async init() {
      attachEngine()
      startPolling()
      const prefs = prefsNow()
      try {
        const saved = db.getState('player')
        const restoreQueue = prefs?.restoreQueue !== false
        if (restoreQueue && saved && Array.isArray(saved.queue)) {
          state.queue = normalize(saved.queue)
          state.mode = MODES.includes(saved.mode) ? saved.mode : 'all'
          state.volume = typeof saved.volume === 'number' ? saved.volume : 100
          state.muted = Boolean(saved.muted)
          state.positionMs = typeof saved.positionMs === 'number' ? saved.positionMs : 0
          if (typeof saved.cursorId === 'string' && state.queue.includes(saved.cursorId)) commit(saved.cursorId)
          else state.cursor = state.queue.length > 0 ? 0 : -1
        } else if (typeof prefs?.defaultVolume === 'number') {
          state.volume = Math.max(0, Math.min(100, prefs.defaultVolume))
        }
      } catch (error) { log?.('warn', `restore failed: ${error.message}`) }
      seedDuration(currentId())
      try { await engine.setVolume(state.volume) } catch { /* engine down */ }
      notify('restore')
      return api
    },

    /** Replace the queue and start at the entry the caller picked. */
    async playQueue(ids, startIndex = 0) {
      const list = normalize(ids)
      const wanted = Array.isArray(ids) ? (ids[startIndex] ?? ids[0] ?? null) : null
      const picked = list.length === 0 ? null : (list.includes(wanted) ? wanted : list[0])
      state.queue = list
      commit(picked)
      if (state.mode === 'shuffle' && picked !== null) shuffleTail()
      state.positionMs = 0
      await engine.setMute(state.muted)
      await mirror({ restart: true })
      try {
        const duration = await engine.getProperty('duration')
        if (typeof duration === 'number') state.durationMs = Math.round(duration * 1000)
      } catch { /* duration arrives with the next poll */ }
      notify('queue')
      schedulePersist()
    },

    async resume() {
      if (state.queue.length === 0) return false
      const loaded = engine.state.currentFile !== null && engine.state.currentFile !== undefined
      // A queue that ran to its end leaves the playhead at the last entry's end
      // with nothing open. "Play" there means start the queue over — reusing
      // that position as a seek target landed on the finish line and stopped
      // again immediately.
      const finished = !loaded && state.durationMs > 0 && state.positionMs >= state.durationMs
      if (finished) {
        state.cursor = 0
        state.positionMs = 0
        seedDuration(currentId())
        await mirror({ restart: true, startMs: 0 })
        notify('transport')
        return true
      }
      if (state.cursor < 0) state.cursor = 0
      const id = currentId()
      if (id === null) return false
      if (engine.state.pause === true && loaded) {
        await engine.pause(false)
        await fadeIn(260)
      } else {
        await mirror({ restart: true, startMs: state.positionMs })
      }
      notify('transport')
      return true
    },

    async pause() {
      await fadeOut(160)
      await engine.pause(true)
      notify('transport')
      schedulePersist()
    },

    async toggle() {
      if (engine.state.pause === true) return api.resume()
      return api.pause()
    },

    async seek(ms) {
      const target = Math.max(0, Math.min(ms, state.durationMs || ms))
      await engine.seek(target)
      state.positionMs = target
      state.positionSampledAt = Date.now()
      notify('position')
    },

    /** Deterministic jump: always reloads the chosen track from its start. */
    async jumpTo(index) {
      if (state.queue.length === 0) return
      await reloadAt(index)
    },

    /**
     * Play the entry `id` occupies in the queue as it is right now.
     *
     * Callers hold a snapshot that may be a poll old, so the position is
     * resolved here rather than sent in: a track that has moved still plays, and
     * a track that is gone plays nothing instead of whatever took its slot.
     */
    async jumpToTrack(id) {
      if (typeof id !== 'string' || id === '' || state.queue.length === 0) return false
      const index = state.queue.indexOf(id)
      if (index < 0) return false
      await reloadAt(index)
      return true
    },

    async next(auto = false) {
      if (state.queue.length === 0) return
      if (state.mode === 'one' && auto) { state.positionMs = 0; await api.jumpTo(state.cursor); return }
      if (state.cursor < state.queue.length - 1) { await api.jumpTo(state.cursor + 1); return }
      if (state.mode === 'all' || state.mode === 'one') { await api.jumpTo(0); return }
      if (state.mode === 'shuffle') { shuffleAll(); await api.jumpTo(0); return }
      // sequence: already at the end.
      await api.pause()
    },

    async prev() {
      if (state.queue.length === 0) return
      if (state.positionMs > 3000) { await api.seek(0); return }
      if (state.cursor > 0) { await api.jumpTo(state.cursor - 1); return }
      if ((state.mode === 'all' || state.mode === 'shuffle') && state.queue.length > 1) {
        await api.jumpTo(state.queue.length - 1)
        return
      }
      await api.seek(0)
    },

    async setVolume(value) {
      fadeSeq += 1 // any manual volume change wins over a ramp
      state.volume = Math.max(0, Math.min(100, Math.round(value)))
      if (state.volume > 0) state.muted = false
      await engine.setVolume(state.volume)
      await engine.setMute(state.muted)
      notify('volume')
      schedulePersist()
    },

    async setMuted(flag) {
      state.muted = Boolean(flag)
      await engine.setMute(state.muted)
      notify('volume')
      schedulePersist()
    },

    /**
     * Change the playback mode WITHOUT touching the track that is playing.
     * Entering shuffle permutes only the entries after the cursor, so the
     * played history and the current slot stay where the user sees them.
     * Exiting shuffle keeps the visible order: there is no hidden one.
     */
    async setMode(mode) {
      if (!MODES.includes(mode)) throw new Error(`unknown mode ${mode}`)
      const previous = state.mode
      state.mode = mode
      if (mode === 'shuffle' && previous !== 'shuffle') shuffleTail()
      if (engineActive()) await mirror({ restart: false })
      notify('mode')
      schedulePersist()
    },

    /* ── queue editing ─────────────────────────────────────── */
    /**
     * `end` appends entries the queue does not hold yet. `next` moves the
     * requested entries to the slot after the playing one — no copies, and no
     * reshuffle afterwards, so a manual "play next" outranks the shuffle order.
     */
    async enqueue(ids, position = 'end') {
      const incoming = normalize(ids)
      if (incoming.length === 0) return
      const keep = currentId()

      if (position === 'next') {
        const movable = incoming.filter((id) => id !== keep)
        if (movable.length === 0) return
        state.queue = state.queue.filter((id) => !movable.includes(id))
        commit(keep)
        const at = Math.max(0, state.cursor + 1)
        state.queue.splice(at, 0, ...movable)
        commit(keep)
      } else {
        const fresh = incoming.filter((id) => !state.queue.includes(id))
        if (fresh.length === 0) return
        state.queue.push(...fresh)
      }

      // One rule: the slot is always re-derived from the id that is playing.
      commit(keep)
      await mirror({ restart: false })
      notify('queue')
      schedulePersist()
    },

    async removeAt(index) {
      if (index < 0 || index >= state.queue.length) return
      const keep = currentId()
      const removingCurrent = index === state.cursor
      const wasPaused = engine.state.pause === true
      state.queue.splice(index, 1)

      if (!removingCurrent) {
        commit(keep)
        await mirror({ restart: false })
      } else if (state.queue.length === 0) {
        state.cursor = -1
        await stopEngine(true)
      } else if (index < state.queue.length) {
        // The successor takes the slot the removed entry occupied.
        await reloadAt(index, { paused: wasPaused })
      } else {
        // It was the last entry: stop, keep the rest of the queue.
        state.cursor = -1
        await stopEngine(true)
      }

      notify('queue')
      schedulePersist()
    },

    async move(from, to) {
      if (from === to) return
      if (from < 0 || from >= state.queue.length || to < 0 || to >= state.queue.length) return
      const keep = currentId()
      const [item] = state.queue.splice(from, 1)
      state.queue.splice(to, 0, item)
      commit(keep)
      await mirror({ restart: false })
      notify('queue')
      schedulePersist()
    },

    /** Stop playback and empty the queue and mpv's playlist. */
    async clear() {
      state.queue = []
      state.cursor = -1
      state.positionMs = 0
      state.durationMs = 0
      state.positionSampledAt = 0
      state.lastError = null
      await stopEngine(true)
      notify('queue')
      schedulePersist()
    },

    /** Replace the queue without interrupting a track that survives. */
    async setQueue(ids) {
      const keep = currentId()
      const wasPaused = engine.state.pause === true
      state.queue = normalize(ids)

      if (state.queue.length === 0) {
        state.cursor = -1
        await stopEngine(true)
      } else if (keep !== null && state.queue.includes(keep)) {
        commit(keep)
        await mirror({ restart: false })
      } else if (engineActive()) {
        // The playing entry was replaced: mpv has to follow, not keep the old file.
        await reloadAt(0, { paused: wasPaused })
      } else {
        // Nothing was playing: arm the queue, do not start it.
        state.cursor = -1
      }

      notify('queue')
      schedulePersist()
    },

    /** Drop ids that were removed from the library, keeping the current track. */
    async prune(missingIds) {
      if (!missingIds || missingIds.size === 0) return
      const keep = currentId()
      const before = state.queue.length
      state.queue = state.queue.filter((id) => !missingIds.has(id))
      if (state.queue.length === before) return

      if (keep !== null && state.queue.includes(keep)) {
        commit(keep)
        await mirror({ restart: false })
      } else if (state.queue.length === 0) {
        state.cursor = -1
        await stopEngine(true)
      } else if (engineActive()) {
        state.cursor = Math.max(0, Math.min(state.cursor, state.queue.length - 1))
        await mirror({ restart: true })
      } else {
        state.cursor = -1
      }
      notify('queue')
    },

    snapshot() {
      const id = currentId()
      // mpv is the authority for "is sound coming out": pause plus idle-active
      // covers auto-advance, manual pause, end of queue and device errors.
      const engineRunning = engine.state.status === 'running'
      const playing = engineRunning && engine.state.pause !== true && engine.state.idleActive !== true
      const track = id === null ? null : trackOf(id)
      return {
        engineMode: 'mpv',
        engineStatus: engine.state.status,
        engineError: engine.state.error,
        engineFile: engine.state.currentFile ?? null,
        trackId: id,
        trackPath: track?.path ?? null,
        queue: state.queue,
        cursor: state.cursor,
        mode: state.mode,
        playing,
        paused: engine.state.pause === true,
        positionMs: state.positionMs,
        positionSampledAt: state.positionSampledAt,
        durationMs: state.durationMs,
        remainingMs: Math.max(0, (state.durationMs || 0) - state.positionMs),
        volume: state.volume,
        muted: state.muted,
        audioOut: engine.state.audioOut,
        audioDecoded: engine.state.audioDecoded,
        codec: engine.state.codec,
        exclusive: engine.state.exclusive,
        ao: engine.state.ao,
        fade: fadeEnabled(),
        error: state.lastError,
      }
    },

    async dispose() {
      fadeSeq += 1
      if (pollTimer !== null) { clearInterval(pollTimer); pollTimer = null }
      if (persistTimer !== null) { clearTimeout(persistTimer); persistTimer = null }
      persist()
      if (unsubscribe !== null) { unsubscribe(); unsubscribe = null }
      listeners.clear()
      await delay(0)
    },
  }

  return api
}
