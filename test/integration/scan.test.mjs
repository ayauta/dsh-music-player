/**
 * L2 — scan outcome accounting and lifecycle (C1).
 *
 * The scanner is the only part of the host that can silently lose tracks, so
 * these tests pin the two things that make a loss impossible to miss:
 *
 *   1. every discovered file reaches exactly one outcome
 *      (indexed / unchanged / failed), and `scanned` is their sum;
 *   2. every run is finalized exactly once, with `done` / `partial` / `error`
 *      meaning what they say.
 *
 * Observability is the library interface: `scan()`, `scanRuns()` and `list()`.
 * The database is not read directly except where the persisted contract is the
 * subject (the schema upgrade test).
 *
 * Injection seam: `createLibrary` already takes `processes` and `db`, so ffprobe
 * is a stub and the database is a real `node:sqlite` file in its own temporary
 * directory. Media files are 1-byte placeholders with pinned mtimes. Nothing
 * touches the user's library, database or queue.
 *
 * Deliberately NOT here: rename/overlap repair (C2) and `removeRoot` reference
 * migration. The sweep is only exercised for its failure mode, which must end
 * as `error` and must not leave the index stale.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, renameSync, rmSync, utimesSync, writeFileSync, cpSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import { tmpdir } from 'node:os'
import { DatabaseSync } from 'node:sqlite'

import { openDatabase } from '../../lib/host/db.js'
import { createLibrary } from '../../lib/host/library.js'

/** A process handle shaped exactly like `process.js` returns. */
function stubHandle({ stdout = '', stderr = '', exitCode = 0, delayMs = 0 }) {
  const done = delayMs > 0
    ? new Promise((resolve) => setTimeout(() => resolve({ exitCode }), delayMs))
    : Promise.resolve({ exitCode })
  return {
    done,
    terminate() {},
    readStdout: () => stdout,
    readStderr: () => stderr,
  }
}

/** ffprobe-shaped JSON for a 3 s 24bit/48kHz stereo track. */
function probePayload(file) {
  return JSON.stringify({
    streams: [{
      codec_type: 'audio',
      codec_name: 'flac',
      sample_rate: '48000',
      channels: 2,
      bits_per_raw_sample: '24',
      duration: '3.000000',
    }],
    format: {
      format_name: 'flac',
      duration: '3.000000',
      bit_rate: '921600',
      tags: { title: basename(file) },
    },
  })
}

function createHarness(t, options = {}) {
  const base = mkdtempSync(join(tmpdir(), 'dshm-scan-'))
  const dbFile = join(base, 'library.db')
  const state = {
    failProbeFor: options.failProbeFor ?? new Set(),
    failUpsertFor: options.failUpsertFor ?? new Set(),
    failMissingFor: options.failMissingFor ?? new Set(),
    probeDelayMs: options.probeDelayMs ?? 0,
    probes: [],
  }
  const logs = []
  const processes = {
    kind: 'stub',
    async resolve(command) { return command },
    spawn({ argv }) {
      const file = argv[argv.length - 1]
      const name = basename(file)
      state.probes.push(name)
      if (state.failProbeFor.has(name)) {
        return stubHandle({ stderr: `ffprobe: could not open '${name}': Invalid data found`, exitCode: 1 })
      }
      return stubHandle({ stdout: probePayload(file), delayMs: state.probeDelayMs })
    },
    disposeAll() {},
  }
  const covers = { hasCover: () => false, resolve: async () => null }
  let opened = null

  const open = async () => {
    const db = await openDatabase(dbFile)
    const observed = {
      ...db,
      upsertTrack(track) {
        if (state.failUpsertFor.has(track.basename)) throw new Error('SQLITE_BUSY: database is locked')
        return db.upsertTrack(track)
      },
      setMissing(ids, missing) {
        if (missing === true && ids.some((id) => state.failMissingFor.has(id))) {
          throw new Error('SQLITE_IOERR: injected write failure while marking a track missing')
        }
        return db.setMissing(ids, missing)
      },
    }
    const library = createLibrary({
      db: observed,
      processes,
      ffprobePath: 'ffprobe',
      covers,
      log: (level, message) => { logs.push(`${level}: ${message}`) },
    })
    library.refresh()
    opened = { db, observed, library }
    return opened
  }

  /** Create `<base>/<name>/` with placeholder media files and register it. */
  const addRoot = async (library, name, files) => {
    const dir = join(base, name)
    mkdirSync(dir, { recursive: true })
    files.forEach((file, index) => {
      const full = join(dir, file)
      writeFileSync(full, 'x'.repeat(10 + index * 10))
      const seconds = 1_700_000_000 + index
      utimesSync(full, seconds, seconds)
    })
    return { root: library.addRoot(dir), dir, files }
  }

  t.after(() => {
    try { opened?.db.close() } catch { /* already closed */ }
    rmSync(base, { recursive: true, force: true })
  })

  return { base, dbFile, state, logs, open, addRoot }
}

