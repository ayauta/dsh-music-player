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

test('every playhead write goes through stampPosition or clearPlayhead', () => {
  // Counting `positionSampledAt = Date.now()` alone let the other half slip: a
  // site could write `positionMs` on its own and leave the stamp describing a
  // different moment. Walk the writes instead and require each to sit inside one
  // of the two helpers.
  const helpers = ['function stampPosition(', 'function clearPlayhead('].map((marker) => {
    const start = source.indexOf(marker)
    assert.ok(start > 0, `${marker} is missing`)
    return source.slice(start, source.indexOf('\n  }', start))
  })

  const strayWrites = []
  const lines = source.split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    if (!/state\.positionMs\s*=/.test(lines[index])) continue
    const inHelper = helpers.some((body) => body.includes(lines[index]))
    if (!inHelper) strayWrites.push(`${index + 1}: ${lines[index].trim()}`)
  }
  assert.deepEqual(strayWrites, [],
    'a playhead write outside the two helpers can drift from its sample stamp (B33/B35):\n  ' + strayWrites.join('\n  '))
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
  // `clear()` means "nowhere": a fresh stamp over an empty position would tell
  // every client that a real sample of position 0 exists.
  const clear = source.slice(source.indexOf('async clear() {'), source.indexOf('async clear() {') + 400)
  assert.match(clear, /clearPlayhead\(\)/, 'clear() goes through clearPlayhead')
  assert.ok(!/state\.positionSampledAt = Date\.now\(\)/.test(clear), 'and never stamps "nowhere"')

  const helper = source.slice(source.indexOf('function clearPlayhead('))
  const body = helper.slice(0, helper.indexOf('\n  }'))
  assert.match(body, /state\.positionMs = 0/, 'position resets to zero')
  assert.match(body, /state\.positionSampledAt = 0/, 'and the sample stamp is cleared with it')
})
