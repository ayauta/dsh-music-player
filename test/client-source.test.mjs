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

test('the transport keeps one four-state mode control (R08)', () => {
  const source = readFileSync(clientPath, 'utf8')
  const cycle = source.match(/const MODE_CYCLE = \[([^\]]+)\]/)?.[1]
  assert.ok(cycle, 'MODE_CYCLE is missing')
  assert.deepEqual(
    cycle.split(',').map((part) => part.trim().replace(/^'|'$/g, '')),
    ['sequence', 'all', 'one', 'shuffle'],
    'the approved cycle is 顺序 → 列表 → 单曲 → 随机',
  )
  assert.ok(!source.includes('ShuffleButton'), 'the separate shuffle toggle must not come back')
  assert.ok(!source.includes('RepeatButton'), 'the separate repeat button must not come back')
  assert.equal((source.match(/h\(ModeButton, \{ mode \}\)/g) ?? []).length, 1,
    'the transport row holds exactly one mode control')
})

test('the queue highlight follows the playing track, not the play-order cursor', () => {
  const source = readFileSync(clientPath, 'utf8')
  const panel = sliceBetween(source, 'function QueuePanel(', 'function LyricsPanel(')
  assert.match(panel, /const currentIndex = /,
    'the queue panel must derive the highlighted row from the playing track')
  assert.ok(!/const active = index === cursor/.test(panel),
    'the cursor indexes the queue, so the row is still found by id')
})

test('the queue panel clears the whole queue and never clips it by cursor', () => {
  const source = readFileSync(clientPath, 'utf8')
  const panel = sliceBetween(source, 'function QueuePanel(', 'function LyricsPanel(')
  assert.ok(panel.includes("command('queue.clear'"), 'the destructive action is the one explicit clear op')
  assert.ok(!/slice\(0,\s*cursor/.test(panel),
    'clipping by the cursor cut the wrong entries under shuffle (B18); the feature is retired')
})

test('the queue view plays the row that was clicked, without replacing the queue (B15)', () => {
  const source = readFileSync(clientPath, 'utf8')
  const panel = sliceBetween(source, 'function QueuePanel(', 'function LyricsPanel(')
  assert.ok(panel.includes("command('player.jump', { trackId: id })"),
    'a row click asks for the track, not for the position it happened to hold')
  assert.ok(!panel.includes("command('queue.play'"),
    'the queue view must never hand a track list back to the host')
  assert.ok(!panel.includes('library.list'),
    'and must not read the library for its rows')
  assert.ok(/onKeyDown: \(event\) => \{[\s\S]{0,200}?event\.key === 'Enter'/.test(panel),
    'the row is keyboard operable')
  assert.ok(!/h\('button'[^)]*h\('button'/.test(panel),
    'no button is nested inside another button')
})

test('the queue title counts the queue, not the library (B15)', () => {
  const source = readFileSync(clientPath, 'utf8')
  const at = source.indexOf('showQueue ? `')
  assert.ok(at > 0, 'the toolbar must special-case the queue count')
  assert.ok(source.slice(at, at + 120).includes('player?.queue?.length'),
    'the count comes from the player snapshot, not from a library list')
})

test('the queue view never asks the library for a track list (B15)', () => {
  const source = readFileSync(clientPath, 'utf8')
  const reload = sliceBetween(source, 'const reload = useCallback(async () => {', 'useEffect(() => { reload() }')
  assert.ok(reload.includes("if (view === 'queue')"), 'the reload effect must special-case the queue view')
  const branch = reload.slice(reload.indexOf("if (view === 'queue')"))
  assert.ok(branch.slice(0, 400).includes('setTracks([])'),
    'the queue view must not keep a library list around, otherwise playFrom would use it')
})
test('the mode button is a utility, not a prominent button (DESIGN §7.1)', () => {
  const source = readFileSync(clientPath, 'utf8')
  const start = source.indexOf('function ModeButton(')
  const next = source.indexOf('\n    function ', start + 1)
  assert.ok(start > 0 && next > start, 'ModeButton moved; update this guard')
  const mode = source.slice(start, next)
  assert.ok(!mode.includes('data-active'), 'a filled background is HIG prominent-button styling; mode is a utility toggle')
})

test('the transport row stays three keys and mode lives in the header (DESIGN §7)', () => {
  const source = readFileSync(clientPath, 'utf8')
  const transport = sliceBetween(source, "className: 'dshm-pop-transport'", "className: 'dshm-pop-volume'")
  assert.equal((transport.match(/h\(IconButton/g) || []).length, 3, 'transport must be prev / play / next')
  assert.ok(!transport.includes('ModeButton'), 'mode is a setting, not a transport action')
  assert.ok(!transport.includes("size: 'xl'"), 'one size for the whole transport row; hierarchy comes from the glyph (HIG: style, not size)')
  assert.equal((transport.match(/size: 'lg'/g) ?? []).length, 3, 'all three transport keys share the same 44px box')
  assert.ok(!/\.dshm-pop-transport \.dshm-ib[^{]*:hover[^{]*\{[^}]*background:\s*transparent/.test(source), 'desktop icon buttons keep a hover plate (HIG Toolbars)')
  const header = sliceBetween(source, "className: 'dshm-pop-head'", "className: 'dshm-pop-body'")
  assert.ok(header.includes('ModeButton'), 'the header must own the four-state mode control')
  assert.ok(!header.includes('dshm-pop-title'), 'the visible panel title is gone; aria-label carries the name')
})

test('no component calls a hook after an early return (React #310)', () => {
  const source = readFileSync(clientPath, 'utf8')
  const starts = [...source.matchAll(/\n {4}function (\w+)\(/g)]
  const offenders = []
  for (let i = 0; i < starts.length; i += 1) {
    const start = starts[i].index
    const next = i + 1 < starts.length ? starts[i + 1].index : source.length
    const lines = source.slice(start, next).split('\n')
    // An early return is either a bare six-space return, or any return inside a
    // six-space `if (...) { ... }` block. Returns in nested callbacks are deeper.
    let early = -1
    for (let j = 0; j < lines.length; j += 1) {
      if (/^ {6}return\b/.test(lines[j])) { early = j; break }
      if (/^ {6}if \(/.test(lines[j])) {
        let k = j + 1
        let hasReturn = false
        for (; k < lines.length; k += 1) {
          if (/^ {6}\}/.test(lines[k])) break
          if (/^ {8,}return\b/.test(lines[k])) hasReturn = true
        }
        if (hasReturn) { early = k; break }
      }
    }
    if (early < 0) continue
    const late = lines.slice(early + 1).some((line) => /^ {6}.*\buse[A-Z]\w*\(/.test(line))
    if (late) offenders.push(starts[i][1])
  }
  assert.deepEqual(offenders, [], 'hooks after an early return change the hook count mid-lifecycle (#310): ' + offenders.join(', '))
})