const runFor = (library, rootId) => library.scanRuns().find((run) => run.rootId === rootId)

/**
 * Count what a *later* reader would see, through the database module's own
 * interface on the same file. This is how "the index reflects committed state"
 * is checked without reaching into library internals.
 */
async function countCommittedTracks(dbFile) {
  const probe = await openDatabase(dbFile)
  try { return probe.listTracks().length } finally { probe.close() }
}

test('a scan reports one conserved count per root', { timeout: 60000 }, async (t) => {
  const harness = createHarness(t)
  const { library } = await harness.open()
  const first = await harness.addRoot(library, 'first', ['a1.flac', 'a2.flac'])
  const second = await harness.addRoot(library, 'second', ['b1.flac', 'b2.flac', 'b3.flac'])

  await library.scan(null, {})

  const a = runFor(library, first.root.id)
  const b = runFor(library, second.root.id)
  assert.ok(a && b, `both roots must report a run: got ${library.scanRuns().length} row(s)`)

  assert.equal(a.total, 2)
  assert.equal(a.scanned, 2, 'root one processed exactly what it discovered')
  assert.equal(a.scanned, a.total, 'conservation holds per root')
  assert.equal(a.status, 'done')

  assert.equal(b.total, 3, 'root two discovered only its own files')
  assert.equal(b.scanned, 3, 'and counted only its own work — not root one’s two files on top')
  assert.equal(b.scanned, b.total, 'conservation holds per root, not across roots')
  assert.equal(b.status, 'done')

  assert.equal(library.list().length, 5, 'the published library holds both roots')
})

test('a failed probe is partial, keeps one readable reason, and is never counted as unchanged', { timeout: 60000 }, async (t) => {
  const harness = createHarness(t, { failProbeFor: new Set(['02 乙.flac', '03 丙.flac']) })
  const { library } = await harness.open()
  const { root } = await harness.addRoot(library, 'album', ['01 甲.flac', '02 乙.flac', '03 丙.flac'])

  await library.scan(null, {})

  const run = runFor(library, root.id)
  assert.equal(run.status, 'partial', 'a run that lost files must not call itself done')
  assert.equal(run.total, 3)
  assert.equal(run.scanned, 3, 'a failed file still reaches an outcome')
  assert.equal(run.failed, 2, 'failures have their own counter')
  assert.equal(run.skipped, 0, 'a failure is never also an "unchanged"')
  assert.equal(run.scanned, run.total, 'conservation holds even when files fail')
  assert.match(String(run.error), /^0[23] (乙|丙)\.flac: /, 'one file names the failure, not a concatenation')
  assert.match(String(run.error), /ffprobe/, 'and the reason comes with it')
  assert.equal(library.list().length, 1, 'the healthy file is still indexed')

  // Second pass over the same root: the two still fail, the good one is unchanged.
  await library.scan(null, {})

  const again = runFor(library, root.id)
  assert.equal(again.status, 'partial')
  assert.equal(again.failed, 2, 'failures are not carried over from the previous run by accident')
  assert.equal(again.skipped, 1, 'unchanged is a separate outcome from failed')
  assert.equal(again.scanned, 3)
})

test('a failed database write is a failure, not an "unchanged"', { timeout: 60000 }, async (t) => {
  const harness = createHarness(t)
  harness.state.failUpsertFor.add('02 乙.flac')
  const { library } = await harness.open()
  const { root } = await harness.addRoot(library, 'album', ['01 甲.flac', '02 乙.flac', '03 丙.flac'])

  await library.scan(null, {})

  const run = runFor(library, root.id)
  assert.equal(run.status, 'partial')
  assert.equal(run.failed, 1, 'a write that never landed is a failed file')
  assert.equal(run.skipped, 0, 'and it is never folded into unchanged')
  assert.equal(run.scanned, 3, 'the file still reached an outcome')
  assert.match(String(run.error), /02 乙\.flac/, 'the file is named')
  assert.match(String(run.error), /locked/i, 'and the database reason survives into the run row')
  assert.equal(library.list().length, 2)
})

