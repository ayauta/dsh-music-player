/**
 * Structural guards for the docs that carry stable IDs and tables.
 *
 * Why a check and not a rule: on 2026-11-15 two doc edits went wrong in ways a
 * human reader would not have caught — a set of table rows was inserted *above*
 * the table header in `docs/TESTING.md`, and a bullet was duplicated in
 * `CHANGELOG.md` (that one had a guard already). Both are mechanical, so they get
 * a deterministic check rather than a paragraph in AGENTS.md.
 *
 * What is asserted is the shape, never the prose:
 *   1. a `|` row cannot exist outside a table (its header is the row above, or it
 *      *is* the header followed by a separator);
 *   2. every row of a table has the column count its separator declares;
 *   3. stable IDs (`D-nn`, `Bnn`) appear once, and are strictly increasing;
 *   4. every decision entry states its status.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const repo = fileURLToPath(new URL('..', import.meta.url))
const read = (rel) => readFileSync(join(repo, rel), 'utf8').replace(/\r\n/g, '\n')

/** Markdown tables: contiguous runs of lines starting with `|`. */
function tables (text) {
  const lines = text.split('\n')
  const blocks = []
  let current = null
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('|')) {
      if (current === null) { current = { start: i + 1, lines: [] }; blocks.push(current) }
      current.lines.push({ number: i + 1, text: line })
    } else {
      current = null
    }
  }
  return blocks
}

const SEPARATOR = /^\|(?:\s*:?-{2,}:?\s*\|)+$/
/** `\|` is an escaped pipe inside a cell (common in code spans) and is not a divider. */
const columns = (line) => line.replace(/\\\|/g, '').split('|').length - 2

test('no table row sits outside a table (docs/TESTING.md, 2026-11-15)', () => {
  const offenders = []
  for (const file of markdownFiles()) {
    for (const block of tables(read(file))) {
      const first = block.lines[0].text
      const second = block.lines[1]?.text ?? ''
      // A block that is not a header (its second line is a separator) is orphaned:
      // rows were spliced in above the table they belonged to.
      if (!SEPARATOR.test(second.trim())) {
        offenders.push(`${file}:${block.start}`)
      }
    }
  }
  assert.deepEqual(offenders, [], 'table rows with no header above them: ' + offenders.join(', '))
})

test('every row of a table has the column count its separator declares', () => {
  const offenders = []
  for (const file of markdownFiles()) {
    for (const block of tables(read(file))) {
      const separator = block.lines[1]
      if (separator === undefined) continue
      const expected = columns(separator.text)
      for (const row of block.lines.slice(2)) {
        if (columns(row.text) !== expected) {
          offenders.push(`${file}:${row.number} has ${columns(row.text)}, header declares ${expected}`)
        }
      }
    }
  }
  assert.deepEqual(offenders, [], offenders.join('; '))
})

test('decision IDs are unique and strictly increasing (docs/DECISIONS.md)', () => {
  const ids = [...read('docs/DECISIONS.md').matchAll(/^## D-(\d+)/gm)].map((m) => Number(m[1]))
  assert.ok(ids.length > 0, 'no decision entries found')
  assert.equal(new Set(ids).size, ids.length, 'a decision ID is used twice')
  const sorted = [...ids].sort((a, b) => a - b)
  assert.deepEqual(ids, sorted, 'decision entries are out of order')
})

test('every decision entry states a status', () => {
  const missing = []
  for (const block of read('docs/DECISIONS.md').split(/^## /m).slice(1)) {
    const title = block.split('\n')[0]
    if (!/\*\*状态\*\*/.test(block)) missing.push(title)
  }
  assert.deepEqual(missing, [], 'entries without a 状态 line: ' + missing.join(' | '))
})

test('defect IDs are unique and strictly increasing (LIMITATIONS.md)', () => {
  const ids = [...read('LIMITATIONS.md').matchAll(/^\| \*\*B(\d+)\*\* \|/gm)].map((m) => Number(m[1]))
  assert.ok(ids.length > 0, 'no defect rows found')
  assert.equal(new Set(ids).size, ids.length, 'a defect ID is used twice')
  assert.deepEqual(ids, [...ids].sort((a, b) => a - b), 'defect rows are out of order')
})

/** Every markdown file under `docs/` plus the three at the root. */
function markdownFiles () {
  const walk = (dir) => readdirSync(join(repo, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) return walk(rel)
    return entry.name.endsWith('.md') ? [rel] : []
  })
  return [
    'AGENTS.md', 'ARCHITECTURE.md', 'CHANGELOG.md', 'GLOSSARY.md', 'LIMITATIONS.md', 'README.md',
    ...walk('docs'),
  ]
}
