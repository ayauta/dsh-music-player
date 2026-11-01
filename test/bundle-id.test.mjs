/**
 * L1 — bundle identity.
 *
 * These tests guard the *tool*, not the player: they prove that the id stamped
 * into `client.js` still describes its contents, and that the stamper cannot
 * silently corrupt a file. They do not, and cannot, prove what the browser is
 * executing — that needs the in-page read described in `docs/TESTING.md` §2.2.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  ID_PATTERN,
  MARKER_SENTINEL,
  artifactRevisionOf,
  computeBundleId,
  normalizeEol,
  readEmbeddedId,
  splitSource,
  stampId,
} from '../scripts/bundle-id.mjs'

const here = fileURLToPath(new URL('.', import.meta.url))
const repo = join(here, '..')
const script = join(repo, 'scripts', 'bundle-id.mjs')
const source = join(repo, 'client.js')

/** A minimal stand-in file; only the marker line matters to the tool. */
const sample = (id) => [
  'window.__ModuleLoader__.load({',
  "  id: 'x',",
  '  factory(require) {',
  `    const BUNDLE_ID = '${id}' // ${MARKER_SENTINEL}`,
  '    return {}',
  '  },',
  '})',
  '',
].join('\n')

function tempFile(t, text) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-music-bundle-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const file = join(dir, 'client.js')
  writeFileSync(file, text)
  return file
}

function runScript(args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' })
}

test('the embedded bundle id matches the source', () => {
  const text = readFileSync(source, 'utf8')
  assert.equal(readEmbeddedId(text), computeBundleId(text),
    'client.js changed without refreshing its marker — run `node scripts/bundle-id.mjs --write`')
})

test('the marker is declared exactly once and well formed', () => {
  const text = readFileSync(source, 'utf8')
  const { markerLine, embedded } = splitSource(text) // throws on 0 or >1

  assert.match(embedded, ID_PATTERN)
  assert.ok(markerLine.includes(MARKER_SENTINEL), 'the marker line carries the sentinel')
  const lines = normalizeEol(text).split('\n').filter((line) => line.includes(MARKER_SENTINEL))
  assert.equal(lines.length, 1, `the sentinel appears on ${lines.length} lines, expected 1`)
})

test('the fingerprint does not depend on line endings', () => {
  const text = readFileSync(source, 'utf8')
  const crlf = normalizeEol(text).replace(/\n/g, '\r\n')
  assert.equal(computeBundleId(crlf), computeBundleId(text), 'CRLF and LF sources must hash the same')
})

test('stamping is idempotent', (t) => {
  const seed = sample('dshm-000000000000')
  const file = tempFile(t, seed)
  const first = runScript(['--file', file, '--write'])
  assert.equal(first.status, 0, first.stderr)
  const once = readFileSync(file, 'utf8')

  const second = runScript(['--file', file, '--write'])
  assert.equal(second.status, 0, second.stderr)
  const twice = readFileSync(file, 'utf8')

  assert.equal(twice, once, 'a second --write must not change a single byte')
  assert.equal(readEmbeddedId(twice), computeBundleId(twice))
  assert.equal(readEmbeddedId(twice), computeBundleId(seed), 'the stamped id still describes the seeded content')
})

test('stamping refuses a source without a marker', (t) => {
  const file = tempFile(t, "window.__ModuleLoader__.load({ id: 'x', factory() {} })\n")
  const before = readFileSync(file, 'utf8')

  const result = runScript(['--file', file, '--write'])

  assert.notEqual(result.status, 0, 'a marker-less file must not be "fixed" silently')
  assert.match(result.stderr, /no marker line/)
  assert.equal(readFileSync(file, 'utf8'), before, 'the file must be untouched')
})

test('stamping refuses a duplicated marker', (t) => {
  const file = tempFile(t, sample('dshm-111111111111') + sample('dshm-222222222222'))
  const before = readFileSync(file, 'utf8')

  const result = runScript(['--file', file, '--write'])

  assert.notEqual(result.status, 0, 'an ambiguous file must not be rewritten')
  assert.match(result.stderr, /2 marker lines/)
  assert.equal(readFileSync(file, 'utf8'), before, 'the file must be untouched')
})

test('a stale marker is reported without touching the file', (t) => {
  const stale = sample('dshm-000000000000')
  const file = tempFile(t, stale)

  const result = runScript(['--file', file, '--json'])

  assert.equal(result.status, 1)
  const report = JSON.parse(result.stdout)
  assert.equal(report.matches, false)
  assert.equal(report.embedded, 'dshm-000000000000')
  assert.match(report.sourceId, ID_PATTERN)
  assert.equal(readFileSync(file, 'utf8'), stale)
})

test('a runtime id is compared with the source id, not trusted', (t) => {
  const file = tempFile(t, sample('dshm-000000000000'))
  const id = computeBundleId(readFileSync(file, 'utf8'))
  runScript(['--file', file, '--write'])

  const good = runScript(['--file', file, '--runtime', id, '--json'])
  assert.equal(good.status, 0, good.stdout + good.stderr)
  assert.equal(JSON.parse(good.stdout).runtimeMatches, true)

  const bad = runScript(['--file', file, '--runtime', 'dshm-ffffffffffff', '--json'])
  assert.equal(bad.status, 1, 'a mismatching runtime id must fail the check')
  assert.equal(JSON.parse(bad.stdout).runtimeMatches, false)
})

test('stampId rejects a malformed id', () => {
  assert.throws(() => stampId(sample('dshm-000000000000'), 'not-an-id'), /malformed id/)
})

test('the artifact revision matches an observed Host graph value', () => {
  // A live rc.5 instance reported rev "aa30fdc87659" for these exact file stats
  // (client.js before Phase 0B-3). Pinning it here keeps this tool's copy of the
  // Host's algorithm honest: if `@deepseek-ai/dsh-client-modules` ever changes
  // the framing, --served must be told, not silently wrong.
  assert.equal(
    artifactRevisionOf({ mtimeMs: 1793290586048.0237, ctimeMs: 1793290586048.0237, size: 125158 }),
    'aa30fdc87659',
  )
  assert.match(artifactRevisionOf({ mtimeMs: 1, ctimeMs: 2, size: 3 }), /^[0-9a-f]{12}$/)
})