test('a run where every file fails ends as error, not partial', { timeout: 60000 }, async (t) => {
  const harness = createHarness(t, { failProbeFor: new Set(['01 甲.flac', '02 乙.flac']) })
  const { library } = await harness.open()
  const { root } = await harness.addRoot(library, 'album', ['01 甲.flac', '02 乙.flac'])

  await library.scan(null, {})

  const run = runFor(library, root.id)
  assert.equal(run.status, 'error', 'nothing landed and everything failed — that is not a partial success')
  assert.equal(run.total, 2)
  assert.equal(run.scanned, 2)
  assert.equal(run.failed, 2)
  assert.match(String(run.error), /ffprobe/)
  assert.equal(library.list().length, 0)
})

test('a sweep failure ends as error, never stays running, and the index matches committed state', { timeout: 60000 }, async (t) => {
  const harness = createHarness(t)
  const { library } = await harness.open()
  const { root, dir } = await harness.addRoot(library, 'album', ['01 甲.flac', '02 乙.flac'])
  await library.scan(null, {})
  assert.equal(runFor(library, root.id).status, 'done')

  const first = library.list().find((track) => track.basename === '01 甲.flac')
  library.setFavorite(first.id, true)

  // The file is gone, so the sweep will try to mark its row missing — and that
  // write fails. C1 only has to promise that the crash is reported, finalized,
  // and that the published index does not invent a state.
  harness.state.failMissingFor.add(first.id)
  rmSync(join(dir, '01 甲.flac'))

  let thrown = null
  try {
    await library.scan(null, {})
  } catch (error) { thrown = error }

  const run = runFor(library, root.id)
  assert.notEqual(run.status, 'running', 'an aborted run must not be left running forever')
  assert.equal(run.status, 'error', 'a crash in the sweep is an error, not a success')
  assert.ok(run.finishedAt !== null, 'the run is finalized')
  assert.match(String(run.error), /injected write failure/, 'the crash reason is recorded')
  assert.ok(thrown !== null, 'the caller still sees the failure')
  assert.equal(run.scanned, run.total, 'every discovered file still has an outcome')

  const committed = await countCommittedTracks(harness.dbFile)
  assert.equal(library.all().length, committed, 'the published index equals what is actually committed')
  assert.notEqual(library.track(first.id), null, 'the row that failed to be marked is still there')
  assert.equal(library.track(first.id).missing, false, 'and the failed write did not half-apply')
  assert.equal(library.track(first.id).favorited, true, 'its favorite is untouched')

  // Without the injection the same scan settles normally.
  harness.state.failMissingFor.clear()
  await library.scan(null, {})
  assert.equal(library.track(first.id).missing, true)
  assert.equal(runFor(library, root.id).status, 'done')
})

test('a later clean scan replaces a partial result', { timeout: 60000 }, async (t) => {
  const harness = createHarness(t, { failProbeFor: new Set(['02 乙.flac']) })
  const { library } = await harness.open()
  const { root } = await harness.addRoot(library, 'album', ['01 甲.flac', '02 乙.flac', '03 丙.flac'])

  await library.scan(null, {})
  assert.equal(runFor(library, root.id).status, 'partial')

  harness.state.failProbeFor.clear()
  await library.scan(null, {})

  const run = runFor(library, root.id)
  assert.equal(run.status, 'done', 'the new result wins — a stale failure is not sticky')
  assert.equal(run.failed, 0, 'and its counters are not carried over')
  assert.equal(run.error, null)
  assert.equal(run.total, 3)
  assert.equal(run.scanned, 3)
  assert.equal(run.skipped, 2, 'the two files already indexed are unchanged')
  assert.equal(library.list().length, 3)
})

