import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseLrc, activeLineIndex, SYNCED, UNTIMED } from '../lib/host/lrc.js'

test('parses timed LRC with metadata and several stamps per line', () => {
  const text = [
    '[ti:梦倾天下]',
    '[ar:兰音Reine]',
    '[00:01.20]第一句',
    '[00:05.500]第二句',
    '[00:10.00][00:20.00]副歌',
  ].join('\n')
  const out = parseLrc(text)
  assert.equal(out.kind, SYNCED)
  assert.equal(out.meta.ti, '梦倾天下')
  assert.deepEqual(out.lines.map((l) => l.timeMs), [1200, 5500, 10000, 20000])
  assert.equal(out.lines[1].text, '第二句')
})

test('a file without time tags becomes untimed text, never fake sync', () => {
  const out = parseLrc('谁一杯斟开谁眼底心葩\n\n灵河岸沐风月饮缘法\n')
  assert.equal(out.kind, UNTIMED)
  assert.deepEqual(out.lines.map((l) => l.text), ['谁一杯斟开谁眼底心葩', '灵河岸沐风月饮缘法'])
  assert.ok(out.lines.every((l) => l.timeMs === null))
})

test('empty input yields empty kind so the UI can hide the region', () => {
  assert.equal(parseLrc('').kind, 'empty')
  assert.equal(parseLrc('\uFEFF\n\n').kind, 'empty')
})

test('active line lookup', () => {
  const lines = [{ timeMs: 1000, text: 'a' }, { timeMs: 3000, text: 'b' }]
  assert.equal(activeLineIndex(lines, 500), -1)
  assert.equal(activeLineIndex(lines, 1000), 0)
  assert.equal(activeLineIndex(lines, 2999), 0)
  assert.equal(activeLineIndex(lines, 3000), 1)
})
