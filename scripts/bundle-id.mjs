#!/usr/bin/env node
/**
 * Bundle identity for the dsh-music client half.
 *
 * Read-only by default. It answers one question that the Host cannot answer for
 * itself: *which* version of `client.js` is this, and does the running page
 * claim the same one?
 *
 * Three independent identities exist, and this tool keeps them apart on purpose:
 *
 *   1. **source id** — SHA-256 of the file with the marker line removed.
 *      Content, not metadata, not `package.json`. Works with uncommitted edits.
 *   2. **artifact rev** — the Host's `sha1(mtimeMs, ctimeMs, size)` (12 hex),
 *      recomputed here exactly as `dsh-client-modules` does. It proves the Host
 *      is serving the current file, and nothing about content.
 *   3. **runtime id** — the value the *executing* client writes to
 *      `documentElement.dataset.dshMusicBundle` when `apply(ctx)` runs. Only an
 *      in-page read (`--runtime`) can supply it; a Host-read hash is not that.
 *
 * The marker line is excluded from the hash, so stamping the id does not change
 * the next id (no circular dependency), and `--write` is idempotent.
 *
 * Usage:
 *   node scripts/bundle-id.mjs                      # check the file against its marker
 *   node scripts/bundle-id.mjs --json               # same, machine-readable
 *   node scripts/bundle-id.mjs --write              # refresh the marker (one line)
 *   node scripts/bundle-id.mjs --runtime dshm-xxxxxxxxxxxx
 *   node scripts/bundle-id.mjs --served --url http://127.0.0.1:PORT
 *
 * Exit codes: 0 = consistent, 1 = mismatch, 2 = skipped/unavailable, 3 = usage.
 * No network access happens unless `--served` is passed, and `--url` is
 * mandatory there: this tool never assumes a port.
 */
import { createHash } from 'node:crypto'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** Sentinel that marks the one line excluded from the fingerprint. */
export const MARKER_SENTINEL = 'dsh-music-bundle-id'
/** The one place the id's shape is spelled; every regex below is derived from it. */
const ID_SOURCE = 'dshm-[0-9a-f]{12}'
/** The id format; matches the Host's own 12-hex revision width. */
export const ID_PATTERN = new RegExp(`^${ID_SOURCE}$`)
const MARKER_LINE = new RegExp(`^([ \\t]*const BUNDLE_ID = ')${ID_SOURCE}(' [^\\n]*${MARKER_SENTINEL}[^\\n]*)$`, 'm')
const ID_IN_MARKER = new RegExp(`'(${ID_SOURCE})'`)
const DEFAULT_PLUGIN_ID = '@local/dsh-music'
const BUNDLE_TAIL = /^;\r?\n\/\/# sourceMappingURL=\S+\s*$/

/**
 * Normalize line endings so a Windows checkout and a Linux CI agree.
 * @param {string} text
 * @returns {string}
 */
export function normalizeEol(text) {
  return text.replace(/\r\n/g, '\n')
}

/**
 * Split the marker line out of the source.
 * @param {string} source raw file text
 * @returns {{ markerLine: string, embedded: string, stripped: string }}
 * @throws when the marker is missing or appears more than once
 */
export function splitSource(source) {
  const lines = normalizeEol(source).split('\n')
  const hits = []
  for (let index = 0; index < lines.length; index += 1) {
    if (MARKER_LINE.test(lines[index])) hits.push(index)
  }
  if (hits.length === 0) {
    throw new Error(`bundle-id: no marker line (expected one line containing "${MARKER_SENTINEL}")`)
  }
  if (hits.length > 1) {
    throw new Error(`bundle-id: ${hits.length} marker lines found, expected exactly one (lines ${hits.map((i) => i + 1).join(', ')})`)
  }
  const markerLine = lines[hits[0]]
  const embedded = markerLine.match(ID_IN_MARKER)[1]
  const stripped = [...lines.slice(0, hits[0]), ...lines.slice(hits[0] + 1)].join('\n')
  return { markerLine, embedded, stripped }
}

