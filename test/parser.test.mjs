import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseFileName, folderLabel, naturalCompare, trackOrder } from '../lib/host/parser.js'

/**
 * Table-driven against the real library, so a regression in the parser shows up
 * as a failing expectation on a filename the user actually owns.
 */
const CASES = [
  ['01.《形神合一》.2024.兰音.24bits.48khz.wav',
    { title: '形神合一', trackNo: 1, year: 2024, qualityTag: '24bit/48kHz' }],
  ['02.《哑谜》.2024.兰音.24bits.48khz.wav',
    { title: '哑谜', trackNo: 2, year: 2024, qualityTag: '24bit/48kHz' }],
  ['01.《云月谣》.2023.兰音.24bits.48khz.wav',
    { title: '云月谣', trackNo: 1, year: 2023, qualityTag: '24bit/48kHz' }],
  ['02.《人生有梦》.2023.兰音.16bits.48khz.wav',
    { title: '人生有梦', trackNo: 2, year: 2023, qualityTag: '16bit/48kHz' }],
  ['10.《天兰夜》.2023.兰音.24bits.48khz.wav',
    { title: '天兰夜', trackNo: 10, year: 2023, qualityTag: '24bit/48kHz' }],
  ['01.《形神合一》.伴奏.2024.兰音.24bits.48khz.wav',
    { title: '形神合一', trackNo: 1, year: 2024, qualityTag: '24bit/48kHz' }],
  ['【解锁奖励1】兰音无后期干音with.和声.mp3',
    { title: '【解锁奖励1】兰音无后期干音with.和声', trackNo: null, year: null, qualityTag: null }],
  ['【解锁奖励2】原创新歌demo.mp3',
    { title: '【解锁奖励2】原创新歌demo', trackNo: null, year: null, qualityTag: null }],
  ['1. 梦倾天下.wav',
    { title: '梦倾天下', trackNo: 1, year: null, qualityTag: null }],
  ['2. 人间万朵红.wav',
    { title: '人间万朵红', trackNo: 2, year: null, qualityTag: null }],
  ['《梦倾天下》伴奏.wav',
    { title: '梦倾天下伴奏', trackNo: null, year: null, qualityTag: null }],
  ['《人间万朵红》伴奏.mp3',
    { title: '人间万朵红伴奏', trackNo: null, year: null, qualityTag: null }],
  ['01.《镜中的陌生人》.2024.兰音.24bits.48khz.wav',
    { title: '镜中的陌生人', trackNo: 1, year: 2024, qualityTag: '24bit/48kHz' }],
  ['03 - Song Title.flac',
    { title: 'Song Title', trackNo: 3, year: null, qualityTag: null }],
  ['No Track Number.m4a',
    { title: 'No Track Number', trackNo: null, year: null, qualityTag: null }],
]

test('parses the real library filenames without inventing data', () => {
  for (const [name, expected] of CASES) {
    const got = parseFileName(name)
    assert.equal(got.title, expected.title, `title of ${name}`)
    assert.equal(got.trackNo, expected.trackNo, `trackNo of ${name}`)
    assert.equal(got.year, expected.year, `year of ${name}`)
    assert.equal(got.qualityTag, expected.qualityTag, `qualityTag of ${name}`)
    assert.equal(got.artistHint, undefined, 'no artist inference field is exposed')
  }
})

test('reports leftovers instead of guessing an artist', () => {
  const got = parseFileName('01.《形神合一》.2024.兰音.24bits.48khz.wav')
  assert.deepEqual(got.unknownTokens, ['兰音'])
  assert.ok(!('artist' in got), 'parser must not emit an artist')
})

test('folder label drops only the leading date', () => {
  assert.equal(
    folderLabel('2024-05-11 兰音.2024.《形神合一》.兰音工作室.兰音Reine音乐作品集'),
    '兰音.2024.《形神合一》.兰音工作室.兰音Reine音乐作品集',
  )
  assert.equal(folderLabel('兰音二专-梦倾天下'), '兰音二专-梦倾天下')
  assert.equal(folderLabel('伴奏'), '伴奏')
})

test('natural compare orders 2 before 10', () => {
  const names = ['10.《天兰夜》', '2.《哑谜》', '1.《形神合一》']
  const sorted = [...names].sort(naturalCompare)
  assert.deepEqual(sorted, ['1.《形神合一》', '2.《哑谜》', '10.《天兰夜》'])
})

test('track order prefers the parsed track number', () => {
  const tracks = [
    { trackNo: null, basename: '《梦倾天下》伴奏.wav' },
    { trackNo: 2, basename: '2. 人间万朵红.wav' },
    { trackNo: 1, basename: '1. 梦倾天下.wav' },
  ]
  const sorted = [...tracks].sort(trackOrder)
  assert.deepEqual(sorted.map((t) => t.basename), ['1. 梦倾天下.wav', '2. 人间万朵红.wav', '《梦倾天下》伴奏.wav'])
})