test('a probe failure leaves the existing row, its favorite and its playlist entry alone', { timeout: 60000 }, async (t) => {
  const harness = createHarness(t)
  const { library } = await harness.open()
  const { root, dir } = await harness.addRoot(library, 'album', ['a.flac', 'b.flac', 'c.flac'])

  await library.scan(null, {})
  assert.equal(runFor(library, root.id).status, 'done')
  const b = library.list().find((track) => track.basename === 'b.flac')
  assert.ok(b, 'b is indexed after the first scan')

  library.setFavorite(b.id, true)
  const playlist = library.createPlaylist('测试')
  library.addToPlaylist(playlist.id, [b.id])

  // b now needs re-probing — its mtime moved on disk — and the probe will fail.
  const touched = 1_700_000_000 + 120
  utimesSync(join(dir, 'b.flac'), touched, touched)
  harness.state.failProbeFor.add('b.flac')

  await library.scan(null, {})

  const run = runFor(library, root.id)
  assert.equal(run.status, 'partial', 'one file could not be refreshed')
  assert.equal(run.total, 3)
  assert.equal(run.scanned, 3)
  assert.equal(run.failed, 1)
  assert.equal(run.skipped, 2, 'the two untouched files are still unchanged')
  assert.match(String(run.error), /^b\.flac: /, 'and the failure names the file')

  const survivor = library.all().find((track) => track.id === b.id)
  assert.ok(survivor, 'the row survives a failed refresh')
  assert.equal(survivor.missing, false, 'a failed probe is not a missing file')
  assert.equal(library.list().length, 3, 'the track stays visible')
  assert.equal(library.all().length, 3, 'and no duplicate row was created')

  assert.deepEqual(library.list({ view: 'favorites' }).map((track) => track.id), [b.id],
    'the favorite still points at the same track')
  assert.deepEqual(library.playlists().find((item) => item.id === playlist.id).trackIds, [b.id],
    'and the playlist entry is untouched')

  // The probe recovers: the next scan refreshes b and every reference still resolves.
  harness.state.failProbeFor.clear()
  await library.scan(null, {})

  const healed = runFor(library, root.id)
  assert.equal(healed.status, 'done', 'a transient failure is not sticky')
  assert.equal(healed.failed, 0)
  assert.equal(healed.scanned, 3)
  assert.equal(healed.skipped, 2, 'only the two untouched files are unchanged')
  assert.equal(library.track(b.id).mtimeMs, Math.round(touched * 1000), 'the row now carries the new mtime')
  assert.deepEqual(library.list({ view: 'favorites' }).map((track) => track.id), [b.id])
  assert.deepEqual(library.playlists().find((item) => item.id === playlist.id).trackIds, [b.id])
})

test('a version 1 database gains the failed column without losing library data', { timeout: 60000 }, async (t) => {
  const harness = createHarness(t)
  const { db, library } = await harness.open()
  await harness.addRoot(library, 'album', ['01 甲.flac', '02 乙.flac'])
  await library.scan(null, {})
  db.close()

  // Put the file back into the version 1 shape: no `failed` column, version 1.
  // This is exactly what a database written by the previous build looks like.
  const raw = new DatabaseSync(harness.dbFile)
  raw.exec('ALTER TABLE scan_runs DROP COLUMN failed')
  raw.exec('PRAGMA user_version = 1')
  assert.equal(raw.prepare('PRAGMA user_version').get().user_version, 1)
  raw.close()

  const upgraded = await openDatabase(harness.dbFile)
  try {
    assert.equal(upgraded.raw.prepare('PRAGMA user_version').get().user_version, 2, 'the shape is stamped as version 2')
    assert.equal(upgraded.listTracks().length, 2, 'existing tracks survive the upgrade')
    const [run] = upgraded.listScanRuns()
    assert.equal(run.failed, 0, 'a historical run reads as "no failures recorded", not as a guess')
    assert.equal(run.status, 'done', 'and its previous status is not rewritten')
    upgraded.setScanRun(run.rootId, { failed: 1 })
    assert.equal(upgraded.listScanRuns()[0].failed, 1, 'the upgraded row is writable')
  } finally {
    upgraded.close()
  }

  // Opening an already upgraded database must stay quiet and idempotent.
  const again = await openDatabase(harness.dbFile)
  try {
    assert.equal(again.raw.prepare('PRAGMA user_version').get().user_version, 2)
    assert.equal(again.listTracks().length, 2)
    assert.equal(again.listScanRuns()[0].failed, 1)
  } finally {
    again.close()
  }
})

/* ── C2': roots, identity and provenance ───────────────────────────── */

/**
 * A parent and a child of it enumerate the same file under two ids while the
 * path stays unique, so one of them could never be written. Registration is
 * refused up front instead of collecting invisible failures on every scan.
 */