/**
 * Hash the marker-free text; the single hash implementation.
 * @param {string} stripped marker-free source
 * @returns {string} `dshm-` + 12 hex chars of SHA-256
 */
export function fingerprint(stripped) {
  return `dshm-${createHash('sha256').update(stripped, 'utf8').digest('hex').slice(0, 12)}`
}

/**
 * The content fingerprint of a client source.
 * @param {string} source raw file text
 * @returns {string}
 */
export function computeBundleId(source) {
  return fingerprint(splitSource(source).stripped)
}

/**
 * Read the id currently embedded in a source.
 * @param {string} source raw file text
 * @returns {string}
 */
export function readEmbeddedId(source) {
  return splitSource(source).embedded
}

/**
 * Stamp `id` onto the source's single marker line, preserving line endings.
 * @param {string} source raw file text
 * @param {string} id
 * @returns {string} the rewritten source
 * @throws when the marker is missing or ambiguous
 */
export function stampId(source, id) {
  if (!ID_PATTERN.test(id)) throw new Error(`bundle-id: refusing to write malformed id "${id}"`)
  splitSource(source) // validates: exactly one marker line
  return source.replace(MARKER_LINE, (_line, prefix, suffix) => `${prefix}${id}${suffix}`)
}

/**
 * The Host's artifact revision: sha1 over mtimeMs/ctimeMs/size, 12 hex chars.
 * Mirrors `artifactRevision()` in `@deepseek-ai/dsh-client-modules`, so a
 * mismatch means the Host's graph still reflects an older read of the file.
 * @param {{mtimeMs: number, ctimeMs: number, size: number}} stat
 * @returns {string}
 */
export function artifactRevisionOf(stat) {
  const parts = [String(stat.mtimeMs), String(stat.ctimeMs), String(stat.size)]
  const hash = createHash('sha1').update('plugin-artifact').update('\0')
  for (const part of parts) hash.update(`${String(Buffer.byteLength(part))}:`).update(part)
  return hash.digest('hex').slice(0, 12)
}

/* ── CLI ─────────────────────────────────────────────────────── */

function usage() {
  return [
    'usage: node scripts/bundle-id.mjs [--file <path>] [--json] [--write]',
    '       node scripts/bundle-id.mjs --runtime <id>',
    '       node scripts/bundle-id.mjs --served --url <loopback base> [--id <plugin id>] [--timeout <ms>]',
    '',
    '  --file      client source to check (default: this package\'s client.js)',
    '  --write     rewrite the marker line; refuses when it is missing or duplicated',
    '  --runtime   compare an in-page `dataset.dshMusicBundle` value with the source id',
    '  --served    read the live Host graph over /plugins/events and compare served bytes',
    '  --url       loopback base URL; required by --served, never defaulted',
    '  --id        plugin id in the graph (default: @local/dsh-music)',
    '  --timeout   SSE/fetch budget in ms (default: 8000)',
    '  --json      print one JSON object instead of prose',
  ].join('\n')
}

function parseArgs(argv) {
  const options = {
    file: null,
    json: false,
    write: false,
    runtime: null,
    served: false,
    url: null,
    id: DEFAULT_PLUGIN_ID,
    timeout: 8000,
    help: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = () => {
      const value = argv[index + 1]
      if (value === undefined) throw new Error(`bundle-id: ${arg} needs a value`)
      index += 1
      return value
    }
    switch (arg) {
      case '--file': options.file = next(); break
      case '--json': options.json = true; break
      case '--write': options.write = true; break
      case '--runtime': options.runtime = next(); break
      case '--served': options.served = true; break
      case '--url': options.url = next(); break
      case '--id': options.id = next(); break
      case '--timeout': options.timeout = Number(next()); break
      case '--help': case '-h': options.help = true; break
      default: throw new Error(`bundle-id: unknown argument "${arg}"`)
    }
  }
  return options
}

