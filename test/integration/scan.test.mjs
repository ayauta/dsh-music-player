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
import { mkdtempSync, mkdirSync, renameSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { join, basename } from 'node:path'
import { tmpdir } from 'node:os'
import { DatabaseSync } from 'node:sqlite'

import { openDatabase } from '../../lib/host/db.js'
import { createLibrary } from '../../lib/host/library.js'

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

/** A process handle shaped exactly like `process.js` returns. */
function stubHandle({ stdout = '', stderr = '', exitCode = 0 }) {
  return {
    done: Promise.resolve({ exitCode }),
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
      return stubHandle({ stdout: probePayload(file) })
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

  // Rename one file. Its fingerprint still matches the new row (size, mtime and
  // the stubbed probe are identical), so the sweep takes the relocation path —
  // which C2 still owns. C1 only has to promise that the crash is reported,
  // finalized, and that the published index does not invent a state.
  renameSync(join(dir, '01 甲.flac'), join(dir, '01 甲 改名.flac'))
  await sleep(20)

  let thrown = null
  try {
    await library.scan(null, {})
  } catch (error) { thrown = error }

  const run = runFor(library, root.id)
  assert.notEqual(run.status, 'running', 'an aborted run must not be left running forever')
  assert.equal(run.status, 'error', 'a crash in the sweep is an error, not a success')
  assert.ok(run.finishedAt !== null, 'the run is finalized')
  assert.match(String(run.error), /UNIQUE|tracks\.path/i, 'the crash reason is recorded')
  assert.ok(thrown !== null, 'the caller still sees the failure')
  assert.equal(run.scanned, run.total, 'every discovered file still has an outcome')

  const committed = await countCommittedTracks(harness.dbFile)
  assert.equal(library.all().length, committed, 'the published index equals what is actually committed')
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
