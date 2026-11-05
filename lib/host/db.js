/**
 * Durable library store on `node:sqlite` (available in the Harness host runtime;
 * the shipped `dsh-session-query-sqlite` package uses the same module).
 *
 * The DB is storage only: the in-memory index built by `library.js` does the
 * filtering and sorting, which keeps the query surface small and avoids sending
 * user text into SQL.
 */
import { createHash } from 'node:crypto'

export const SCHEMA_VERSION = 2

const SCHEMA = `
CREATE TABLE IF NOT EXISTS roots (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  recursive INTEGER NOT NULL DEFAULT 1,
  added_at INTEGER NOT NULL,
  last_scan_at INTEGER
);

CREATE TABLE IF NOT EXISTS tracks (
  id TEXT PRIMARY KEY,
  root_id TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  dir TEXT NOT NULL,
  basename TEXT NOT NULL,
  ext TEXT NOT NULL,
  size INTEGER NOT NULL,
  mtime_ms INTEGER NOT NULL,
  container TEXT,
  codec TEXT,
  sample_rate INTEGER,
  bits_per_sample INTEGER,
  channels INTEGER,
  duration_ms INTEGER,
  bitrate INTEGER,
  title_guess TEXT NOT NULL,
  track_no INTEGER,
  year_guess INTEGER,
  quality_tag TEXT,
  tags_json TEXT NOT NULL DEFAULT '{}',
  unknown_tokens TEXT NOT NULL DEFAULT '[]',
  album_key TEXT NOT NULL,
  has_embedded_art INTEGER NOT NULL DEFAULT 0,
  art_cache_key TEXT,
  fingerprint TEXT,
  missing INTEGER NOT NULL DEFAULT 0,
  removed_at INTEGER,
  added_at INTEGER NOT NULL,
  scanned_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS tracks_album ON tracks(album_key);
CREATE INDEX IF NOT EXISTS tracks_dir ON tracks(dir);

CREATE TABLE IF NOT EXISTS track_overrides (
  track_id TEXT PRIMARY KEY,
  title TEXT,
  artist TEXT,
  album TEXT,
  year INTEGER,
  cover_path TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS album_overrides (
  album_key TEXT PRIMARY KEY,
  title TEXT,
  artist TEXT,
  year INTEGER,
  cover_path TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS favorites (
  track_id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS playlists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS playlist_items (
  playlist_id TEXT NOT NULL,
  track_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (playlist_id, position)
);

CREATE TABLE IF NOT EXISTS app_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS scan_runs (
  root_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  total INTEGER NOT NULL DEFAULT 0,
  scanned INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  started_at INTEGER,
  finished_at INTEGER
);
`

export function trackId(rootId, relPath) {
  const normal = relPath.replace(/\\/g, '/').toLowerCase()
  return createHash('sha1').update(`${rootId}\u0000${normal}`).digest('hex').slice(0, 20)
}

