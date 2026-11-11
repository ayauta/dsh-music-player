/**
 * Motion guards for the Client half (DESIGN §6, TESTING §2.4).
 *
 * These are lint-style assertions over the stylesheet embedded in client.js.
 * They exist because every motion rule is invisible to behaviour tests: a single
 * stray height transition or a second easing curve costs frames and reads as
 * 'the UI feels off' without failing anything else. Each assertion maps to one
 * row of TESTING §2.4.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const repo = fileURLToPath(new URL('..', import.meta.url))
const source = readFileSync(join(repo, 'client.js'), 'utf8')

const ALLOWED_DURATIONS = new Set([0, 110, 120, 130, 150, 160, 200, 240])
const BANNED_PROPERTIES = new Set([
  'height', 'width', 'top', 'left', 'right', 'bottom',
  'margin', 'padding', 'box-shadow', 'background-position',
])

const transitionValues = [...source.matchAll(/transition\s*:([^;}]+)/g)].map((m) => m[1])
const animationValues = [...source.matchAll(/animation\s*:([^;}]+)/g)].map((m) => m[1])
const durationTokens = [...source.matchAll(/--dshm-dur-[a-z-]+\s*:\s*(\d+)ms/g)].map((m) => Number(m[1]))

test('durations stay inside the approved scale (TESTING §2.4 #1)', () => {
  const found = [...transitionValues, ...animationValues]
    .flatMap((value) => [...value.matchAll(/(\d+)ms/g)].map((m) => Number(m[1])))
  const offenders = [...found, ...durationTokens].filter((ms) => !ALLOWED_DURATIONS.has(ms))
  assert.deepEqual(offenders, [], 'unapproved durations: ' + offenders.join(', ') + 'ms')
})

test('transitions never animate layout or paint properties (TESTING §2.4 #2)', () => {
  const offenders = []
  for (const value of transitionValues) {
    for (const part of value.split(',')) {
      const property = part.trim().split(/\s+/)[0]
      if (BANNED_PROPERTIES.has(property)) offenders.push(property)
    }
  }
  assert.deepEqual([...new Set(offenders)], [], 'transitions animate ' + offenders.join(', ') + '; only transform/opacity/color are allowed')
})

test('no bare ease-in curve (TESTING §2.4 #3)', () => {
  assert.ok(!/(^|[^\w-])ease-in(?![\w-])/.test(source), 'a bare ease-in curve is slowest where the user is looking')
})

test('every keyframe animation is referenced (TESTING §2.4 #4)', () => {
  const names = [...source.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1])
  const unreferenced = names.filter((name) => !animationValues.some((value) => value.includes(name)))
  assert.deepEqual(unreferenced, [], 'unreferenced @keyframes: ' + unreferenced.join(', '))
})

test('keyframe animations stay at or below 120ms (DESIGN §6.5)', () => {
  const long = animationValues
    .flatMap((value) => [...value.matchAll(/(\d+)ms/g)].map((m) => Number(m[1])))
    .filter((ms) => ms > 120)
  assert.deepEqual(long, [], 'keyframes above 120ms: ' + long.join(', ') + 'ms')
})

test('every data-* state used by the stylesheet is written by the client (TESTING §2.4 #5)', () => {
  const attrs = [...new Set([...source.matchAll(/\[data-([a-z-]+)/g)].map((m) => m[1]))]
  const missing = attrs.filter((attr) => !new RegExp("['\"]data-" + attr + "['\"]\\s*:|setAttribute\\(\\s*['\"]data-" + attr + "['\"]").test(source))
  assert.deepEqual(missing, [], 'styles target data-' + missing.join(', data-') + ' but nothing sets it')
})

test('the exit timer matches the CSS exit duration (DESIGN §6.5)', () => {
  const css = source.match(/--dshm-dur-pop-out:\s*(\d+)ms/)
  const js = source.match(/const POP_EXIT_MS = (\d+)/)
  assert.ok(css && js, 'exit duration token or POP_EXIT_MS is missing')
  assert.equal(js[1], css[1], 'the panel would unmount before or after its exit transition finishes')
})

test('hover-driven motion is gated to real pointers (TESTING §2.4 #6)', () => {
  assert.match(
    source,
    /@media \(hover: hover\) and \(pointer: fine\)\s*\{[^}]*\.dshm-card:hover[^}]*\}/,
    'card hover movement must live inside @media (hover: hover) and (pointer: fine)',
  )
})