test('a scan root may not be nested inside a registered one', { timeout: 60000 }, async (t) => {
  const harness = createHarness(t)
  const { library } = await harness.open()
  const music = join(harness.base, 'Music')
  const album = join(music, 'Album')
  const sibling = join(harness.base, 'Music2')
  mkdirSync(album, { recursive: true })
  mkdirSync(sibling, { recursive: true })

  const first = library.addRoot(music)
  assert.throws(
    () => library.addRoot(album),
    (error) => /overlap/i.test(error.message) && error.message.includes(album) && error.message.includes(music),
    'the reason names both paths',
  )
  assert.deepEqual(library.roots().map((root) => root.id), [first.id], 'the nested root was not registered')

  const second = library.addRoot(sibling)
  assert.equal(library.roots().length, 2, 'a sibling sharing a prefix is not a child')
  assert.equal(second.path, sibling)
  assert.equal(library.roots().find((root) => root.id === first.id).overlapsWith.length, 0)
})

test('registering the parent of an existing root is refused too', { timeout: 60000 }, async (t) => {
  const harness = createHarness(t)
  const { library } = await harness.open()
  const music = join(harness.base, 'Music')
  const album = join(music, 'Album')
  mkdirSync(album, { recursive: true })

  const child = library.addRoot(album)
  assert.throws(() => library.addRoot(music), (error) => /overlap/i.test(error.message) && error.message.includes(music))
  assert.deepEqual(library.roots().map((root) => root.id), [child.id])

  assert.throws(() => library.addRoot(album), /overlap/i, 'the same directory twice is an overlap')
  assert.equal(library.roots().length, 1)
})

test('containment follows Windows semantics — case, separators and dots', { timeout: 60000 }, async (t) => {
  const harness = createHarness(t)
  const { library } = await harness.open()
  const music = join(harness.base, 'Music')
  mkdirSync(join(music, 'Album'), { recursive: true })
  library.addRoot(music)

  const nested = [
    join(music, 'ALBUM'),
    `${music}\\Album\\`,
    join(music, '.', 'Album'),
    join(music, 'Sub', '..', 'Album'),
  ]
  for (const path of nested) {
    assert.throws(() => library.addRoot(path), (error) => /overlap/i.test(error.message), `${path} is inside ${music}`)
  }
  assert.equal(library.roots().length, 1, 'none of them was registered')

  const lookalike = join(harness.base, 'MusicFestival')
  mkdirSync(lookalike)
  library.addRoot(lookalike)
  assert.equal(library.roots().length, 2, 'a shared prefix is not containment')
})

/**
 * A root pair that already exists in the database is reported, never repaired
 * by force — and the file it shares gets exactly one row, whose owner does not
 * flip when the two roots take turns.
 */
test('historical overlapping roots are reported and do not steal ownership', { timeout: 60000 }, async (t) => {
  const harness = createHarness(t)
  const { db, library } = await harness.open()
  const music = join(harness.base, 'Music')
  const album = join(music, 'Album')
  mkdirSync(album, { recursive: true })
  const file = join(album, 'x.flac')
  writeFileSync(file, 'x'.repeat(10))
  const seconds = 1_700_000_000
  utimesSync(file, seconds, seconds)

  // The shape an older build could leave behind: written past the gate.
  db.addRoot('legacy-parent', music, true)
  db.addRoot('legacy-child', album, true)

  const roots = library.roots()
  assert.deepEqual(roots.find((root) => root.id === 'legacy-parent').overlapsWith, ['legacy-child'])
  assert.deepEqual(roots.find((root) => root.id === 'legacy-child').overlapsWith, ['legacy-parent'])
  assert.equal(roots.length, 2, 'listing is a report, not a cleanup')

  await library.scan(null, {})
  assert.equal(library.roots().length, 2, 'scanning does not delete a root either')
  assert.equal(library.all().length, 1, 'the file has exactly one row')
  assert.ok(harness.logs.some((line) => /overlap/i.test(line)), 'and the overlap is named in the log')
  assert.equal(runFor(library, 'legacy-child').failed, 0, 'the second root no longer fails on the shared path')

  // Taking turns must not move the row between roots. Each visit changes the
  // file, so every scan really rewrites the row instead of skipping it.
  const owner = db.findByPath(file).rootId
  for (const [round, rootId] of ['legacy-parent', 'legacy-child', 'legacy-parent'].entries()) {
    const touched = 1_700_000_100 + round
    utimesSync(file, touched, touched)
    await library.scan(rootId, {})
    assert.equal(db.findByPath(file).rootId, owner, `round ${round + 1}: ownership is stable`)
  }
  assert.equal(db.listTracks().length, 1, 'and still one row')
})

