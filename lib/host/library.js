/**
 * Library: filesystem scan, index, derived views, metadata editing.
 *
 * Facts vs. guesses
 *  - ffprobe output is the authority for container/codec/rate/bits/channels.
 *  - Embedded tags come next; the filename parser only fills the gaps.
 *  - A quality string inside a filename is kept as a *claim* so the detail view
 *    can compare it with the measurement.
 *  - Nothing here ever writes to, renames or moves a media file.
 */
import { readdir, stat } from 'node:fs/promises'
import { readFileSync, statSync } from 'node:fs'
import { join, relative, basename, dirname, extname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { parseFileName, folderLabel, albumShortName, trackOrder, naturalCompare, isAudioName } from './parser.js'
import { probeFile, specLabel, formatCodec, formatRate } from './probe.js'
import { trackId } from './db.js'
import { parseLrc } from './lrc.js'

const SCAN_CONCURRENCY = 4
const MAX_DEPTH = 32

export function createLibrary({ db, processes, ffprobePath, covers, log }) {
  let byId = new Map()
  let byPath = new Map()
  let ordered = []
  let favorites = new Set()
  let trackOverrides = new Map()
  let albumOverrides = new Map()
  let playlists = []
  let scanning = null
  let revision = 0

  /* ── index ───────────────────────────────────────────────── */

  function refresh() {
    revision += 1
    trackOverrides = db.listTrackOverrides()
    albumOverrides = db.listAlbumOverrides()
    favorites = db.listFavorites()
    playlists = db.listPlaylists()
    const rows = db.listTracks()
    byId = new Map()
    byPath = new Map()
    for (const row of rows) {
      const view = project(row)
      byId.set(view.id, view)
      byPath.set(view.path, view)
    }
    ordered = [...byId.values()].sort(trackOrder)
  }

  function project(row) {
    const parsed = parseFileName(row.basename)
    const tags = row.tags ?? {}
    const override = trackOverrides.get(row.id) ?? null
    const albumOverride = albumOverrides.get(row.albumKey) ?? null

    const tagTitle = typeof tags.title === 'string' ? tags.title.trim() : ''
    const tagArtist = typeof tags.artist === 'string' ? tags.artist.trim() : ''
    const tagAlbum = typeof tags.album === 'string' ? tags.album.trim() : ''

    const title = override?.title || tagTitle || row.titleGuess || parsed.title
    // Artist precedence: per-track override → album/folder override → embedded
    // tag. There is deliberately no filename inference.
    const artist = override?.artist || albumOverride?.artist || tagArtist || null
    const album = override?.album || tagAlbum || albumOverride?.title || folderLabel(basename(row.dir))
    const albumShort = override?.album ? override.album : albumShortName(album)
    const year = override?.year ?? row.yearGuess ?? (typeof tags.date === 'string' ? Number(String(tags.date).slice(0, 4)) || null : null)

    const measuredSpec = row.sampleRate || row.bitsPerSample || row.codec
      ? specLabel({ bitsPerSample: row.bitsPerSample, sampleRate: row.sampleRate, channels: row.channels, codec: row.codec })
      : ''

    return {
      id: row.id,
      path: row.path,
      dir: row.dir,
      folder: basename(row.dir),
      folderLabel: folderLabel(basename(row.dir)),
      basename: row.basename,
      ext: row.ext,
      size: row.size,
      mtimeMs: row.mtimeMs,
      container: row.container,
      codec: row.codec,
      sampleRate: row.sampleRate,
      bitsPerSample: row.bitsPerSample,
      channels: row.channels,
      bitrate: row.bitrate,
      durationMs: row.durationMs ?? 0,
      trackNo: row.trackNo ?? parsed.trackNo,
      title,
      artist,
      album,
      albumShort,
      albumKey: row.albumKey,
      year,
      qualityTag: row.qualityTag,
      measuredSpec,
      unknownTokens: row.unknownTokens ?? [],
      hasEmbeddedArt: row.hasEmbeddedArt,
      hasCover: covers.hasCover(
        { dir: row.dir, hasEmbeddedArt: row.hasEmbeddedArt, coverPath: override?.coverPath ?? null },
        albumOverrideFor(row.albumKey),
      ),
      coverSource: null,
      missing: row.missing,
      favorited: favorites.has(row.id),
      addedAt: row.addedAt,
      override: override ? { title: override.title, artist: override.artist, album: override.album, year: override.year, hasCover: Boolean(override.coverPath) } : null,
    }
  }

  function albumOverrideFor(albumKey) {
    return albumOverrides.get(albumKey) ?? null
  }

  function ensureFresh() {
    if (byId.size === 0 && db.listTracks().length > 0) refresh()
  }

  /* ── views ───────────────────────────────────────────────── */

  /**
   * Relevance first, then the requested order: a title hit outranks an album or
   * folder hit, which outranks a raw path hit. Without this, searching 「形神」
   * returns a whole album because the folder name contains the word.
   */
  function matchScore(track, query) {
    const needle = normalise(query)
    if (needle === '') return 1
    const title = normalise(track.title)
    if (title === needle) return 4
    if (title.startsWith(needle)) return 3.5
    if (title.includes(needle)) return 3
    const secondary = normalise(`${track.album}\u0000${track.artist ?? ''}\u0000${track.qualityTag ?? ''}\u0000${track.year ?? ''}`)
    if (secondary.includes(needle)) return 2
    const file = normalise(`${track.basename}\u0000${track.folder}`)
    if (file.includes(needle)) return 1.5
    const path = normalise(track.path)
    if (path.includes(needle)) return 1
    if (subsequence(title, needle)) return 0.8
    if (subsequence(file, needle)) return 0.6
    return 0
  }

  function sorted(tracks, sort) {
    const list = tracks.slice()
    switch (sort) {
      case 'title': return list.sort((a, b) => naturalCompare(a.title, b.title))
      case 'artist': return list.sort((a, b) => naturalCompare(a.artist ?? '\uffff', b.artist ?? '\uffff') || naturalCompare(a.title, b.title))
      case 'album': return list.sort((a, b) => naturalCompare(a.album, b.album) || trackOrder(a, b))
      case 'duration': return list.sort((a, b) => a.durationMs - b.durationMs)
      case 'added': return list.sort((a, b) => b.addedAt - a.addedAt)
      case 'folder': return list.sort((a, b) => naturalCompare(a.dir, b.dir) || trackOrder(a, b))
      default: return list.sort(trackOrder)
    }
  }

  function list({ view = 'all', query = '', sort = 'default', key = null, playlistId = null } = {}) {
    ensureFresh()
    let tracks = ordered.filter((t) => !t.missing)
    switch (view) {
      case 'favorites': tracks = tracks.filter((t) => t.favorited); break
      case 'recent': tracks = tracks.slice().sort((a, b) => b.addedAt - a.addedAt).slice(0, 200); break
      case 'playlist': {
        const playlist = playlists.find((p) => p.id === playlistId)
        const ids = playlist ? playlist.trackIds : []
        tracks = ids.map((id) => byId.get(id)).filter((t) => t !== undefined && !t.missing)
        break
      }
      case 'folder': if (key !== null) tracks = tracks.filter((t) => t.dir === key); break
      case 'album': if (key !== null) tracks = tracks.filter((t) => t.albumKey === key); break
      case 'artist': if (key !== null) tracks = tracks.filter((t) => (t.artist ?? '') === key); break
      default: break
    }
    if (query !== '') {
      const scored = tracks
        .map((track) => ({ track, score: matchScore(track, query) }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score || naturalCompare(a.track.title, b.track.title))
      return scored.map((entry) => publicTrack(entry.track))
    }
    if (view === 'playlist' && sort === 'default') return tracks.map(publicTrack)
    return sorted(tracks, sort).map(publicTrack)
  }

  function publicTrack(track) {
    const { override, ...rest } = track
    return { ...rest, hasOverride: override !== null }
  }

  function groups(kind) {
    ensureFresh()
    const buckets = new Map()
    for (const track of ordered) {
      if (track.missing) continue
      const key = kind === 'folder' ? track.dir
        : kind === 'album' ? track.albumKey
          : (track.artist ?? '')
      const existing = buckets.get(key)
      if (existing === undefined) {
        const parent = kind === 'folder' ? dirname(track.dir) : null
        buckets.set(key, {
          key,
          title: kind === 'folder' ? albumShortName(track.folderLabel) : kind === 'album' ? track.albumShort : (track.artist ?? ''),
          subtitle: kind === 'artist' ? '' : (track.artist ?? ''),
          parentTitle: parent !== null ? folderLabel(basename(parent)) : null,
          fullTitle: kind === 'folder' ? track.folderLabel : kind === 'album' ? track.album : null,
          trackCount: 0,
          durationMs: 0,
          year: track.year,
          trackId: track.id,
          path: kind === 'folder' ? track.dir : null,
        })
      }
      const bucket = buckets.get(key)
      bucket.trackCount += 1
      bucket.durationMs += track.durationMs
      if (bucket.year === null && track.year !== null) bucket.year = track.year
    }
    const values = [...buckets.values()]
    if (kind === 'artist') {
      return values.sort((a, b) => {
        if (a.key === '' ) return 1
        if (b.key === '') return -1
        return naturalCompare(a.title, b.title)
      })
    }
    if (kind === 'album') return values.sort((a, b) => naturalCompare(a.title, b.title))
    return values.sort((a, b) => naturalCompare(a.title, b.title))
  }

  /* ── scanning ────────────────────────────────────────────── */

  async function walk(rootPath, recursive, signal) {
    const files = []
    const stack = [{ dir: rootPath, depth: 0 }]
    while (stack.length > 0) {
      if (signal?.aborted) throw new Error('scan aborted')
      const { dir, depth } = stack.pop()
      let entries
      try { entries = await readdir(dir, { withFileTypes: true }) }
      catch (error) { log?.('warn', `cannot read ${dir}: ${error.message}`); continue }
      for (const entry of entries) {
        const full = join(dir, entry.name)
        if (entry.isSymbolicLink()) continue
        if (entry.isDirectory()) {
          if (!recursive || depth >= MAX_DEPTH) continue
          if (entry.name.startsWith('.')) continue
          stack.push({ dir: full, depth: depth + 1 })
          continue
        }
        if (!entry.isFile()) continue
        if (!isAudioName(entry.name)) continue
        files.push(full)
      }
    }
    return files.sort(naturalCompare)
  }

  /**
   * One run of one root.
   *
   * Every discovered file ends in exactly one outcome — `indexed`, `unchanged`
   * or `failed` — and `scanned` is their sum, so `total - scanned` always means
   * "no conclusion yet". That is what keeps an interrupted run honest instead
   * of letting it look complete.
   *
   * `skipped` in the persisted row means *unchanged*: an existing row whose
   * size and mtime still match. The column name predates this module; the
   * translation happens in `snapshot()` so nothing downstream has to guess.
   *
   * The ledger takes no dependencies: it is a counter with rules, not a
   * database writer. The caller decides when to persist a snapshot.
   */
  function createScanRun(rootId) {
    const record = {
      rootId,
      status: 'running',
      total: 0,
      scanned: 0,
      indexed: 0,
      unchanged: 0,
      failed: 0,
      missing: 0,
      relocated: 0,
      error: null,
      startedAt: Date.now(),
      finishedAt: null,
    }
    const snapshot = () => {
      const { unchanged, ...rest } = record
      return { ...rest, skipped: unchanged }
    }
    /** First useful reason wins: a later error never overwrites the cause. */
    const note = (reason) => {
      if (record.error !== null) return
      const text = typeof reason === 'string' ? reason.trim() : String(reason?.message ?? reason ?? '').trim()
      if (text !== '') record.error = text
    }
    return {
      snapshot,
      processed: () => record.scanned,
      discover(total) { record.total = total },
      indexed() { record.indexed += 1; record.scanned += 1 },
      unchanged() { record.unchanged += 1; record.scanned += 1 },
      failed(reason) {
        record.failed += 1
        record.scanned += 1
        note(reason)
      },
      sweep({ missing = 0, relocated = 0 }) {
        record.missing += missing
        record.relocated += relocated
      },
      /** The loop finished on its own: the numbers now decide the status. */
      complete() {
        const outstanding = record.total - record.scanned
        if (outstanding > 0) note(`${outstanding} of ${record.total} discovered files reached no outcome`)
        const nothingLanded = record.total > 0 && record.failed === record.total
        record.status = nothingLanded ? 'error' : record.failed > 0 || outstanding > 0 ? 'partial' : 'done'
        return snapshot()
      },
      /** Something threw: the run is an error, with the first reason preserved. */
      abort(cause) {
        record.status = 'error'
        note(cause)
      },
      /**
       * The single exit. A run never stays `running` past this call, and the
       * timestamp is written once even if `complete`/`abort` already ran.
       */
      close() {
        if (record.status === 'running') {
          record.status = 'error'
          note('scan ended without a terminal status')
        }
        if (record.finishedAt === null) record.finishedAt = Date.now()
        return snapshot()
      },
    }
  }

  /**
   * Walk one root and record an outcome for every discovered file.
   *
   * Facts only: whether the run completed is the caller's decision. Anything
   * thrown here — an aborted walk, a database error in the sweep — is left to
   * the caller, which owns the single exit.
   */
  async function scanRoot(root, run, { signal, onProgress }) {
    db.setScanRun(root.id, run.snapshot())
    const existing = new Map(db.listTracks().filter((t) => t.rootId === root.id).map((t) => [t.path, t]))
    const files = await walk(root.path, root.recursive, signal)
    run.discover(files.length)
    db.setScanRun(root.id, run.snapshot())
    onProgress?.({ rootId: root.id, phase: 'walked', total: files.length, scanned: 0 })

    let index = 0
    /** Persist a mid-run snapshot: every 8 outcomes, plus the last file. */
    const tick = (position) => {
      if (run.processed() % 8 !== 0 && position !== files.length - 1) return
      db.setScanRun(root.id, run.snapshot())
      onProgress?.({ rootId: root.id, phase: 'scanning', total: files.length, scanned: run.processed() })
    }
    const workers = Array.from({ length: SCAN_CONCURRENCY }, async () => {
      for (;;) {
        if (signal?.aborted) throw new Error('scan aborted')
        const position = index++
        if (position >= files.length) return
        const file = files[position]
        const rel = relative(root.path, file)
        const id = trackId(root.id, rel)
        try {
          const info = await stat(file)
          const prior = existing.get(file) ?? db.getTrack(id)
          const unchanged = prior !== null && prior !== undefined
            && prior.size === info.size
            && Math.abs(prior.mtimeMs - Math.round(info.mtimeMs)) < 2
            && !prior.missing
          if (unchanged) {
            run.unchanged()
            db.setMissing([id], false)
          } else {
            const parsed = parseFileName(basename(file))
            const probe = await probeFile(processes, ffprobePath, file)
            if (!probe.ok) {
              const detail = probe.stderr && !String(probe.reason).includes(probe.stderr) ? ` (${probe.stderr})` : ''
              run.failed(`${basename(file)}: ${probe.reason}${detail}`)
              log?.('warn', `probe failed for ${basename(file)}: ${probe.reason}${probe.stderr ? ` — ${probe.stderr}` : ''}`)
              tick(position)
              continue
            }
            db.upsertTrack({
              id,
              rootId: root.id,
              path: file,
              dir: dirname(file),
              basename: basename(file),
              ext: extname(file).toLowerCase(),
              size: info.size,
              mtimeMs: Math.round(info.mtimeMs),
              container: probe.container ?? null,
              codec: probe.codec ?? null,
              sampleRate: probe.sampleRate ?? null,
              bitsPerSample: probe.bitsPerSample ?? null,
              channels: probe.channels ?? null,
              durationMs: probe.durationMs ?? null,
              bitrate: probe.bitrate ?? null,
              titleGuess: parsed.title,
              trackNo: parsed.trackNo,
              yearGuess: parsed.year,
              qualityTag: parsed.qualityTag,
              tags: pickTags(probe.tags),
              unknownTokens: parsed.unknownTokens,
              albumKey: probe.tags?.album ? `tag:${probe.tags.album}` : dirname(file),
              hasEmbeddedArt: probe.hasEmbeddedArt === true,
              artCacheKey: null,
              fingerprint: fingerprintOf(info.size, info.mtimeMs, probe),
              scannedAt: Date.now(),
            })
            run.indexed()
          }
        } catch (error) {
          run.failed(`${basename(file)}: ${error.message}`)
          log?.('warn', `scan error for ${basename(file)}: ${error.message}`)
        }
        tick(position)
      }
    })
    await Promise.all(workers)

    // Renames: a missing row and a brand-new row sharing a fingerprint are the same file.
    const knownPaths = new Set(files)
    const missingRows = db.listTracks().filter((t) => t.rootId === root.id && !knownPaths.has(t.path) && !t.missing)
    if (missingRows.length > 0) {
      const fresh = db.listTracks().filter((t) => t.rootId === root.id && knownPaths.has(t.path))
      const freshByFingerprint = new Map(fresh.map((t) => [t.fingerprint, t]))
      const requeue = []
      let missing = 0
      let relocated = 0
      for (const row of missingRows) {
        const candidate = row.fingerprint !== null ? freshByFingerprint.get(row.fingerprint) : undefined
        if (candidate !== undefined && candidate.id !== row.id) {
          requeue.push({ oldId: row.id, newPath: candidate.path })
        } else {
          db.setMissing([row.id], true)
          missing += 1
        }
      }
      for (const { oldId, newPath } of requeue) {
        const candidate = db.findByPath(newPath)
        if (candidate === null) continue
        db.relocateTrack(oldId, candidate.path, candidate.dir, candidate.basename, candidate.rootId)
        db.getTrack(oldId)
        relocated += 1
      }
      run.sweep({ missing, relocated })
    }

    db.touchRoot(root.id)
  }

  /**
   * Write the run row exactly once. A failure to write it is logged, never
   * rethrown: it must not replace the error that ended the scan.
   */
  function persistRun(rootId, run) {
    const settled = run.close()
    try {
      db.setScanRun(rootId, settled)
    } catch (error) {
      log?.('error', `scan run row not saved for ${rootId}: ${error.message}`)
    }
    return settled
  }

  async function scan(rootId = null, { signal, onProgress } = {}) {
    if (scanning !== null) throw new Error('a scan is already running')
    const roots = db.listRoots().filter((root) => rootId === null || root.id === rootId)

    scanning = (async () => {
      const finished = []
      let failure = null
      try {
        for (const root of roots) {
          const run = createScanRun(root.id)
          try {
            await scanRoot(root, run, { signal, onProgress })
            run.complete()
          } catch (error) {
            run.abort(error)
            failure = failure ?? error
          } finally {
            const settled = persistRun(root.id, run)
            finished.push(settled)
            onProgress?.({
              rootId: root.id,
              phase: 'done',
              total: settled.total,
              scanned: settled.scanned,
              failed: settled.failed,
              status: settled.status,
            })
          }
          // One broken root stops the run: the rest would only repeat the same
          // database error, and a half-scanned root is worse than an honest stop.
          if (failure !== null) break
        }
        if (failure !== null) throw failure
        return { roots: finished }
      } finally {
        // The published index must reflect committed state even when it threw.
        try { refresh() } catch (error) { log?.('error', `library index refresh failed after scan: ${error.message}`) }
      }
    })()

    try { return await scanning } finally { scanning = null }
  }

  function fingerprintOf(size, mtimeMs, probe) {
    return [size, Math.round(mtimeMs), probe.durationMs ?? 0, probe.codec ?? '', probe.sampleRate ?? 0].join(':')
  }

  function pickTags(tags) {
    if (!tags) return {}
    const out = {}
    for (const key of ['title', 'artist', 'album', 'album_artist', 'date', 'track', 'genre', 'composer']) {
      if (typeof tags[key] === 'string' && tags[key].trim() !== '') out[key] = tags[key].trim()
    }
    return out
  }

  /* ── detail ──────────────────────────────────────────────── */

  function detail(id) {
    ensureFresh()
    const track = byId.get(id)
    if (track === undefined) return null
    const albumOverride = albumOverrideFor(track.albumKey)
    return {
      ...publicTrack(track),
      spec: {
        container: track.container,
        codec: track.codec,
        codecLabel: formatCodec(track.codec),
        sampleRate: track.sampleRate,
        sampleRateLabel: track.sampleRate ? `${formatRate(track.sampleRate)} kHz` : null,
        bitsPerSample: track.bitsPerSample,
        channels: track.channels,
        bitrate: track.bitrate,
        measured: track.measuredSpec,
      },
      filenameClaim: track.qualityTag,
      claimMatchesMeasurement: claimMatches(track),
      tags: db.getTrack(id)?.tags ?? {},
      albumOverride: albumOverride ? { title: albumOverride.title, artist: albumOverride.artist, year: albumOverride.year } : null,
    }
  }

  function claimMatches(track) {
    if (!track.qualityTag) return null
    const bits = /(\d{1,2})bit/.exec(track.qualityTag)
    const rate = /(\d{2,3}(?:\.\d)?)kHz/.exec(track.qualityTag)
    let ok = true
    if (bits) ok = ok && Number(bits[1]) === track.bitsPerSample
    if (rate) ok = ok && Math.round(Number(rate[1]) * 1000) === track.sampleRate
    return ok
  }

  /** @returns {Promise<{file: string, source: 'user'|'embedded'|'folder', mime: string}|null>} */
  async function coverFor(id) {
    const row = db.getTrack(id)
    if (row === null || row === undefined) return null
    const override = trackOverrides.get(id) ?? null
    const albumOverride = albumOverrides.get(row.albumKey) ?? null
    return covers.resolve({
      id: row.id,
      path: row.path,
      dir: row.dir,
      mtimeMs: row.mtimeMs,
      hasEmbeddedArt: row.hasEmbeddedArt,
      coverPath: override?.coverPath ?? null,
    }, albumOverride)
  }

  function lrcFor(id) {
    const track = byId.get(id)
    if (track === undefined) return null
    const stem = basename(track.basename, extname(track.basename))
    const dir = track.dir
    const candidates = [
      join(dir, `${stem}.lrc`),
      join(dir, '歌词', `${stem}.lrc`),
      join(dir, 'lyrics', `${stem}.lrc`),
      track.trackNo !== null ? join(dir, '歌词', `${track.trackNo}.lrc`) : null,
      join(dir, '歌词', `${track.title}.lrc`),
      join(dir, 'lyrics', `${track.title}.lrc`),
      join(dir, `${track.title}.lrc`),
    ].filter((candidate) => typeof candidate === 'string' && candidate.endsWith('.lrc'))
    for (const candidate of candidates) {
      try {
        const info = statSync(candidate)
        if (!info.isFile()) continue
        const parsed = parseLrc(readFileSync(candidate, 'utf8'))
        if (parsed.kind === 'empty') continue
        return { ...parsed, file: candidate }
      } catch { /* try next */ }
    }
    return null
  }

  /* ── mutations ───────────────────────────────────────────── */

  function setOverride(id, patch) {
    db.setTrackOverride(id, patch)
    refresh()
    return detail(id)
  }

  function clearOverride(id) {
    db.clearTrackOverride(id)
    refresh()
    return detail(id)
  }

  function setAlbumOverride(albumKey, patch) {
    db.setAlbumOverride(albumKey, patch)
    refresh()
    return albumKey
  }

  function setFavorite(id, on) {
    db.setFavorite(id, on)
    favorites = db.listFavorites()
    refresh()
    return on
  }

  function removeFromLibrary(id) {
    db.removeFromLibrary(id)
    refresh()
  }

  function restore(id) {
    db.restoreToLibrary(id)
    refresh()
  }

  function createPlaylist(name) {
    const id = randomUUID()
    db.createPlaylist(id, name.trim() || '新建播放列表')
    refresh()
    return playlists.find((p) => p.id === id) ?? null
  }

  function renamePlaylist(id, name) {
    db.renamePlaylist(id, name.trim() || '播放列表')
    refresh()
  }

  function deletePlaylist(id) {
    db.deletePlaylist(id)
    refresh()
  }

  function setPlaylistItems(id, trackIds) {
    db.setPlaylistItems(id, trackIds)
    refresh()
  }

  function addToPlaylist(id, trackIds) {
    const playlist = playlists.find((p) => p.id === id)
    if (playlist === undefined) throw new Error('playlist not found')
    const merged = [...playlist.trackIds]
    for (const trackIdValue of trackIds) if (!merged.includes(trackIdValue)) merged.push(trackIdValue)
    db.setPlaylistItems(id, merged)
    refresh()
    return merged.length
  }

  return {
    refresh,
    revision: () => revision,
    list,
    groups,
    detail,
    lrcFor,
    coverFor,
    scan,
    get scanning() { return scanning !== null },
    track: (id) => byId.get(id) ?? null,
    all: () => ordered.slice(),
    roots: () => db.listRoots(),
    addRoot(path) {
      const id = randomUUID()
      db.addRoot(id, path, true)
      refresh()
      return db.listRoots().find((root) => root.id === id)
    },
    removeRoot(id) { db.removeRoot(id); refresh() },
    setOverride,
    clearOverride,
    setAlbumOverride,
    setFavorite,
    removeFromLibrary,
    restore,
    playlists: () => playlists,
    createPlaylist,
    renamePlaylist,
    deletePlaylist,
    setPlaylistItems,
    addToPlaylist,
    albums: () => groups('album'),
    scanRuns: () => db.listScanRuns(),
  }
}

function normalise(text) {
  return String(text).toLowerCase().replace(/[\s\u3000]+/g, '').replace(/[《》「」()（）\[\]【】.,\-_/\\]+/g, '')
}

function subsequence(haystack, needle) {
  if (needle.length < 2) return false
  let index = 0
  for (const char of haystack) {
    if (char === needle[index]) index += 1
    if (index === needle.length) return true
  }
  return false
}
