/**
 * Minimal, dependency-free LRC reader.
 *
 * Only `.lrc` is supported (product decision). Two shapes exist in the wild and
 * both are handled: time-tagged lyrics drive a scrolling view; a file without
 * any time tag is shown as static, untimed text (never fake-synchronised).
 */

const TIME_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g
const META_TAG = /^\[([a-zA-Z]{2,8}):(.*)\]$/

export const UNTIMED = 'untimed'
export const SYNCED = 'synced'

/**
 * @param {string} text raw LRC file content
 * @returns {{kind: 'synced'|'untimed'|'empty', meta: Record<string,string>, lines: {timeMs: number|null, text: string}[]}}
 */
export function parseLrc(text) {
  const meta = {}
  const lines = []
  let sawTime = false

  const normalised = String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')

  for (const rawLine of normalised.split('\n')) {
    const line = rawLine.trim()
    if (line === '') continue

    const metaMatch = META_TAG.exec(line)
    if (metaMatch && !/^\d+$/.test(metaMatch[1])) {
      meta[metaMatch[1].toLowerCase()] = metaMatch[2].trim()
      continue
    }

    const stamps = []
    TIME_TAG.lastIndex = 0
    let match
    while ((match = TIME_TAG.exec(line)) !== null) {
      const minutes = Number(match[1])
      const seconds = Number(match[2])
      const fracRaw = match[3] ?? '0'
      const frac = Number(fracRaw) / Math.pow(10, fracRaw.length)
      stamps.push(Math.round((minutes * 60 + seconds + frac) * 1000))
    }

    const body = line.replace(TIME_TAG, '').trim()
    if (stamps.length === 0) {
      if (body !== '') lines.push({ timeMs: null, text: body })
      continue
    }

    sawTime = true
    if (body === '') continue
    for (const timeMs of stamps) lines.push({ timeMs, text: body })
  }

  if (sawTime) {
    lines.sort((a, b) => (a.timeMs ?? 0) - (b.timeMs ?? 0))
    return { kind: SYNCED, meta, lines }
  }
  return { kind: lines.length > 0 ? UNTIMED : 'empty', meta, lines }
}

/** Index of the line active at `positionMs`, or -1 before the first tag. */
export function activeLineIndex(lines, positionMs) {
  let lo = 0
  let hi = lines.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const t = lines[mid].timeMs
    if (t === null) return found
    if (t <= positionMs) { found = mid; lo = mid + 1 } else { hi = mid - 1 }
  }
  return found
}