/* ── C2': identity, provenance and scan safety ─────────────────────── */

test('a rescan of the same path keeps the id, the favorite and the playlist entry', { timeout: 60000 }, async (t) => {
  const harness = createHarness(t)
  const { library } = await harness.open()
  const { root } = await harness.addRoot(library, 'album', ['a.flac', 'b.flac'])
  await library.scan(null, {})

  const ids = library.list().map((track) => track.id).sort()
  const a = library.list().find((track) => track.basename === 'a.flac')
  library.setFavorite(a.id, true)
  const playlist = library.createPlaylist('测试')
  library.addToPlaylist(playlist.id, ids)

  await library.scan(null, {})

  const run = runFor(library, root.id)
  assert.equal(run.status, 'done')
  assert.equal(run.skipped, 2, 'nothing was re-probed')
  assert.deepEqual(library.list().map((track) => track.id).sort(), ids, 'the ids did not change')
  assert.equal(library.all().length, 2, 'and no row was added')
  assert.deepEqual(library.list({ view: 'favorites' }).map((track) => track.id), [a.id])
  assert.deepEqual(library.playlists().find((item) => item.id === playlist.id).trackIds, ids)
})

test('identical bytes at two paths are two tracks', { timeout: 60000 }, async (t) => {
  const harness = createHarness(t)
  const { library } = await harness.open()
  const { dir } = await harness.addRoot(library, 'album', ['a.flac'])
  await library.scan(null, {})
  const original = library.list()[0]

  cpSync(join(dir, 'a.flac'), join(dir, 'a 副本.flac'), { preserveTimestamps: true })
  await library.scan(null, {})

  const tracks = library.list()
  assert.equal(tracks.length, 2, 'both files are in the library')
  assert.equal(new Set(tracks.map((track) => track.id)).size, 2, 'with different ids')
  assert.deepEqual(tracks.map((track) => track.basename).sort(), ['a 副本.flac', 'a.flac'])
  assert.equal(library.track(original.id).basename, 'a.flac', 'the original row did not move')
})

/**
 * A rename is not inferred. The old row keeps its id and its references and
 * goes missing; the new path is imported as a new track. That is the whole
 * contract — no fingerprint matching, no candidate search.
 */
test('a rename leaves the old track missing and imports the new path as a new track', { timeout: 60000 }, async (t) => {
  const harness = createHarness(t)
  const { db, library } = await harness.open()
  const { root, dir } = await harness.addRoot(library, 'album', ['a.flac', 'keep.flac'])
  await library.scan(null, {})

  const a = library.list().find((track) => track.basename === 'a.flac')
  library.setFavorite(a.id, true)
  const playlist = library.createPlaylist('测试')
  library.addToPlaylist(playlist.id, [a.id])

  renameSync(join(dir, 'a.flac'), join(dir, 'b.flac'))
  await library.scan(null, {})

  const run = runFor(library, root.id)
  assert.equal(run.status, 'done', 'a rename is not a failure')
  assert.equal(run.failed, 0)
  assert.equal(db.listTracks().length, 3, 'two rows for two paths, plus the untouched file')

  const old = library.track(a.id)
  assert.equal(old.path, join(dir, 'a.flac'), 'the old row still points at the old path')
  assert.equal(old.missing, true, 'and is marked missing')
  assert.equal(library.track(a.id).favorited, true, 'keeping its favorite')
  assert.deepEqual(library.playlists().find((item) => item.id === playlist.id).trackIds, [a.id],
    'and its playlist entry')

  const born = library.list().find((track) => track.basename === 'b.flac')
  assert.ok(born, 'the new path is in the library')
  assert.notEqual(born.id, a.id, 'under its own id')
  assert.equal(born.missing, false)
  assert.equal(born.favorited, false, 'without inheriting anything')
  assert.equal(library.list().length, 2, 'the missing track is not offered as available')
})

/**
 * An unreadable folder means the walk knows nothing about the files in it.
 * "Not seen" must not become "gone": the run fails and every row stays as it
 * was, otherwise one permission error would empty the whole library.
 */