function defaultFile() {
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'client.js')
}

/** Reject anything that is not a plain loopback HTTP origin. */
function loopbackBase(raw) {
  let url
  try {
    url = new URL(raw)
  } catch {
    throw new Error(`bundle-id: --url must be an absolute URL, got "${raw}"`)
  }
  if (url.protocol !== 'http:') throw new Error(`bundle-id: --url must be http, got ${url.protocol}`)
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new Error(`bundle-id: --url must be loopback, got ${url.hostname}`)
  }
  if (url.port === '') throw new Error('bundle-id: --url must carry an explicit port')
  return url
}

function validPluginId(id) {
  return typeof id === 'string' && /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i.test(id)
}

/**
 * Read the first `graph` frame from /plugins/events, then disconnect.
 * Cancelling the reader is the normal SSE shutdown; the socket does not linger.
 */
async function readGraph(base, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const url = new URL('/plugins/events', base)
  let reader = null
  try {
    const response = await fetch(url, {
      headers: { accept: 'text/event-stream' },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`bundle-id: /plugins/events returned ${response.status}`)
    reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) throw new Error('bundle-id: event stream ended before a graph frame')
      buffer += decoder.decode(value, { stream: true })
      let newline
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        if (!line.startsWith('data:')) continue
        const frame = JSON.parse(line.slice(5).trim())
        if (frame?.type === 'graph' && frame.graph !== undefined) return frame.graph
      }
    }
  } finally {
    clearTimeout(timer)
    if (reader !== null) await reader.cancel().catch(() => {})
    controller.abort()
  }
}

async function fetchServed(base, rowUrl, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(new URL(`/${rowUrl.replace(/^\/+/, '')}`, base), { signal: controller.signal })
    if (response.status !== 200) throw new Error(`bundle-id: bundle route returned ${response.status}`)
    return await response.text()
  } finally {
    clearTimeout(timer)
  }
}

function report(options, payload, lines) {
  if (options.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
    return
  }
  for (const line of lines) process.stdout.write(`${line}\n`)
}

