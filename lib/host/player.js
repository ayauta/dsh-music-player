/**
 * Playback state machine: queue, playback order, cursor, modes, volume, fades
 * and the persisted resume state. It owns no audio: every change becomes an
 * mpv command.
 *
 * Design notes
 *  - `queue` is what the user sees; `plays` is the materialised order handed to
 *    mpv (shuffle produces a permutation, repeat-one keeps a single-entry
 *    playlist so a manual Next still advances).
 *  - mpv mirrors the remainder of `plays`, which is what makes gapless advance
 *    work; `baseCursor` maps mpv's `playlist-pos` back onto `plays`.
 *  - Manual transport is deterministic: next/prev always reload the target file
 *    instead of trusting mpv's playlist index. Auto-advance stays gapless.
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
    plays: [],
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
  let loading = false
  const prefsNow = () => (typeof getPrefs === 'function' ? (getPrefs() ?? {}) : {})
  const fadeEnabled = () => prefsNow().fade !== false

  const notify = (reason) => {
    for (const listener of listeners) { try { listener(reason) } catch { /* listener bug */ } }
    onChange?.(reason)
  }

  const pathsFor = (ids) => ids
    .map((id) => resolveTrack(id))
    .filter((t) => t !== null && t !== undefined && !t.missing)
    .map((t) => t.path)

  function currentId() { return state.cursor >= 0 ? state.plays[state.cursor] ?? null : null }

  /** The library already knows every duration; mpv only refines it. */
  function seedDuration(id) {
    if (id === null) return
    const track = resolveTrack(id)
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

  function rebuildPlays({ keepCurrent = true } = {}) {
    const previous = keepCurrent ? currentId() : null
    const queue = state.queue
    if (state.mode === 'shuffle') {
      const shuffled = shuffle(queue)
      if (previous !== null) {
        const index = shuffled.indexOf(previous)
        if (index > 0) { shuffled.splice(index, 1); shuffled.unshift(previous) }
        else if (index < 0) shuffled.unshift(previous)
        state.cursor = 0
      } else {
        state.cursor = shuffled.length > 0 ? 0 : -1
      }
      state.plays = shuffled
      return
    }
    state.plays = queue.slice()
    if (previous !== null) {
      const index = state.plays.indexOf(previous)
      state.cursor = index >= 0 ? index : (state.plays.length > 0 ? 0 : -1)
    } else {
      state.cursor = state.plays.length > 0 ? 0 : -1
    }
  }

  async function syncToEngine({ restart = false, startMs = 0 } = {}) {
    seedDuration(currentId())
    if (state.cursor < 0 || state.plays.length === 0) {
      try { await engine.command('stop') } catch { /* engine may be down */ }
      state.playing = false
      state.positionMs = 0
      return
    }

    if (state.mode === 'one') {
      const path = pathsFor([state.plays[state.cursor]])[0]
      if (path === undefined) return
      if (!restart) return
      state.baseCursor = state.cursor
      await loadWithFade([path], 0, startMs)
      return
    }

    const remainder = state.plays.slice(state.cursor)
    const paths = pathsFor(remainder)
    if (paths.length === 0) return

    if (restart) {
      // The base index must be recorded BEFORE the load: mpv emits
      // playlist-pos while the file is still opening, and a stale base maps
      // that event onto the wrong queue entry.
      state.baseCursor = state.cursor
      await loadWithFade(paths, 0, startMs)
      return
    }
    await engine.trimTail()
    const tailPaths = pathsFor(remainder.slice(1))
    if (tailPaths.length > 0) await engine.append(tailPaths)
  }

  /** Load through a fade: silence first, then ramp the new track up. */
  async function loadWithFade(paths, index, startMs) {
    selfLoad = true
    loading = true
    try {
      await engine.setVolume(0)
      await engine.load(paths, index, startMs)
    } finally {
      selfLoad = false
      loading = false
    }
    await fadeIn(280)
  }

  function shuffle(ids) {
    const copy = ids.slice()
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      const tmp = copy[i]; copy[i] = copy[j]; copy[j] = tmp
    }
    return copy
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
          if (loading || event.value < 0) break
          const absolute = state.baseCursor + event.value
          if (absolute !== state.cursor && absolute >= 0 && absolute < state.plays.length) {
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
    const last = state.cursor >= state.plays.length - 1
    if (!last) return // mpv already advanced; the `pos` event moved the cursor
    if (state.mode === 'all') { await api.jumpTo(0); return }
    if (state.mode === 'shuffle') {
      rebuildPlays({ keepCurrent: false })
      await api.jumpTo(0)
      return
    }
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
          state.queue = saved.queue.filter((id) => resolveTrack(id) !== null)
          state.mode = MODES.includes(saved.mode) ? saved.mode : 'all'
          state.volume = typeof saved.volume === 'number' ? saved.volume : 100
          state.muted = Boolean(saved.muted)
          state.positionMs = typeof saved.positionMs === 'number' ? saved.positionMs : 0
          rebuildPlays({ keepCurrent: false })
          if (saved.cursorId !== null && state.plays.includes(saved.cursorId)) {
            state.cursor = state.plays.indexOf(saved.cursorId)
          }
        } else if (typeof prefs?.defaultVolume === 'number') {
          state.volume = Math.max(0, Math.min(100, prefs.defaultVolume))
        }
      } catch (error) { log?.('warn', `restore failed: ${error.message}`) }
      seedDuration(currentId())
      try { await engine.setVolume(state.volume) } catch { /* engine down */ }
      notify('restore')
      return api
    },

    /** Replace the queue and start at `startIndex`. */
    async playQueue(ids, startIndex = 0) {
      state.queue = ids.slice()
      const picked = ids[startIndex] ?? ids[0] ?? null
      rebuildPlays({ keepCurrent: false })
      state.cursor = picked === null ? -1 : Math.max(0, state.plays.indexOf(picked))
      state.positionMs = 0
      await engine.setMute(state.muted)
      await syncToEngine({ restart: true, startMs: 0 })
      try {
        const duration = await engine.getProperty('duration')
        if (typeof duration === 'number') state.durationMs = Math.round(duration * 1000)
      } catch { /* duration arrives with the next poll */ }
      notify('queue')
      schedulePersist()
    },

    async resume() {
      const id = currentId()
      if (id === null) return false
      const loaded = engine.state.currentFile !== null && engine.state.currentFile !== undefined
      if (engine.state.pause === true && loaded) {
        await engine.pause(false)
        await fadeIn(260)
      } else {
        await syncToEngine({ restart: true, startMs: state.positionMs })
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
      if (state.plays.length === 0) return
      const target = Math.max(0, Math.min(index, state.plays.length - 1))
      await fadeOut(160)
      state.cursor = target
      state.positionMs = 0
      seedDuration(currentId())
      await syncToEngine({ restart: true })
      notify('track')
      schedulePersist()
    },

    async next(auto = false) {
      if (state.plays.length === 0) return
      if (state.mode === 'one' && auto) { state.positionMs = 0; await api.jumpTo(state.cursor); return }
      if (state.cursor < state.plays.length - 1) { await api.jumpTo(state.cursor + 1); return }
      if (state.mode === 'all' || state.mode === 'one') { await api.jumpTo(0); return }
      if (state.mode === 'shuffle') {
        rebuildPlays({ keepCurrent: false })
        await api.jumpTo(0)
        return
      }
      // sequence: already at the end.
      await api.pause()
    },

    async prev() {
      if (state.plays.length === 0) return
      if (state.positionMs > 3000) { await api.seek(0); return }
      if (state.cursor > 0) { await api.jumpTo(state.cursor - 1); return }
      if ((state.mode === 'all' || state.mode === 'shuffle') && state.plays.length > 1) {
        await api.jumpTo(state.plays.length - 1)
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
     * Only the upcoming entries are rewritten (trim tail + append), so the
     * current file, its position and its fade state are untouched.
     */
    async setMode(mode) {
      if (!MODES.includes(mode)) throw new Error(`unknown mode ${mode}`)
      const keep = currentId()
      state.mode = mode
      rebuildPlays({ keepCurrent: true })
      if (keep !== null) state.cursor = Math.max(0, state.plays.indexOf(keep))
      // Only rewrite the tail while something is actually playing: appending to
      // an idle mpv would start playback behind the user's back.
      const active = engine.state.status === 'running'
        && engine.state.idleActive !== true
        && (engine.state.currentFile ?? null) !== null
      if (active) await syncToEngine({ restart: false })
      notify('mode')
      schedulePersist()
    },

    /* ── queue editing ─────────────────────────────────────── */
    async enqueue(ids, position = 'end') {
      if (ids.length === 0) return
      const keep = currentId()
      const afterCurrent = position === 'next'
      // "Next" is the slot after the playing entry. Non-shuffle keeps `plays` as
      // a mirror of `queue`, so the cursor *is* the queue index and `cursor + 1`
      // stays exact even when the id appears twice — an id lookup would find the
      // first copy instead (B13). Shuffle's cursor indexes `plays`, so the queue
      // position has to come from the entry itself.
      const queueAt = afterCurrent
        ? (state.mode === 'shuffle'
            ? (keep === null ? state.queue.length : state.queue.indexOf(keep) + 1)
            : state.cursor + 1)
        : state.queue.length
      state.queue.splice(Math.max(0, queueAt), 0, ...ids)

      if (afterCurrent && state.mode === 'shuffle') {
        // Shuffle owns `plays`, and the cursor is an index into it. Splicing the
        // play order directly keeps "next" meaning the very next slot and leaves
        // the rest of the round intact; rebuilding would reshuffle the entries
        // away from the slot the user just asked for.
        state.plays.splice(Math.max(0, state.cursor + 1), 0, ...ids)
      } else {
        rebuildPlays({ keepCurrent: true })
        if (keep !== null) state.cursor = Math.max(0, state.plays.indexOf(keep))
      }

      await syncToEngine({ restart: false })
      notify('queue')
      schedulePersist()
    },

    async removeAt(index) {
      if (index < 0 || index >= state.queue.length) return
      const removedWasCurrent = state.queue[index] === currentId()
      state.queue.splice(index, 1)
      const keep = currentId()
      rebuildPlays({ keepCurrent: true })
      if (keep !== null) state.cursor = Math.max(0, state.plays.indexOf(keep))
      await syncToEngine({ restart: removedWasCurrent })
      notify('queue')
      schedulePersist()
    },

    async move(from, to) {
      if (from === to) return
      if (from < 0 || from >= state.queue.length || to < 0 || to >= state.queue.length) return
      const keep = currentId()
      const [item] = state.queue.splice(from, 1)
      state.queue.splice(to, 0, item)
      rebuildPlays({ keepCurrent: true })
      if (keep !== null) state.cursor = Math.max(0, state.plays.indexOf(keep))
      await syncToEngine({ restart: false })
      notify('queue')
      schedulePersist()
    },

    async clear() {
      state.queue = []
      state.plays = []
      state.cursor = -1
      state.playing = false
      state.positionMs = 0
      try { await engine.command('stop') } catch { /* down */ }
      notify('queue')
      schedulePersist()
    },

    /** Replace the queue without interrupting the current track. */
    async setQueue(ids) {
      const keep = currentId()
      state.queue = ids.slice()
      rebuildPlays({ keepCurrent: true })
      if (keep !== null) {
        const index = state.plays.indexOf(keep)
        state.cursor = index >= 0 ? index : Math.max(0, Math.min(state.cursor, state.plays.length - 1))
      } else {
        state.cursor = state.plays.length > 0 ? 0 : -1
      }
      await syncToEngine({ restart: keep === null })
      notify('queue')
      schedulePersist()
    },

    /** Drop ids that were removed from the library, keeping the current track. */
    async prune(missingIds) {
      if (missingIds.size === 0) return
      const keep = currentId()
      state.queue = state.queue.filter((id) => !missingIds.has(id))
      rebuildPlays({ keepCurrent: true })
      if (keep === null) return
      if (!state.plays.includes(keep)) {
        state.cursor = Math.max(0, Math.min(state.cursor, state.plays.length - 1))
        await syncToEngine({ restart: true })
      }
      notify('queue')
    },

    snapshot() {
      const id = currentId()
      // mpv is the authority for "is sound coming out": pause plus idle-active
      // covers auto-advance, manual pause, end of queue and device errors.
      const engineRunning = engine.state.status === 'running'
      const playing = engineRunning && engine.state.pause !== true && engine.state.idleActive !== true
      const track = id === null ? null : resolveTrack(id)
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

