/**
 * mpv supervisor: one long-lived mpv process per Harness profile, driven over
 * the Windows named-pipe JSON IPC channel.
 *
 * Everything audio-related happens inside mpv: file reading, decoding,
 * buffering, playlist advance and audio output. This module only issues
 * commands and mirrors mpv's own properties, so the Harness event loop never
 * touches PCM data.
 */
import net from 'node:net'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const CONNECT_TIMEOUT_MS = 8000
const COMMAND_TIMEOUT_MS = 6000
/** How long a playlist write may take to become visible in mpv's own state. */
const PLAYLIST_SYNC_TIMEOUT_MS = 2000
const PLAYLIST_SYNC_POLL_MS = 20

export function createEngine({ processes, log, config }) {
  const listeners = new Set()
  const waiters = new Set()
  const emit = (event) => {
    for (const listener of listeners) { try { listener(event) } catch { /* listener bug */ } }
    if (event.type === 'fileLoaded' || event.type === 'endFile') {
      for (const waiter of [...waiters]) {
        if (waiter.match(event)) { waiters.delete(waiter); waiter.resolve(event) }
      }
    }
  }

  function waitFor(match, timeoutMs) {
    return new Promise((resolve) => {
      const waiter = { match, resolve }
      waiters.add(waiter)
      setTimeout(() => { if (waiters.delete(waiter)) resolve(null) }, timeoutMs)
    })
  }

  let childRef = null
  let socket = null
  let buffer = ''
  let nextRequestId = 1
  const pending = new Map()
  let connecting = null
  let disposed = false
  let restartTimer = null
  let restartAttempts = 0

  const state = {
    status: 'stopped', // stopped | starting | running | error
    error: null,
    binary: null,
    audioOut: null, // device-side params, the honest "what actually left the machine"
    audioDecoded: null, // decoded PCM params
    codec: null,
    ao: null,
    device: null,
    exclusive: Boolean(config?.exclusiveAudio),
    playlistPos: 0,
    playlistCount: 0,
    eofReached: false,
    idleActive: true,
    durationMs: null,
    pause: false,
    currentFile: null, // mpv's own `path`: the file that is really playing
  }

  const logs = []
  const record = (level, message) => {
    const line = `${new Date().toISOString()} [${level}] ${message}`
    logs.push(line)
    if (logs.length > 400) logs.splice(0, logs.length - 400)
    log?.(level, message)
  }

  function resetIpc() {
    for (const [, entry] of pending) { clearTimeout(entry.timer); entry.reject(new Error('engine restarted')) }
    pending.clear()
    buffer = ''
    try { socket?.destroy() } catch { /* gone */ }
    socket = null
  }

  function resolveBinary() {
    const candidates = []
    if (config?.mpvPath) candidates.push(config.mpvPath)
    candidates.push(join(config?.pluginDir ?? '.', 'bin', 'mpv', 'mpv.exe'))
    candidates.push(join(homedir(), 'scoop', 'apps', 'mpv', 'current', 'mpv.exe'))
    candidates.push(join(homedir(), 'scoop', 'shims', 'mpv.exe'))
    candidates.push(join(process.env.LOCALAPPDATA ?? '', 'mpv', 'mpv.exe'))
    candidates.push('C:\\Program Files\\mpv\\mpv.exe')
    candidates.push('C:\\ProgramData\\chocolatey\\bin\\mpv.exe')
    for (const candidate of candidates) {
      if (candidate && existsSync(candidate)) return candidate
    }
    return null
  }

  async function ensureBinary() {
    if (state.binary !== null) return state.binary
    const local = resolveBinary()
    if (local !== null) { state.binary = local; return local }
    const resolved = await processes.resolve('mpv')
    if (resolved && resolved !== 'mpv') {
      // The service reports a canonical path only for executables it found.
      state.binary = resolved
      return resolved
    }
    state.binary = null
    return null
  }

  function handleMessage(message) {
    if (message.request_id !== undefined) {
      const entry = pending.get(message.request_id)
      if (entry !== undefined) {
        clearTimeout(entry.timer)
        pending.delete(message.request_id)
        entry.resolve(message)
      }
      return
    }
    if (message.event === undefined) return

    switch (message.event) {
      case 'property-change': {
        const { name, data } = message
        if (name === 'audio-out-params') { state.audioOut = data ?? null; emit({ type: 'audioOut', value: state.audioOut }) }
        else if (name === 'audio-params') { state.audioDecoded = data ?? null; emit({ type: 'audioDecoded', value: state.audioDecoded }) }
        else if (name === 'audio-codec-name') { state.codec = data ?? null }
        else if (name === 'current-ao') { state.ao = data ?? null }
        else if (name === 'audio-device') { state.device = data ?? null }
        else if (name === 'pause') { state.pause = Boolean(data); emit({ type: 'pause', value: state.pause }) }
        else if (name === 'playlist-pos') { state.playlistPos = Number(data ?? 0); emit({ type: 'pos', value: state.playlistPos, count: state.playlistCount }) }
        else if (name === 'playlist-count') { state.playlistCount = Number(data ?? 0); emit({ type: 'count', value: state.playlistCount }) }
        else if (name === 'eof-reached') { state.eofReached = Boolean(data) }
        else if (name === 'idle-active') { state.idleActive = Boolean(data); emit({ type: 'idle', value: state.idleActive }) }
        else if (name === 'duration') { state.durationMs = data === null ? null : Math.round(Number(data) * 1000) }
        else if (name === 'path') { state.currentFile = data ?? null; emit({ type: 'path', value: state.currentFile }) }
        break
      }
      case 'end-file':
        emit({ type: 'endFile', reason: message.reason, error: message.error })
        if (message.reason === 'error') record('error', `mpv end-file error: ${message.error ?? 'unknown'}`)
        break
      case 'start-file':
        emit({ type: 'startFile', playlistEntryId: message.playlist_entry_id })
        break
      case 'file-loaded':
        state.eofReached = false
        emit({ type: 'fileLoaded' })
        break
      case 'audio-reconfig':
        emit({ type: 'audioReconfig' })
        break
      default:
        break
    }
  }

  function attachSocket(sock) {
    socket = sock
    sock.setEncoding('utf8')
    sock.on('data', (chunk) => {
      buffer += chunk
      let index
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index).trim()
        buffer = buffer.slice(index + 1)
        if (line === '') continue
        let message
        try { message = JSON.parse(line) } catch { record('warn', 'mpv sent non-JSON IPC line'); continue }
        handleMessage(message)
      }
    })
    sock.on('error', (error) => { record('warn', `mpv IPC error: ${error.message}`) })
    sock.on('close', () => {
      if (disposed) return
      resetIpc()
      if (state.status === 'running') {
        state.status = 'error'
        state.error = 'IPC channel closed'
        emit({ type: 'status', value: state.status, error: state.error })
        scheduleRestart()
      }
    })
  }

  async function connectIpc(pipePath) {
    const started = Date.now()
    for (;;) {
      if (disposed) throw new Error('engine disposed')
      try {
        const sock = await new Promise((resolve, reject) => {
          const candidate = net.connect(pipePath)
          candidate.once('connect', () => resolve(candidate))
          candidate.once('error', reject)
        })
        attachSocket(sock)
        return
      } catch (error) {
        if (Date.now() - started > CONNECT_TIMEOUT_MS) throw error
        await delay(120)
      }
    }
  }

  function scheduleRestart() {
    if (disposed || restartTimer !== null) return
    if (restartAttempts >= 3) { record('error', 'mpv restart budget exhausted'); return }
    restartAttempts += 1
    const delayMs = 500 * restartAttempts
    record('warn', `restarting mpv in ${delayMs}ms (attempt ${restartAttempts})`)
    restartTimer = setTimeout(() => {
      restartTimer = null
      start().catch((error) => record('error', `restart failed: ${error.message}`))
    }, delayMs)
  }

  async function start() {
    if (disposed) throw new Error('engine disposed')
    if (state.status === 'running') return state
    state.status = 'starting'
    state.error = null
    emit({ type: 'status', value: state.status })

    const binary = await ensureBinary()
    if (binary === null) {
      state.status = 'error'
      state.error = 'mpv not found'
      emit({ type: 'status', value: state.status, error: state.error })
      throw new Error('mpv executable not found')
    }

    const pipeName = `dsh-music-${process.pid}-${randomBytes(4).toString('hex')}`
    const pipePath = `\\\\.\\pipe\\${pipeName}`
    const argv = [
      binary,
      '--idle=yes',
      '--force-window=no',
      '--no-video',
      '--no-terminal',
      '--no-input-default-bindings',
      '--no-input-cursor',
      '--audio-display=no',
      '--gapless-audio=weak',
      '--prefetch-playlist=yes',
      '--volume-max=100',
      '--keep-open=no',
      '--resume-playback=no',
      '--save-position-on-quit=no',
      '--osd-level=0',
      '--msg-level=all=warn',
      `--ao=${config?.ao === 'null' ? 'null' : 'wasapi'}`,
      '--audio-exclusive=' + (state.exclusive ? 'yes' : 'no'),
      '--audio-channels=auto-safe',
      `--input-ipc-server=${pipePath}`,
    ]

    const handle = processes.spawn({ argv, cwd: config?.pluginDir ?? process.cwd(), env: { MPV_HOME: '' } })
    childRef = handle
    record('info', `mpv starting (${binary}) exclusive=${state.exclusive}`)

    handle.done?.then((outcome) => {
      if (disposed) return
      if (childRef !== handle) return
      childRef = null
      resetIpc()
      state.status = 'error'
      state.error = `mpv exited (code ${outcome?.exitCode ?? '?'})`
      emit({ type: 'status', value: state.status, error: state.error })
      scheduleRestart()
    })

    connecting = connectIpc(pipePath)
    try {
      await connecting
    } finally {
      connecting = null
    }

    state.status = 'running'
    state.error = null
    restartAttempts = 0
    await observeAll()
    emit({ type: 'status', value: state.status })
    return state
  }

  async function observeAll() {
    const properties = [
      ['pause', 1], ['playlist-pos', 2], ['playlist-count', 3], ['audio-out-params', 4],
      ['audio-params', 5], ['audio-codec-name', 6], ['current-ao', 7], ['audio-device', 8],
      ['eof-reached', 9], ['idle-active', 10], ['duration', 11], ['path', 12],
    ]
    for (const [name, id] of properties) {
      try { await command('observe_property', id, name) } catch { /* property may not exist yet */ }
    }
  }

  function command(...args) {
    if (socket === null) return Promise.reject(new Error('mpv IPC is not connected'))
    const request_id = nextRequestId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(request_id)
        reject(new Error(`mpv command timed out: ${args[0]}`))
      }, COMMAND_TIMEOUT_MS)
      pending.set(request_id, { resolve, reject, timer })
      try {
        socket.write(`${JSON.stringify({ command: args, request_id })}\n`)
      } catch (error) {
        clearTimeout(timer)
        pending.delete(request_id)
        reject(error)
      }
    })
  }

  async function getProperty(name) {
    const response = await command('get_property', name)
    if (response.error !== 'success') return null
    return response.data ?? null
  }

  /** The facts a caller needs to map its own order onto mpv's playlist. */
  async function playlistFacts() {
    const pos = await getProperty('playlist-pos')
    const count = await getProperty('playlist-count')
    const file = await getProperty('path')
    return {
      at: typeof pos === 'number' ? pos : null,
      seen: typeof file === 'string' ? file : null,
      pos: typeof pos === 'number' ? pos : null,
      count: typeof count === 'number' ? count : null,
      currentFile: typeof file === 'string' ? file : null,
    }
  }

  /**
   * Read the actual filenames mpv holds from `start`, `count` entries.
   * This is what turns "the count is right" into "the list is right".
   */
  async function readPlaylistSlice(start, count) {
    const out = []
    for (let i = start; i < start + count; i++) {
      const name = await getProperty(`playlist/${i}/filename`)
      out.push(typeof name === 'string' ? name : null)
    }
    return out
  }

  /**
   * Wait until mpv reports exactly `expected` playlist entries. This is the
   * difference between "the command was accepted" and "the playlist is what the
   * caller asked for".
   */
  async function awaitPlaylistCount(expected) {
    const deadline = Date.now() + PLAYLIST_SYNC_TIMEOUT_MS
    let count = await getProperty('playlist-count')
    while (count !== expected) {
      if (Date.now() > deadline) return { ok: false, reason: 'timeout', count }
      await delay(PLAYLIST_SYNC_POLL_MS)
      count = await getProperty('playlist-count')
    }
    return { ok: true, reason: 'ok', count }
  }

  return {
    get state() { return { ...state, logs: undefined } },
    logs: () => logs.slice(),
    on(listener) { listeners.add(listener); return () => listeners.delete(listener) },

    start,
    async stop() {
      disposed = true
      if (restartTimer !== null) { clearTimeout(restartTimer); restartTimer = null }
      try { if (socket !== null) await Promise.race([command('quit'), delay(800)]) } catch { /* already gone */ }
      resetIpc()
      const handle = childRef
      childRef = null
      if (handle !== null) {
        const exited = await Promise.race([handle.done, delay(2500).then(() => 'timeout')])
        if (exited === 'timeout') handle.terminate()
      }
      state.status = 'stopped'
    },
    async revive() {
      disposed = false
      restartAttempts = 0
      return start()
    },

    /** Rebuild the process with new output options (exclusive mode switch). */
    async restart({ exclusive } = {}) {
      if (typeof exclusive === 'boolean') state.exclusive = exclusive
      try { if (socket !== null) await Promise.race([command('quit'), delay(800)]) } catch { /* already gone */ }
      resetIpc()
      const handle = childRef
      childRef = null
      if (handle !== null) {
        const exited = await Promise.race([handle.done, delay(2500).then(() => 'timeout')])
        if (exited === 'timeout') handle.terminate()
      }
      disposed = false
      restartAttempts = 0
      return start()
    },

    command,
    getProperty,
    async pause(flag) { await command('set_property', 'pause', Boolean(flag)); return true },
    async seek(ms) { await command('seek', Math.max(0, ms / 1000), 'absolute+exact'); return true },
    async setVolume(percent) { await command('set_property', 'volume', clamp(percent, 0, 100)); return true },
    async setMute(flag) { await command('set_property', 'mute', Boolean(flag)); return true },

    /**
     * Replace the playlist with `paths` and start at `index`.
     *
     * Resolves only after mpv reports the whole list, so `ok` means "the
     * playlist reached the requested shape", not "the commands were accepted".
     * `at` / `seen` describe where `paths[0]` sits in mpv's playlist and which
     * file mpv had there, which is what lets the caller map its own order onto
     * a playlist it cannot read.
     */
    async load(paths, index, startMs = 0) {
      const list = paths.filter((p) => typeof p === 'string' && p !== '')
      if (list.length === 0) {
        await command('stop')
        return { ok: false, reason: 'no-paths', at: null, seen: null, pos: null, count: 0, currentFile: null }
      }
      const first = list[index] ?? list[0]
      const opened = waitFor((event) => event.type === 'fileLoaded' || event.type === 'endFile', 6000)
      await command('loadfile', first, 'replace')
      if (await opened === null) {
        return { ok: false, reason: 'timeout', at: 0, seen: null, pos: null, count: null, currentFile: null }
      }
      if (startMs > 0) {
        try { await command('seek', startMs / 1000, 'absolute+exact') } catch { /* seek may race the open */ }
      }
      await command('set_property', 'pause', false)
      for (let i = 1; i < list.length; i++) await command('loadfile', list[i], 'append')
      const confirmed = await awaitPlaylistCount(list.length)
      const facts = await playlistFacts()
      return { ok: confirmed.ok, reason: confirmed.reason, ...facts, at: 0, seen: list[0] }
    },

    /**
     * Make every entry after the current one equal `tail`, without touching the
     * current entry.
     *
     * `expectCurrent` is the file the caller believes is playing. If mpv has
     * already moved on, nothing is written and `current-moved` comes back with
     * the facts, so the caller can re-derive instead of being silently
     * overwritten. `ok` again means mpv reached the requested shape.
     */
    async rewriteTail({ expectCurrent = null, tail = [] } = {}) {
      const list = (tail ?? []).filter((p) => typeof p === 'string' && p !== '')
      const before = await playlistFacts()
      if (before.pos === null || before.count === null) {
        return { ok: false, reason: 'no-current', ...before }
      }
      if (expectCurrent !== null && before.currentFile !== expectCurrent) {
        return { ok: false, reason: 'current-moved', ...before }
      }
      for (let i = before.count - 1; i > before.pos; i--) {
        try { await command('playlist-remove', i) } catch { /* index already gone */ }
      }
      for (const path of list) await command('loadfile', path, 'append')
      const confirmed = await awaitPlaylistCount(before.pos + 1 + list.length)
      if (!confirmed.ok) {
        return { ok: false, reason: confirmed.reason, ...(await playlistFacts()), at: before.pos, seen: before.currentFile }
      }

      // A matching count does not prove the count is made of the right files.
      // Read the entries back before claiming success.
      const expected = expectCurrent === null ? list : [expectCurrent, ...list]
      const after = await playlistFacts()
      if (after.pos !== before.pos) {
        // mpv moved on while the write was landing; the caller re-derives.
        return { ok: false, reason: 'current-moved', ...after, at: before.pos, seen: before.currentFile }
      }
      const actual = await readPlaylistSlice(before.pos, expected.length)
      const mismatch = expected.findIndex((path, index) => actual[index] !== path)
      const settled = await playlistFacts()
      if (mismatch !== -1) {
        return {
          ok: false,
          reason: 'playlist-mismatch',
          ...settled,
          at: before.pos,
          seen: actual[0] ?? settled.currentFile,
          mismatch,
        }
      }
      return { ok: true, reason: 'ok', ...settled, at: before.pos, seen: expectCurrent ?? actual[0] ?? settled.currentFile }
    },

    async next() { await command('playlist-next', 'force'); return true },
    async prev() {
      const pos = await getProperty('playlist-pos')
      if (pos !== null && pos <= 0) return false
      await command('playlist-prev', 'force')
      return true
    },
  }
}

function clamp(value, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return min
  return Math.min(max, Math.max(min, number))
}

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