test('an unreadable folder fails the run instead of marking every track missing', { timeout: 60000 }, async (t) => {
  const harness = createHarness(t)
  const { db, library } = await harness.open()
  const { root, dir } = await harness.addRoot(library, 'album', ['a.flac', 'b.flac'])
  await library.scan(null, {})
  const a = library.list().find((track) => track.basename === 'a.flac')
  library.setFavorite(a.id, true)
  assert.equal(library.list().length, 2)

  rmSync(dir, { recursive: true, force: true })

  let thrown = null
  try {
    await library.scan(null, {})
  } catch (error) { thrown = error }

  const run = runFor(library, root.id)
  assert.equal(run.status, 'error', 'the source could not be read')
  assert.match(String(run.error), /cannot read/, 'and the run says so')
  assert.equal(run.failed, 0, 'no file reached a failure outcome — discovery itself failed')
  assert.ok(thrown !== null, 'the caller sees the failure')

  assert.equal(db.listTracks().filter((track) => track.missing).length, 0, 'nothing was marked missing')
  assert.equal(library.list().length, 2, 'the library still offers both tracks')
  assert.equal(library.track(a.id).favorited, true)
})

/**
 * Removing a folder stops managing it. The rows — and therefore every
 * reference — stay; the library simply stops offering them as available files,
 * and re-adding the same path brings them back under the same ids.
 */
test('removing a folder keeps tracks and references, re-adding restores the same ids', { timeout: 60000 }, async (t) => {
  const harness = createHarness(t)
  const { db, library } = await harness.open()
  const { root, dir } = await harness.addRoot(library, 'album', ['a.flac', 'b.flac'])
  await library.scan(null, {})

  const tracks = library.list()
  const ids = tracks.map((track) => track.id).sort()
  const a = tracks.find((track) => track.basename === 'a.flac')
  library.setFavorite(a.id, true)
  const playlist = library.createPlaylist('测试')
  library.addToPlaylist(playlist.id, ids)
  db.setState('player', { queue: [a.id], cursorId: a.id, mode: 'all', volume: 100, muted: false, positionMs: 0 })

  library.removeRoot(root.id)

  assert.equal(db.listTracks().length, 2, 'the rows are kept')
  assert.deepEqual(db.listTracks().map((track) => track.id).sort(), ids, 'with their ids')
  assert.equal(db.listTracks().every((track) => track.missing), true, 'and are no longer available')
  assert.equal(library.list().length, 0, 'the library does not offer them')
  assert.equal(library.roots().length, 0, 'the folder is no longer managed')
  assert.equal(db.listScanRuns().length, 0, 'its ledger row is gone')
  assert.deepEqual([...db.listFavorites()], [a.id], 'the favorite survives')
  assert.deepEqual(library.playlists().find((item) => item.id === playlist.id).trackIds, ids, 'and the playlist')
  assert.deepEqual(db.getState('player').queue, [a.id], 'and the queue reference')
  assert.ok(existsSync(join(dir, 'a.flac')), 'the file on disk is untouched')

  // Re-adding the same folder restores the identity, not a copy of it.
  library.addRoot(dir)
  await library.scan(null, {})
  assert.equal(db.listTracks().length, 2, 'no duplicate rows')
  assert.deepEqual(library.list().map((track) => track.id).sort(), ids, 'the same ids are visible again')
  assert.deepEqual(library.list({ view: 'favorites' }).map((track) => track.id), [a.id])
  assert.deepEqual(library.playlists().find((item) => item.id === playlist.id).trackIds, ids)
  assert.equal(library.roots().length, 1)

  // Remove / re-add twice more: still two rows, still the same ids.
  for (let round = 0; round < 2; round += 1) {
    const [current] = library.roots()
    library.removeRoot(current.id)
    assert.equal(db.listTracks().length, 2, `round ${round + 1}: removing adds or removes no row`)
    library.addRoot(dir)
    await library.scan(null, {})
    assert.deepEqual(library.list().map((track) => track.id).sort(), ids, `round ${round + 1}: ids are stable`)
  }
})

/** A track that was already missing stays missing after the folder comes back. */
test('restoring a folder does not revive a file that is still absent', { timeout: 60000 }, async (t) => {
  const harness = createHarness(t)
  const { library } = await harness.open()
  const { root, dir } = await harness.addRoot(library, 'album', ['a.flac', 'b.flac'])
  await library.scan(null, {})

  const b = library.list().find((track) => track.basename === 'b.flac')
  rmSync(join(dir, 'b.flac'))
  await library.scan(null, {})
  assert.equal(library.track(b.id).missing, true)

  library.removeRoot(root.id)
  library.addRoot(dir)
  await library.scan(null, {})

  assert.equal(library.list().length, 1, 'only the file that exists is available')
  assert.deepEqual(library.list().map((track) => track.basename), ['a.flac'])
  assert.equal(library.track(b.id).missing, true, 'the absent file stays missing')
  assert.equal(library.all().length, 2, 'but its row and references are still there')
})

