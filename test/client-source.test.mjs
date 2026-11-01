/**
 * Static guards for the Client half.
 *
 * These are lint-style assertions, not behaviour tests: `client.js` is a browser
 * bundle (`window.__ModuleLoader__.load(...)`) with no renderer available to
 * `node --test`, and adding a DOM renderer is a separate decision. What they can
 * still do is pin the two facts that made B1 a silent blank:
 *
 *   1. `Cover` accepts a track-less caller (`trackId` only, `track: null` — the
 *      queue rows do this). Reading `track.hasCover` there threw on the first
 *      row and blanked the whole panel.
 *   2. `ErrorBoundary` must honour both call shapes used in this file
 *      (`fallback` element and `makeFallback(message)` function). Reading only
 *      `fallback` rendered `null`, which is why the crash looked like empty space.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const repo = fileURLToPath(new URL('..', import.meta.url))
const clientPath = join(repo, 'client.js')

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  assert.ok(start >= 0, `${startMarker} not found in client.js`)
  const end = source.indexOf(endMarker, start)
  assert.ok(end > start, `${endMarker} not found after ${startMarker}`)
  return source.slice(start, end)
}

test('Cover tolerates a caller that only knows an id (B1)', () => {
  const source = readFileSync(clientPath, 'utf8')
  const cover = sliceBetween(source, 'function Cover(', 'function ProgressBar(')

  // `track?.` is fine; `track.` would throw whenever a queue row passes null.
  const bare = cover.match(/\btrack\.[A-Za-z_$]/g) ?? []
  assert.deepEqual(bare, [], `Cover dereferences its nullable track (${bare.join(', ')}); use track?.`)
})

test('ErrorBoundary honours both fallback shapes used in this file', () => {
  const source = readFileSync(clientPath, 'utf8')
  const boundary = sliceBetween(source, 'class ErrorBoundary', 'const guardedCell')

  assert.match(boundary, /this\.props\.fallback/, 'the element-shaped fallback must stay supported')
  assert.match(boundary, /this\.props\.makeFallback/, 'the function-shaped fallback must stay supported')
})

test('every ErrorBoundary call site uses one of those two names', () => {
  const source = readFileSync(clientPath, 'utf8')
  const calls = source.match(/h\(ErrorBoundary,\s*\{[^}]*\}/g) ?? []
  assert.ok(calls.length > 0, 'no ErrorBoundary call sites found')
  for (const call of calls) {
    assert.match(
      call,
      /\b(?:makeFallback|fallback)\b/,
      `ErrorBoundary call site passes no fallback the class reads: ${call.replace(/\s+/g, ' ')}`,
    )
  }
})
