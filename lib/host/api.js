/**
 * Host HTTP surface for the Client half.
 *
 * One POST endpoint carries every command (`{op, ...}` → `{ok, data|error}`),
 * which keeps the route table boring and the origin check in one place. Two GET
 * endpoints exist only because `<img>`/`<audio>` cannot POST: cover bytes and
 * (for the browser fallback engine) ranged audio streaming.
 *
 * Only library ids are accepted — never a client-supplied filesystem path.
 */
import { createReadStream, statSync } from 'node:fs'
import { MIME_BY_EXT } from './covers.js'

const MAX_BODY_BYTES = 1024 * 1024

export function createApi({ library, player, engine, covers, config, dataDir, db, processes, log }) {
  const coverCache = new Map() // key -> {bytes, mime, etag, at}
  let startedAt = Date.now()

  async function dispatch(op, payload) {
    switch (op) {
      /* ── status ─────────────────────────────────────────── */
      case 'status': {
        const snapshot = player === null ? null : player.snapshot()
        return {
          engineMode: player === null ? 'browser' : 'mpv',
          engine: {
            status: engine === null ? 'unavailable' : engine.state.status,
            error: engine === null ? 'mpv not found — browser fallback in use' : engine.state.error,
            binary: engine === null ? null : engine.state.binary,
            exclusive: engine === null ? false : engine.state.exclusive,
            ao: engine === null ? null : engine.state.ao,
            currentFile: engine === null ? null : engine.state.currentFile,
            audioOut: engine === null ? null : engine.state.audioOut,
            audioDecoded: engine === null ? null : engine.state.audioDecoded,
            codec: engine === null ? null : engine.state.codec,
          },
          player: snapshot,
          library: {
            tracks: library.all().filter((t) => !t.missing).length,
            roots: library.roots().length,
            scanning: library.scanning,
            revision: library.revision(),
          },
          uptimeMs: Date.now() - startedAt,
          prefs: db.getState('prefs') ?? {},
          version: config.version ?? '1.0.0',
        }
      }

      case 'prefs.set': {
        const current = db.getState('prefs') ?? {}
        const next = { ...current, ...(payload?.patch ?? {}) }
        db.setState('prefs', next)
        return next
      }

      /* ── library ────────────────────────────────────────── */
      case 'library.list': return library.list(payload ?? {})
      case 'library.groups': return library.groups(payload?.kind ?? 'folder')
      case 'library.detail': return library.detail(payload?.id)
      case 'library.lrc': return library.lrcFor(payload?.id)
      case 'library.scan': {
        if (library.scanning) return { started: false, reason: 'already running' }
        const rootId = payload?.rootId ?? null
        void library.scan(rootId, { onProgress: (progress) => log?.('info', `scan ${JSON.stringify(progress)}`) })
          .then(() => log?.('info', 'scan finished'))
          .catch((error) => log?.('error', `scan failed: ${error.message}`))
        return { started: true }
      }
      case 'library.scanStatus': return library.scanRuns()
      case 'library.remove': library.removeFromLibrary(payload?.id); return true
      case 'library.restore': library.restore(payload?.id); return true

      case 'roots.list': return library.roots()
      case 'roots.add': {
        const path = String(payload?.path ?? '').trim()
        if (path === '') throw new Error('path is required')
        const info = statSync(path, { throwIfNoEntry: false })
        if (!info || !info.isDirectory()) throw new Error('not a directory: ' + path)
        const root = library.addRoot(path)
        void library.scan(root.id, { onProgress: () => {} }).catch((error) => log?.('error', `scan failed: ${error.message}`))
        return root
      }
      case 'roots.remove': library.removeRoot(payload?.id); return true

      /* ── metadata editing (never touches the file) ──────── */
      case 'track.override': return library.setOverride(payload?.id, payload?.patch ?? {})
      case 'track.override.clear': return library.clearOverride(payload?.id)
      case 'album.override': {
        library.setAlbumOverride(payload?.albumKey, payload?.patch ?? {})
        return true
      }
      case 'album.setArtist': {
        const artist = String(payload?.artist ?? '').trim()
        for (const albumKey of payload?.albumKeys ?? []) {
          library.setAlbumOverride(albumKey, { artist: artist === '' ? null : artist })
        }
        return true
      }
      case 'favorite.set': return library.setFavorite(payload?.id, payload?.on !== false)

      /* ── playlists ──────────────────────────────────────── */
      case 'playlists.list': return library.playlists()
      case 'playlists.create': return library.createPlaylist(payload?.name ?? '')
      case 'playlists.rename': library.renamePlaylist(payload?.id, payload?.name ?? ''); return true
      case 'playlists.delete': library.deletePlaylist(payload?.id); return true
      case 'playlists.add': return library.addToPlaylist(payload?.id, payload?.trackIds ?? [])
      case 'playlists.setItems': library.setPlaylistItems(payload?.id, payload?.trackIds ?? []); return true

      /* ── queue & transport ──────────────────────────────── */
      case 'queue.play': {
        if (player === null) throw new Error('no audio engine available')
        await player.playQueue(payload?.ids ?? [], payload?.startIndex ?? 0)
        return player.snapshot()
      }
      case 'queue.set': {
        if (player === null) throw new Error('no audio engine available')
        await player.setQueue(payload?.ids ?? [])
        return player.snapshot()
      }
      case 'queue.enqueue': {
        if (player === null) throw new Error('no audio engine available')
        await player.enqueue(payload?.ids ?? [], payload?.position === 'next' ? 'next' : 'end')
        return player.snapshot()
      }
      case 'queue.remove': {
        if (player === null) throw new Error('no audio engine available')
        await player.removeAt(Number(payload?.index ?? -1))
        return player.snapshot()
      }
      case 'queue.move': {
        if (player === null) throw new Error('no audio engine available')
        await player.move(Number(payload?.from ?? -1), Number(payload?.to ?? -1))
        return player.snapshot()
      }
      case 'queue.clear': {
        if (player === null) throw new Error('no audio engine available')
        await player.clear()
        return player.snapshot()
      }
      case 'player.play': {
        if (player === null) throw new Error('no audio engine available')
        await player.resume()
        return player.snapshot()
      }
      case 'player.pause': {
        if (player === null) throw new Error('no audio engine available')
        await player.pause()
        return player.snapshot()
      }
      case 'player.toggle': {
        if (player === null) throw new Error('no audio engine available')
        await player.toggle()
        return player.snapshot()
      }
      case 'player.next': {
        if (player === null) throw new Error('no audio engine available')
        await player.next(false)
        return player.snapshot()
      }
      case 'player.prev': {
        if (player === null) throw new Error('no audio engine available')
        await player.prev()
        return player.snapshot()
      }
      case 'player.seek': {
        if (player === null) throw new Error('no audio engine available')
        await player.seek(Number(payload?.ms ?? 0))
        return player.snapshot()
      }
      case 'player.volume': {
        if (player === null) throw new Error('no audio engine available')
        await player.setVolume(Number(payload?.value ?? 100))
        return player.snapshot()
      }
      case 'player.mute': {
        if (player === null) throw new Error('no audio engine available')
        await player.setMuted(payload?.value !== false)
        return player.snapshot()
      }
      case 'player.mode': {
        if (player === null) throw new Error('no audio engine available')
        await player.setMode(String(payload?.mode ?? 'all'))
        return player.snapshot()
      }
      case 'player.state': return player === null ? null : player.snapshot()

      /* ── file location & custom covers ──────────────────── */
      case 'track.reveal': {
        const track = library.track(payload?.id)
        if (track === null) throw new Error('track not found')
        const result = processes.spawn({ argv: ['explorer.exe', `/select,${track.path}`] })
        void result.done
        return true
      }
      case 'track.coverFromDataUrl': {
        const file = await saveDataUrlCover(payload?.dataUrl, `track-${payload?.id ?? 'x'}`)
        library.setOverride(payload?.id, { coverPath: file })
        return file
      }
      case 'album.coverFromDataUrl': {
        const file = await saveDataUrlCover(payload?.dataUrl, `album-${String(payload?.albumKey ?? 'x').length}`)
        library.setAlbumOverride(payload?.albumKey, { coverPath: file })
        return file
      }

      /* ── audio options ──────────────────────────────────── */
      case 'engine.exclusive': {
        if (engine === null) throw new Error('no audio engine available')
        const wanted = payload?.value === true
        db.setState('audio.exclusive', wanted)
        await engine.restart({ exclusive: wanted })
        return { exclusive: engine.state.exclusive, status: engine.state.status }
      }
      case 'engine.devices': {
        if (engine === null) return []
        try {
          const list = await engine.getProperty('audio-device-list')
          return Array.isArray(list) ? list.map((d) => ({ name: d.name, description: d.description })) : []
        } catch { return [] }
      }

      /* ── diagnostics ────────────────────────────────────── */
      case 'diag.logs': return engine === null ? [] : engine.logs()
      case 'diag.engineRestart': {
        if (engine === null) throw new Error('no audio engine available')
        await engine.revive()
        return engine.state
      }
      case 'cache.clear': {
        covers.invalidate()
        coverCache.clear()
        return true
      }
      case 'db.backup': {
        const file = `${dataDir}/backups/library-${new Date().toISOString().replace(/[:.]/g, '-')}.db`
        await db.backup(file)
        return { file }
      }

      default:
        throw new Error(`unknown op: ${String(op)}`)
    }
  }

  async function handleApi(req, res) {
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST only' })
    if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'cross-origin request rejected' })
    let body
    try { body = await readJson(req) } catch (error) { return sendJson(res, 400, { ok: false, error: error.message }) }
    const op = typeof body?.op === 'string' ? body.op : ''
    try {
      const data = await dispatch(op, body)
      sendJson(res, 200, { ok: true, data: data === undefined ? null : data })
    } catch (error) {
      log?.('warn', `api ${op} failed: ${error?.message ?? error}`)
      sendJson(res, 200, { ok: false, error: String(error?.message ?? error) })
    }
  }

  async function handleCover(req, res, url) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { ok: false, error: 'GET only' })
    if (!sameOrigin(req)) { res.writeHead(403); return res.end() }
    const trackId = url.searchParams.get('id')
    const albumKey = url.searchParams.get('album')
    let resolved = trackId !== null ? await library.coverFor(trackId) : null
    if (resolved === null && albumKey !== null) {
      const first = library.all().find((t) => t.albumKey === albumKey && !t.missing)
      if (first !== undefined) resolved = await library.coverFor(first.id)
    }
    if (resolved === null) { res.writeHead(404); return res.end() }

    const stat = covers.statOf(resolved.file)
    if (stat === null) { res.writeHead(404); return res.end() }
    const etag = `"${stat.size}-${Math.round(stat.mtimeMs)}-${resolved.source}"`
    if (req.headers['if-none-match'] === etag) { res.writeHead(304); return res.end() }

    const cacheKey = `${resolved.file}:${etag}`
    const cached = coverCache.get(cacheKey)
    if (cached !== undefined) {
      res.writeHead(200, { 'content-type': cached.mime, etag, 'cache-control': 'private, max-age=300' })
      return res.end(req.method === 'HEAD' ? undefined : cached.bytes)
    }
    try {
      const { readFileSync } = await import('node:fs')
      const bytes = readFileSync(resolved.file)
      if (coverCache.size > 64) coverCache.clear()
      coverCache.set(cacheKey, { bytes, mime: resolved.mime })
      res.writeHead(200, {
        'content-type': resolved.mime,
        etag,
        'content-length': bytes.length,
        'cache-control': 'private, max-age=300',
      })
      return res.end(req.method === 'HEAD' ? undefined : bytes)
    } catch (error) {
      log?.('warn', `cover read failed: ${error.message}`)
      res.writeHead(404)
      return res.end()
    }
  }

  /** Ranged streaming for the browser fallback engine only. */
  async function handleStream(req, res, url) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { ok: false, error: 'GET only' })
    if (!sameOrigin(req)) { res.writeHead(403); return res.end() }
    const id = url.searchParams.get('id')
    const track = id === null ? null : library.track(id)
    if (track === null) { res.writeHead(404); return res.end() }
    let size
    try { size = statSync(track.path).size } catch { res.writeHead(404); return res.end() }
    const mime = MIME_BY_EXT[track.ext] ?? 'application/octet-stream'
    const range = req.headers.range
    if (typeof range === 'string' && range.startsWith('bytes=')) {
      const [startRaw, endRaw] = range.slice(6).split('-')
      const start = Number(startRaw) || 0
      const end = endRaw === undefined || endRaw === '' ? size - 1 : Math.min(Number(endRaw), size - 1)
      if (start >= size || start > end) {
        res.writeHead(416, { 'content-range': `bytes */${size}` })
        return res.end()
      }
      res.writeHead(206, {
        'content-type': mime,
        'content-length': end - start + 1,
        'content-range': `bytes ${start}-${end}/${size}`,
        'accept-ranges': 'bytes',
      })
      if (req.method === 'HEAD') return res.end()
      return createReadStream(track.path, { start, end }).pipe(res)
    }
    res.writeHead(200, { 'content-type': mime, 'content-length': size, 'accept-ranges': 'bytes' })
    if (req.method === 'HEAD') return res.end()
    return createReadStream(track.path).pipe(res)
  }

  async function saveDataUrlCover(dataUrl, tag) {
    const match = /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl ?? ''))
    if (match === null) throw new Error('unsupported image payload')
    const bytes = Buffer.from(match[2], 'base64')
    if (bytes.length > 8 * 1024 * 1024) throw new Error('image larger than 8 MB')
    const ext = match[1] === 'png' ? '.png' : match[1] === 'webp' ? '.webp' : '.jpg'
    const { mkdirSync, writeFileSync } = await import('node:fs')
    const { createHash } = await import('node:crypto')
    const dir = `${dataDir}/covers`
    mkdirSync(dir, { recursive: true })
    const name = `user-${createHash('sha1').update(tag + String(bytes.length) + Date.now()).digest('hex').slice(0, 12)}${ext}`
    const file = `${dir}/${name}`
    writeFileSync(file, bytes)
    return file
  }

  /** Single entry point for the prefix route `/music`. */
  async function handle(req, res) {
    let url
    try { url = new URL(String(req.url ?? '/'), 'http://local') } catch { res.writeHead(400); return res.end() }
    if (url.pathname === '/music/api') return handleApi(req, res)
    if (url.pathname === '/music/cover') return handleCover(req, res, url)
    if (url.pathname === '/music/stream') return handleStream(req, res, url)
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('not found')
  }

  return {
    markStarted() { startedAt = Date.now() },
    dispatch,
    handle,
    routes: [
      { kind: 'prefix', path: '/music' },
    ],
  }
}

function sameOrigin(req) {
  const remote = String(req.socket?.remoteAddress ?? '')
  const loopback = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1' || remote === ''
  const host = typeof req.headers.host === 'string' ? req.headers.host : ''
  const hostLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host)
  if (loopback && hostLocal) return true
  const origin = req.headers.origin
  if (origin === undefined || origin === '' || origin === 'null') return loopback
  if (typeof origin === 'string' && /^app:/i.test(origin)) return true
  try { return new URL(origin).host === host } catch { return false }
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) })
  res.end(body)
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) { reject(new Error('body too large')); req.destroy(); return }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8').trim()
      if (text === '') return resolve({})
      try { resolve(JSON.parse(text)) } catch { reject(new Error('invalid JSON body')) }
    })
    req.on('error', reject)
  })
}