/** Only an explicit restore brings a removed track back; a rescan does not. */
test('a track removed from the library is not resurrected by a rescan', { timeout: 60000 }, async (t) => {
  const harness = createHarness(t)
  const { db, library } = await harness.open()
  const { root, dir } = await harness.addRoot(library, 'album', ['a.flac'])
  await library.scan(null, {})
  const a = library.list()[0]

  library.removeFromLibrary(a.id)
  assert.equal(library.list().length, 0)

  // New bytes at the same path must not flip the row back into the library.
  writeFileSync(join(dir, 'a.flac'), 'x'.repeat(99))
  const later = 1_700_000_500
  utimesSync(join(dir, 'a.flac'), later, later)
  await library.scan(null, {})

  assert.equal(runFor(library, root.id).status, 'done', 'the scan itself is fine')
  assert.equal(library.list().length, 0, 'the track stays removed')
  assert.notEqual(db.getTrack(a.id).removedAt, null, 'the removal is still recorded')

  library.restore(a.id)
  assert.equal(library.list().length, 1, 'an explicit restore brings it back')
  assert.equal(library.list()[0].id, a.id, 'with the same id')
})

/**
 * Removing a folder writes three tables. Either all three land or none does:
 * a half-applied removal would hide every track of a folder that is still
 * registered (and therefore still scanned, which would undo the hiding).
 */
test('removing a folder is all-or-nothing', { timeout: 60000 }, async (t) => {
  const harness = createHarness(t)
  const { db, library } = await harness.open()
  const { root } = await harness.addRoot(library, 'album', ['a.flac', 'b.flac'])
  await library.scan(null, {})

  db.raw.exec(`CREATE TRIGGER dshm_block_root_delete BEFORE DELETE ON roots
               BEGIN SELECT RAISE(ABORT, 'injected removal failure'); END`)

  assert.throws(() => library.removeRoot(root.id), /injected removal failure/)

  assert.equal(library.roots().length, 1, 'the folder is still registered')
  assert.equal(db.listScanRuns().length, 1, 'its ledger row is still there')
  assert.equal(db.listTracks().filter((track) => track.missing).length, 0,
    'and no track was left marked missing by the rolled-back attempt')
  assert.equal(library.list().length, 2, 'the library still offers both tracks')

  db.raw.exec('DROP TRIGGER dshm_block_root_delete')
  library.removeRoot(root.id)

  assert.equal(library.roots().length, 0, 'the retry goes through')
  assert.equal(db.listTracks().every((track) => track.missing), true)
  assert.equal(library.list().length, 0)
})

/**
 * A scan writes rows for the roots it started with. Removing one of those
 * roots halfway would let the still-running scan write its tracks back under a
 * folder that is no longer managed, so the removal is refused instead.
 */
test('a folder cannot be removed while its scan is running', { timeout: 60000 }, async (t) => {
  const harness = createHarness(t)
  const { db, library } = await harness.open()
  const { root, dir } = await harness.addRoot(library, 'album', ['a.flac', 'b.flac'])
  await library.scan(null, {})
  assert.equal(library.list().length, 2)

  // Both files need re-probing, and each probe is slow enough to keep the scan
  // in flight while the removal is attempted.
  harness.state.probeDelayMs = 40
  for (const [index, name] of ['a.flac', 'b.flac'].entries()) {
    const touched = 1_700_000_400 + index
    utimesSync(join(dir, name), touched, touched)
  }

  const running = library.scan(null, {})
  assert.equal(library.scanning, true, 'the scan really is in flight')

  assert.throws(
    () => library.removeRoot(root.id),
    (error) => /scanned|scan/i.test(error.message),
    'the removal names the reason',
  )
  assert.equal(library.roots().length, 1, 'the folder is still registered')
  assert.equal(db.listTracks().filter((track) => track.missing).length, 0, 'and no track was touched')

  await running
  assert.equal(runFor(library, root.id).status, 'done')
  assert.equal(library.list().length, 2, 'the finished scan published both tracks')

  // Once the scan is over the same call succeeds.
  library.removeRoot(root.id)
  assert.equal(library.roots().length, 0)
  assert.equal(db.listTracks().every((track) => track.missing), true)
  assert.equal(library.list().length, 0, 'and the folder is no longer offered')
})
