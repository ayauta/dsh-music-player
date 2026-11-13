/**
 * Guard: the copy of `lib/shared/playhead.js` inside `client.js` must be the
 * module, character for character — and nothing outside that copy may read the
 * sample timestamp.
 *
 * `client.js` is a browser bundle with no renderer available to `node --test`
 * (same constraint `client-source.test.mjs` works under), so the arithmetic
 * cannot be imported from the bundle. Inlining is how one source of truth
 * survives a no-build client; this test is what makes the copy safe to keep.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { CLIENT_FILE, MODULE_FILE, renderBlock, extractBlock } from '../scripts/inline-playhead.mjs'

test('the inlined block is exactly what the module renders', () => {
  const source = readFileSync(CLIENT_FILE, 'utf8')
  const block = extractBlock(source)
  assert.ok(block !== null, 'client.js has no BEGIN/END inlined-playhead markers')
  assert.equal(
    block,
    renderBlock(readFileSync(MODULE_FILE, 'utf8')),
    'the inlined copy is stale — run `node scripts/inline-playhead.mjs --write`',
  )
})

test('the sample timestamp is read in exactly one place: the module copy', () => {
  const source = readFileSync(CLIENT_FILE, 'utf8')
  const block = extractBlock(source)
  assert.ok(block !== null, 'client.js has no BEGIN/END inlined-playhead markers')
  // Counted, not subtracted: a CRLF checkout makes a byte-level `replace` miss.
  const inside = (block.match(/positionSampledAt/g) ?? []).length
  const total = (source.match(/positionSampledAt/g) ?? []).length
  assert.ok(inside > 0, 'the inlined module stopped reading the sample timestamp at all')
  assert.equal(total, inside, 'the playhead is recomputed outside the inlined module; call estimatePositionMs instead')
})
