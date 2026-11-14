/**
 * Guards on the Host's playhead discipline.
 *
 * `player.js` writes `positionMs` from four kinds of place: the 1 Hz poll, the
 * pause stamp, `seek()`, and the resets that mean "nowhere". Until 2026-11-14
 * each of them wrote the pair by hand — `positionMs` and the `positionSampledAt`
 * that dates it — and the pair could drift apart: `pause()` stamped the position,
 * an in-flight poll put an older one back under a *newer* stamp, and every client
 * read that as "the bar went backwards" (B33, B35).
 *
 * The fix was a generation counter on `positionMs` and one write path. These
 * guards keep the second half of that: the pair is written in one place, so no
 * future call site can stamp half of it.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const repo = fileURLToPath(new URL('..', import.meta.url))
const playerPath = join(repo, 'lib', 'host', 'player.js')
const source = readFileSync(playerPath, 'utf8')

test('the sample stamp is written in exactly one place', () => {
  const stamps = source.match(/state\.positionSampledAt = Date\.now\(\)/g) ?? []
  assert.equal(stamps.length, 1,
    `every position write must go through stampPosition(); found ${stamps.length} hand-written stamps`)

  const fn = source.slice(source.indexOf('function stampPosition('))
  assert.ok(fn.length > 0, 'stampPosition() is missing')
  const body = fn.slice(0, fn.indexOf('\n  }'))
  assert.match(body, /state\.positionMs =/, 'stampPosition writes the position')
  assert.match(body, /state\.positionSampledAt = Date\.now\(\)/, 'stampPosition writes the stamp beside it')
})

test('the three movement writers all use it', () => {
  // The poll, the pause stamp and seek() are the only places a real position is
  // recorded. Slice each one and require the call, so a new writer cannot sneak in.
  const slice = (from, to) => {
    const start = source.indexOf(from)
    assert.ok(start > 0, `${from} not found`)
    const end = source.indexOf(to, start)
    assert.ok(end > start, `${to} not found after ${from}`)
    return source.slice(start, end)
  }

  const poll = slice('pollTimer = setInterval(', '}, pollMs)')
  assert.match(poll, /stampPosition\(/, 'the poll records the position through stampPosition')

  const pause = slice('async pause() {', 'async toggle() {')
  assert.match(pause, /stampPosition\(/, 'the pause stamp goes through stampPosition')

  const seek = slice('async seek(ms) {', 'notify(\'position\')')
  assert.match(seek, /stampPosition\(/, 'seek goes through stampPosition')
})

test('clearing the playhead clears both halves', () => {
  // `clear()` means "nowhere": a fresh position with no sample would be a lie.
  const clear = source.slice(source.indexOf('async clear() {'), source.indexOf('async clear() {') + 400)
  assert.match(clear, /state\.positionMs = 0/, 'position resets to zero')
  assert.match(clear, /state\.positionSampledAt = 0/, 'and the sample stamp is cleared with it')
})
