/**
 * Playback state machine: queue, playback order, cursor, modes, volume and the
 * persisted resume state. It owns no audio: every change becomes an mpv command.
 *
 * Design notes
 *  - `queue` is what the user sees; `plays` is the materialised order actually
 *    handed to mpv (shuffle produces a permutation, repeat-one keeps a
 *    single-entry playlist so a manual "next" still advances).
 *  - mpv mirrors the remainder of `plays`, which is what makes Gapless advance
 *    work; `baseCursor` maps mpv's `playlist-pos` back onto `plays`.
 *  - Position is sampled once per second and interpolated by the UI, so no
 *    per-frame IPC or React re-render is involved.
 */
import { delay } from './engine.js'

export const MODES = ['one', 'all', 'shuffle']

export function createPlayer({ engine, db, resolveTrack, onChange, log, prefs }) {
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
      if (path === undefined) { return }
      await engine.load([path], 0, startMs)
      state.baseCursor = state.cursor
      return
    }

    const remainder = state.plays.slice(state.cursor)
    const paths = pathsFor(remainder)
    if (paths.length === 0) return

    if (restart) {
      await engine.load(paths, 0, startMs)
      state.baseCursor = state.cursor
      return
    }
    await engine.trimTail()
    const tailIds = remainder.slice(1)
    const tailPaths = pathsFor(tailIds)
    if (tailPaths.length > 0) await engine.append(tailPaths)
  }

  function shuffle(ids) {
    const copy = ids.slice()
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
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
          state.playing = !event.value
          notify('transport')
          schedulePersist()
          break
        case 'status':
          notify('engine')
          break
        case 'endFile': {
          if (event.reason === 'eof') handleEndOfList()
          else if (event.reason === 'error') {
            state.lastError = event.error ?? 'decode error'
            log?.('error', `playback error: ${state.lastError}`)
            void next(true)
          }
          break
        }
        case 'fileLoaded':
          state.loading = false
          notify('track')
          break
        default:
          break
      }
    })
  }

  async function handleEndOfList() {
    const atEnd = state.cursor >= state.plays.length - 1
    if (!atEnd) {
      // mpv already advanced; the `pos` event updated the cursor.
      if (state.mode === 'one') { await seek(0); await resume() }
      return
    }
    if (state.mode === 'one') { await seek(0); await resume(); return }
    if (state.mode === 'all' || state.mode === 'shuffle') {
      state.cursor = state.mode === 'shuffle' ? 0 : 0
      if (state.mode === 'shuffle') rebuildPlays({ keepCurrent: false })
      else state.cursor = 0
      state.positionMs = 0
      await syncToEngine({ restart: true })
      notify('track')
      return
    }
    state.playing = false
    notify('transport')
  }

  const api = {
    state,
    on(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    currentId,

    async init() {
      attachEngine()
      startPolling()
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
      notify('restore')
      return api
    },

    /** Replace the queue and start at `startIndex`. */
    async playQueue(ids, startIndex = 0, { restart = true } = {}) {
      state.queue = ids.slice()
      const picked = ids[startIndex] ?? ids[0] ?? null
      rebuildPlays({ keepCurrent: false })
      state.cursor = picked === null ? -1 : Math.max(0, state.plays.indexOf(picked))
      state.positionMs = 0
      await engine.setVolume(state.volume)
      await engine.setMute(state.muted)
      await syncToEngine({ restart, startMs: 0 })
      try {
        const duration = await engine.getProperty('duration')
        if (typeof duration === 'number') state.durationMs = Math.round(duration * 1000)
      } catch { /* duration arrives with the next poll */ }
      notify('queue')
      schedulePersist()
    },

    async resume() {
      const id = currentId()
      if (id === null) return
      if (engine.state.pause) await engine.pause(false)
      else {
        const savedPosition = state.positionMs
        await syncToEngine({ restart: true, startMs: savedPosition })
      }
      state.playing = true
      notify('transport')
    },

    async pause() {
      await engine.pause(true)
      state.playing = false
      notify('transport')
      schedulePersist()
    },

    async toggle() {
      if (engine.state.pause) return api.resume()
      return api.pause()
    },

    async seek(ms) {
      const target = Math.max(0, Math.min(ms, state.durationMs || ms))
      await engine.seek(target)
      state.positionMs = target
      state.positionSampledAt = Date.now()
      notify('position')
    },

    async next(auto = false) {
      if (state.mode === 'one' && !auto) {
        await syncToEngine({ restart: true })
        notify('track')
        return
      }
      if (state.cursor < state.plays.length - 1) {
        state.cursor += 1
        state.positionMs = 0
        if (state.mode === 'one') await syncToEngine({ restart: true })
        else await syncToEngine({ restart: false })
        notify('track')
        schedulePersist()
        return
      }
      // last track
      if (state.mode === 'all' || state.mode === 'shuffle') {
        state.cursor = 0
        state.positionMs = 0
        await syncToEngine({ restart: true })
        notify('track')
      } else {
        state.playing = false
        notify('transport')
      }
    },

    async prev() {
      const position = state.positionMs
      if (position > 3000) { await api.seek(0); return }
      if (state.cursor > 0) {
        state.cursor -= 1
        state.positionMs = 0
        await syncToEngine({ restart: true })
        notify('track')
        schedulePersist()
        return
      }
      await api.seek(0)
    },

    async setVolume(value) {
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

    async setMode(mode) {
      if (!MODES.includes(mode)) throw new Error(`unknown mode ${mode}`)
      const keep = currentId()
      state.mode = mode
      rebuildPlays({ keepCurrent: true })
      if (keep !== null) state.cursor = Math.max(0, state.plays.indexOf(keep))
      await syncToEngine({ restart: true, startMs: state.positionMs })
      notify('mode')
      schedulePersist()
    },

    /* ── queue editing ─────────────────────────────────────── */
    async enqueue(ids, position = 'end') {
      if (ids.length === 0) return
      if (position === 'next') {
        const at = state.cursor + 1
        state.queue.splice(at, 0, ...ids)
        rebuildPlays({ keepCurrent: true })
        state.cursor = Math.max(0, state.plays.indexOf(currentId()))
        await syncToEngine({ restart: false })
      } else {
        state.queue.push(...ids)
        const keep = currentId()
        if (state.mode === 'shuffle') state.plays.push(...ids)
        else state.plays.push(...ids)
        if (keep !== null) state.cursor = Math.max(0, state.plays.indexOf(keep))
        await syncToEngine({ restart: false })
      }
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
      const stillThere = state.plays.includes(keep)
      if (!stillThere) {
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
      return {
        engineMode: 'mpv',
        engineStatus: engine.state.status,
        engineError: engine.state.error,
        trackId: id,
        queue: state.queue,
        cursor: state.cursor,
        mode: state.mode,
        playing,
        paused: engine.state.pause,
        positionMs: state.positionMs,
        positionSampledAt: state.positionSampledAt,
        durationMs: state.durationMs,
        volume: state.volume,
        muted: state.muted,
        audioOut: engine.state.audioOut,
        audioDecoded: engine.state.audioDecoded,
        codec: engine.state.codec,
        exclusive: engine.state.exclusive,
        ao: engine.state.ao,
        error: state.lastError,
      }
    },

    async dispose() {
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