async function run(argv) {
  const options = parseArgs(argv)
  if (options.help) {
    process.stdout.write(`${usage()}\n`)
    return 0
  }
  if (!validPluginId(options.id)) throw new Error(`bundle-id: invalid plugin id "${options.id}"`)
  if (options.served && options.url === null) throw new Error('bundle-id: --served requires --url (no default port)')
  if (!Number.isFinite(options.timeout) || options.timeout <= 0) throw new Error('bundle-id: --timeout must be a positive millisecond count')

  const file = options.file ?? defaultFile()
  const source = readFileSync(file, 'utf8')
  const { embedded, stripped } = splitSource(source)
  const expected = fingerprint(stripped)

  if (options.write) {
    if (embedded === expected) {
      report(options, { file, sourceId: expected, changed: false }, [`source id ${expected}`, 'already current; nothing written'])
      return 0
    }
    const stamped = stampId(source, expected)
    writeFileSync(file, stamped)
    const verify = computeBundleId(readFileSync(file, 'utf8'))
    if (verify !== expected) throw new Error(`bundle-id: write produced ${verify}, expected ${expected}`)
    report(options, { file, sourceId: expected, changed: true, previous: embedded }, [`source id ${expected}`, `stamped (was ${embedded})`])
    return 0
  }

  const sourceMatches = embedded === expected

  if (options.runtime !== null) {
    const runtimeMatches = options.runtime === expected
    report(options, {
      file,
      sourceId: expected,
      embedded,
      sourceMatches,
      runtimeId: options.runtime,
      runtimeMatches,
    }, [
      `source id    ${expected}`,
      `embedded     ${embedded}${sourceMatches ? '' : '  ← STALE (run --write)'}`,
      `runtime id   ${options.runtime}${runtimeMatches ? '  ← matches' : '  ← DOES NOT MATCH'}`,
      runtimeMatches && sourceMatches
        ? 'PASS: the page reached the plugin activation point on this exact source'
        : 'FAIL: the page is not running this source (or the marker is stale)',
    ])
    return sourceMatches && runtimeMatches ? 0 : 1
  }

  if (options.served) {
    const base = loopbackBase(options.url)
    let graph
    try {
      graph = await readGraph(base, options.timeout)
    } catch (error) {
      report(options, { file, sourceId: expected, served: 'unavailable', reason: String(error?.message ?? error) }, [
        `source id    ${expected}`,
        `served       unavailable: ${error?.message ?? error}`,
        'SKIP: the Host graph could not be read; nothing was proven',
      ])
      return 2
    }
    const row = (graph.entries ?? []).find((entry) => entry.id === options.id)
    if (row === undefined) {
      report(options, { file, sourceId: expected, served: 'missing-entry', pluginId: options.id }, [
        `source id    ${expected}`,
        `served       plugin "${options.id}" is not in the Host graph`,
        'SKIP: nothing was proven',
      ])
      return 2
    }
    const stat = statSync(file)
    const artifactRev = artifactRevisionOf(stat)
    const revMatches = artifactRev === row.rev
    let body = ''
    let bodyError = null
    try {
      body = await fetchServed(base, row.url, options.timeout)
    } catch (error) {
      bodyError = String(error?.message ?? error)
    }
    const servedMatches = bodyError === null && body.startsWith(source)
    const tail = bodyError === null && body.length > source.length ? body.slice(source.length) : ''
    const tailMatches = bodyError === null && BUNDLE_TAIL.test(tail)
    const servedMarker = bodyError === null ? (body.match(ID_IN_MARKER)?.[1] ?? null) : null
    const servedIdMatches = servedMarker === expected
    const pass = revMatches && servedMatches && tailMatches && servedIdMatches
    report(options, {
      file,
      pluginId: options.id,
      sourceId: expected,
      artifactRev,
      hostRev: row.rev,
      revMatches,
      url: row.url,
      release: graph.release ?? null,
      servedBytes: bodyError === null ? Buffer.byteLength(body, 'utf8') : null,
      servedMatches,
      servedMarker,
      servedIdMatches,
      tailMatches,
      bodyError,
    }, [
      `source id    ${expected}`,
      `artifact rev ${artifactRev}${revMatches ? '  ← matches host' : `  ← HOST HAS ${row.rev} (stale graph: the Host has not re-read the file)`}`,
      `served       ${bodyError ?? `${Buffer.byteLength(body, "utf8")} bytes, content ${servedMatches ? 'identical' : 'DIFFERENT'}${tailMatches ? ', trailer ok' : ', trailer UNEXPECTED'}`}`,
      `served id    ${servedMarker ?? '(none)'}${servedIdMatches ? '  ← matches source' : '  ← DOES NOT MATCH source'}`,
      `host release ${graph.release?.version ?? '?'} / ${graph.release?.commit ?? '?'}`,
      pass ? 'PASS: the Host would serve exactly this source' : 'FAIL: the Host and the working tree disagree',
    ])
    return pass ? 0 : 1
  }

  report(options, { file, sourceId: expected, embedded, matches: sourceMatches }, [
    `file        ${file}`,
    `source id   ${expected}`,
    `embedded    ${embedded}`,
    sourceMatches ? 'PASS: the marker matches the source' : 'FAIL: the marker is stale — run --write',
  ])
  return sourceMatches ? 0 : 1
}

const invokedDirectly = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href

if (invokedDirectly) {
  run(process.argv.slice(2)).then((code) => {
    process.exitCode = code
  }).catch((error) => {
    process.stderr.write(`${error?.message ?? error}\n`)
    process.exitCode = 3
  })
}
