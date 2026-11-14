/**
 * Guard: no bullet appears twice in `CHANGELOG.md`.
 *
 * Every section is one version's changes, so an identical bullet in two sections
 * is always a copy-paste accident — never a real repetition. This exact accident
 * happened on 2026-11-14: a PowerShell `.Replace('**Changed**', …)` rewrote
 * *every* occurrence, and one new tool line landed in all seven historical
 * versions, claiming `scripts/syntax-check.mjs` shipped in 1.1.0.
 *
 * Cheap, deterministic, and it would have caught it before the commit.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const repo = fileURLToPath(new URL('..', import.meta.url))
const changelog = readFileSync(join(repo, 'CHANGELOG.md'), 'utf8')

test('CHANGELOG has no duplicated bullet', () => {
  const seen = new Map()
  const duplicates = []
  const lines = changelog.split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trimEnd()
    if (!line.startsWith('- ')) continue
    // Normalised so a stray double space is not treated as a different bullet.
    const key = line.replace(/\s+/g, ' ')
    if (seen.has(key)) duplicates.push(`${seen.get(key) + 1} & ${index + 1}: ${key.slice(0, 60)}`)
    else seen.set(key, index)
  }
  assert.deepEqual(duplicates, [], 'a bullet repeated across sections (copy-paste accident):\n  ' + duplicates.join('\n  '))
})

test('each tool entry is claimed by exactly one version', () => {
  // The accident this guards against: a PowerShell `.Replace('**Changed**', …)`
  // rewrote *every* occurrence, so one new tool line landed in all seven historical
  // versions at once. Counting per entry keeps the guard alive after a release
  // (when the tools genuinely ship) instead of tying it to "still unreleased".
  const lines = changelog.split('\n')
  for (const tool of ['scripts/syntax-check.mjs', 'scripts/test-repeat.mjs']) {
    const hits = lines.filter((line) => line.trimStart().startsWith('- ') && line.includes(tool))
    assert.equal(hits.length, 1, `${tool} must be listed by exactly one version, found ${hits.length}`)
  }
})