export async function openDatabase(file) {
  const { DatabaseSync } = await import('node:sqlite')
  const db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA synchronous = NORMAL')
  db.exec('PRAGMA busy_timeout = 3000')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(SCHEMA)
  // Upgrades happen in place, one additive step at a time. `scan_runs.failed`
  // (schema 2) has a default, so a version 1 database keeps every row and needs
  // no rewrite — and a version 1 build can still read a version 2 file, because
  // it never names the column. Checked by name, not only by `user_version`, so a
  // file that was copied or created by an older build is repaired instead of
  // failing later on the first write.
  const scanRunColumns = db.prepare('PRAGMA table_info(scan_runs)').all().map((column) => column.name)
  if (!scanRunColumns.includes('failed')) {
    db.exec('ALTER TABLE scan_runs ADD COLUMN failed INTEGER NOT NULL DEFAULT 0')
  }
  const version = db.prepare('PRAGMA user_version').get()?.user_version ?? 0
  if (version < SCHEMA_VERSION) db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`)

  const cache = new Map()
  const sql = (text) => {
    let stmt = cache.get(text)
    if (stmt === undefined) { stmt = db.prepare(text); cache.set(text, stmt) }
    return stmt
  }

  const rowToTrack = (row) => row && ({
    id: row.id,
    rootId: row.root_id,
    path: row.path,
    dir: row.dir,
    basename: row.basename,
    ext: row.ext,
    size: row.size,
    mtimeMs: row.mtime_ms,
    container: row.container,
    codec: row.codec,
    sampleRate: row.sample_rate,
    bitsPerSample: row.bits_per_sample,
    channels: row.channels,
    durationMs: row.duration_ms,
    bitrate: row.bitrate,
    titleGuess: row.title_guess,
    trackNo: row.track_no,
    yearGuess: row.year_guess,
    qualityTag: row.quality_tag,
    tags: safeJson(row.tags_json, {}),
    unknownTokens: safeJson(row.unknown_tokens, []),
    albumKey: row.album_key,
    hasEmbeddedArt: row.has_embedded_art === 1,
    artCacheKey: row.art_cache_key,
    fingerprint: row.fingerprint,
    missing: row.missing === 1,
    removedAt: row.removed_at,
    addedAt: row.added_at,
    scannedAt: row.scanned_at,
  })

  return {
    raw: db,
    close() { try { db.close() } catch { /* already closed */ } },

    /* ── roots ─────────────────────────────────────────────── */
    listRoots() {
      return sql('SELECT * FROM roots ORDER BY added_at ASC').all().map((r) => ({
        id: r.id, path: r.path, recursive: r.recursive === 1, addedAt: r.added_at, lastScanAt: r.last_scan_at,
      }))
    },
    addRoot(id, dirPath, recursive = true) {
      const now = Date.now()
      sql('INSERT OR IGNORE INTO roots (id, path, recursive, added_at) VALUES (?, ?, ?, ?)')
        .run(id, dirPath, recursive ? 1 : 0, now)
      return this.listRoots().find((r) => r.id === id)
    },
    removeRoot(id) {
      sql('DELETE FROM tracks WHERE root_id = ?').run(id)
      sql('DELETE FROM scan_runs WHERE root_id = ?').run(id)
      sql('DELETE FROM roots WHERE id = ?').run(id)
    },
    touchRoot(id) { sql('UPDATE roots SET last_scan_at = ? WHERE id = ?').run(Date.now(), id) },

    /* ── tracks ────────────────────────────────────────────── */
    listTracks() {
      return sql('SELECT * FROM tracks WHERE removed_at IS NULL').all().map(rowToTrack)
    },
    getTrack(id) {
      return rowToTrack(sql('SELECT * FROM tracks WHERE id = ?').get(id) ?? null)
    },
    findByPath(p) {
      return rowToTrack(sql('SELECT * FROM tracks WHERE path = ?').get(p) ?? null)
    },
    upsertTrack(t) {
      const now = Date.now()
      const existing = sql('SELECT added_at FROM tracks WHERE id = ?').get(t.id)
      sql(`INSERT INTO tracks (id, root_id, path, dir, basename, ext, size, mtime_ms, container, codec,
             sample_rate, bits_per_sample, channels, duration_ms, bitrate, title_guess, track_no,
             year_guess, quality_tag, tags_json, unknown_tokens, album_key, has_embedded_art, art_cache_key,
             fingerprint, missing, removed_at, added_at, scanned_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,NULL,?,?)
           ON CONFLICT(id) DO UPDATE SET
             root_id=excluded.root_id, path=excluded.path, dir=excluded.dir, basename=excluded.basename,
             ext=excluded.ext, size=excluded.size, mtime_ms=excluded.mtime_ms, container=excluded.container,
             codec=excluded.codec, sample_rate=excluded.sample_rate, bits_per_sample=excluded.bits_per_sample,
             channels=excluded.channels, duration_ms=excluded.duration_ms, bitrate=excluded.bitrate,
             title_guess=excluded.title_guess, track_no=excluded.track_no, year_guess=excluded.year_guess,
             quality_tag=excluded.quality_tag, tags_json=excluded.tags_json, unknown_tokens=excluded.unknown_tokens,
             album_key=excluded.album_key, has_embedded_art=excluded.has_embedded_art,
             art_cache_key=excluded.art_cache_key, fingerprint=excluded.fingerprint,
             missing=0, removed_at=NULL, scanned_at=excluded.scanned_at`)
        .run(
          t.id, t.rootId, t.path, t.dir, t.basename, t.ext, t.size, t.mtimeMs, t.container, t.codec,
          t.sampleRate, t.bitsPerSample, t.channels, t.durationMs, t.bitrate, t.titleGuess, t.trackNo,
          t.yearGuess, t.qualityTag, JSON.stringify(t.tags ?? {}), JSON.stringify(t.unknownTokens ?? []), t.albumKey,
          t.hasEmbeddedArt ? 1 : 0, t.artCacheKey, t.fingerprint, existing?.added_at ?? now, t.scannedAt,
        )
    },
    setMissing(ids, missing) {
      const stmt = sql('UPDATE tracks SET missing = ? WHERE id = ?')
      for (const id of ids) stmt.run(missing ? 1 : 0, id)
    },
    relocateTrack(id, newPath, newDir, newBasename, newRootId) {
      sql('UPDATE tracks SET path = ?, dir = ?, basename = ?, root_id = ? WHERE id = ?')
        .run(newPath, newDir, newBasename, newRootId, id)
    },
    removeFromLibrary(id) {
      sql('UPDATE tracks SET removed_at = ? WHERE id = ?').run(Date.now(), id)
    },
    restoreToLibrary(id) {
      sql('UPDATE tracks SET removed_at = NULL WHERE id = ?').run(id)
    },

    /* ── overrides ─────────────────────────────────────────── */
    listTrackOverrides() {
      const out = new Map()
      for (const row of sql('SELECT * FROM track_overrides').all()) {
        out.set(row.track_id, {
          title: row.title, artist: row.artist, album: row.album, year: row.year, coverPath: row.cover_path,
          updatedAt: row.updated_at,
        })
      }
      return out
    },
    setTrackOverride(trackIdValue, patch) {
      const current = sql('SELECT * FROM track_overrides WHERE track_id = ?').get(trackIdValue)
      const next = {
        title: patch.title !== undefined ? patch.title : current?.title ?? null,
        artist: patch.artist !== undefined ? patch.artist : current?.artist ?? null,
        album: patch.album !== undefined ? patch.album : current?.album ?? null,
        year: patch.year !== undefined ? patch.year : current?.year ?? null,
        coverPath: patch.coverPath !== undefined ? patch.coverPath : current?.cover_path ?? null,
      }
      sql(`INSERT INTO track_overrides (track_id, title, artist, album, year, cover_path, updated_at)
           VALUES (?,?,?,?,?,?,?)
           ON CONFLICT(track_id) DO UPDATE SET title=excluded.title, artist=excluded.artist,
             album=excluded.album, year=excluded.year, cover_path=excluded.cover_path,
             updated_at=excluded.updated_at`)
        .run(trackIdValue, next.title, next.artist, next.album, next.year, next.coverPath, Date.now())
    },
    clearTrackOverride(trackIdValue) {
      sql('DELETE FROM track_overrides WHERE track_id = ?').run(trackIdValue)
    },
    listAlbumOverrides() {
      const out = new Map()
      for (const row of sql('SELECT * FROM album_overrides').all()) {
        out.set(row.album_key, {
          title: row.title, artist: row.artist, year: row.year, coverPath: row.cover_path, updatedAt: row.updated_at,
        })
      }
      return out
    },
    setAlbumOverride(albumKey, patch) {
      const current = sql('SELECT * FROM album_overrides WHERE album_key = ?').get(albumKey)
      const next = {
        title: patch.title !== undefined ? patch.title : current?.title ?? null,
        artist: patch.artist !== undefined ? patch.artist : current?.artist ?? null,
        year: patch.year !== undefined ? patch.year : current?.year ?? null,
        coverPath: patch.coverPath !== undefined ? patch.coverPath : current?.cover_path ?? null,
      }
      sql(`INSERT INTO album_overrides (album_key, title, artist, year, cover_path, updated_at)
           VALUES (?,?,?,?,?,?)
           ON CONFLICT(album_key) DO UPDATE SET title=excluded.title, artist=excluded.artist,
             year=excluded.year, cover_path=excluded.cover_path, updated_at=excluded.updated_at`)
        .run(albumKey, next.title, next.artist, next.year, next.coverPath, Date.now())
    },

    /* ── favorites ─────────────────────────────────────────── */
    listFavorites() {
      return new Set(sql('SELECT track_id FROM favorites').all().map((r) => r.track_id))
    },
    setFavorite(id, on) {
      if (on) sql('INSERT OR IGNORE INTO favorites (track_id, created_at) VALUES (?, ?)').run(id, Date.now())
      else sql('DELETE FROM favorites WHERE track_id = ?').run(id)
    },

    /* ── playlists ─────────────────────────────────────────── */
    listPlaylists() {
      const rows = sql('SELECT * FROM playlists ORDER BY created_at ASC').all()
      const items = new Map()
      for (const row of sql('SELECT * FROM playlist_items ORDER BY playlist_id, position ASC').all()) {
        if (!items.has(row.playlist_id)) items.set(row.playlist_id, [])
        items.get(row.playlist_id).push(row.track_id)
      }
      return rows.map((r) => ({
        id: r.id, name: r.name, createdAt: r.created_at, updatedAt: r.updated_at, trackIds: items.get(r.id) ?? [],
      }))
    },
    createPlaylist(id, name) {
      const now = Date.now()
      sql('INSERT INTO playlists (id, name, created_at, updated_at) VALUES (?,?,?,?)').run(id, name, now, now)
    },
    renamePlaylist(id, name) {
      sql('UPDATE playlists SET name = ?, updated_at = ? WHERE id = ?').run(name, Date.now(), id)
    },
    deletePlaylist(id) {
      sql('DELETE FROM playlist_items WHERE playlist_id = ?').run(id)
      sql('DELETE FROM playlists WHERE id = ?').run(id)
    },
    setPlaylistItems(id, trackIds) {
      sql('DELETE FROM playlist_items WHERE playlist_id = ?').run(id)
      const stmt = sql('INSERT INTO playlist_items (playlist_id, track_id, position, added_at) VALUES (?,?,?,?)')
      const now = Date.now()
      trackIds.forEach((trackIdValue, index) => stmt.run(id, trackIdValue, index, now))
      sql('UPDATE playlists SET updated_at = ? WHERE id = ?').run(now, id)
    },

    /* ── app state ─────────────────────────────────────────── */
    getState(key) {
      const row = sql('SELECT value FROM app_state WHERE key = ?').get(key)
      return row ? safeJson(row.value, null) : null
    },
    setState(key, value) {
      sql(`INSERT INTO app_state (key, value, updated_at) VALUES (?,?,?)
           ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`)
        .run(key, JSON.stringify(value), Date.now())
    },

    /* ── scan runs ─────────────────────────────────────────── */
    setScanRun(rootId, patch) {
      const current = sql('SELECT * FROM scan_runs WHERE root_id = ?').get(rootId)
      const next = {
        status: patch.status ?? current?.status ?? 'idle',
        total: patch.total ?? current?.total ?? 0,
        scanned: patch.scanned ?? current?.scanned ?? 0,
        skipped: patch.skipped ?? current?.skipped ?? 0,
        failed: patch.failed ?? current?.failed ?? 0,
        error: patch.error !== undefined ? patch.error : current?.error ?? null,
        startedAt: patch.startedAt !== undefined ? patch.startedAt : current?.started_at ?? null,
        finishedAt: patch.finishedAt !== undefined ? patch.finishedAt : current?.finished_at ?? null,
      }
      sql(`INSERT INTO scan_runs (root_id, status, total, scanned, skipped, failed, error, started_at, finished_at)
           VALUES (?,?,?,?,?,?,?,?,?)
           ON CONFLICT(root_id) DO UPDATE SET status=excluded.status, total=excluded.total,
             scanned=excluded.scanned, skipped=excluded.skipped, failed=excluded.failed,
             error=excluded.error, started_at=excluded.started_at, finished_at=excluded.finished_at`)
        .run(rootId, next.status, next.total, next.scanned, next.skipped, next.failed, next.error, next.startedAt, next.finishedAt)
    },
    listScanRuns() {
      return sql('SELECT * FROM scan_runs').all().map((r) => ({
        rootId: r.root_id, status: r.status, total: r.total, scanned: r.scanned, skipped: r.skipped,
        failed: r.failed, error: r.error, startedAt: r.started_at, finishedAt: r.finished_at,
      }))
    },

    /* ── maintenance ───────────────────────────────────────── */
    async backup(destFile) {
      const { backup } = await import('node:sqlite')
      await backup(db, destFile)
    },
    stats() {
      const count = (table) => sql(`SELECT COUNT(*) AS n FROM ${table}`).get().n
      return { tracks: count('tracks'), favorites: count('favorites'), playlists: count('playlists'), roots: count('roots') }
    },
  }
}

function safeJson(text, fallback) {
  try { return JSON.parse(text) } catch { return fallback }
}

