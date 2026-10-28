/**
 * Conservative filename parsing for local music files.
 *
 * Ground rules (product requirement, do not relax):
 *  - We never invent an artist, an album or a year we cannot point at in the
 *    filename. Unrecognized segments are reported as leftovers, not consumed.
 *  - The original basename and full path are always preserved verbatim by the
 *    caller; nothing here mutates or renames files.
 *  - A quality token inside a filename is a *claim* only. The probe result is
 *    the authority; `qualityTag` exists so the UI can show the claim and the
 *    measured value side by side.
 */

/** `01.`, `1. `, `01 - `, `第1首` style leading track numbers. */
const LEADING_TRACK = /^\s*(?:第\s*)?(\d{1,3})\s*(?:[.、,，_\-—]\s*|\s+)/
/** Any `《title》` occurrence. */
const BOOK_TITLE = /《([^》]{1,120})》/
/** A whole dot-separated segment that is only a quality/precision claim. */
const SPEC_SEGMENT = /^(?:(\d{1,2})\s*-?\s*bits?|(\d{2,3}(?:\.\d)?)\s*k(?:hz|s)?|hi-?res|lossless|hq|sq|dsd\d*)$/i
const YEAR_SEGMENT = /^(19|20)\d{2}$/
const YEAR_LOOSE = /(?:^|[^\d])((?:19|20)\d{2})(?:[^\d]|$)/
/** Noise we remove before display but never invent around. */
const EDITION_SEGMENT = /^(?:伴奏|纯音乐|instrumental|off\s*vocal|inst\.?)$/i

const AUDIO_EXT = new Set(['.wav', '.mp3', '.flac', '.m4a', '.mp4', '.aac', '.ogg', '.opus', '.aif', '.aiff', '.wma'])

export function isAudioName(name) {
  const dot = name.lastIndexOf('.')
  if (dot < 0) return false
  return AUDIO_EXT.has(name.slice(dot).toLowerCase())
}

export function splitExt(basename) {
  const dot = basename.lastIndexOf('.')
  if (dot <= 0) return { stem: basename, ext: '' }
  return { stem: basename.slice(0, dot), ext: basename.slice(dot).toLowerCase() }
}

function specLabel(match) {
  if (match[1]) return `${match[1]}bit`
  if (match[2]) return `${match[2]}kHz`
  return match[0].toLowerCase()
}

/**
 * @param {string} basename file name with extension
 * @returns {{title: string, trackNo: number|null, trackNoRaw: string|null,
 *   year: number|null, yearFrom: 'segment'|'loose'|null,
 *   qualityTag: string|null, unknownTokens: string[], stem: string, ext: string}}
 */
export function parseFileName(basename) {
  const { stem, ext } = splitExt(basename)
  const result = {
    title: '',
    trackNo: null,
    trackNoRaw: null,
    year: null,
    yearFrom: null,
    qualityTag: null,
    unknownTokens: [],
    stem,
    ext,
  }

  let rest = stem.trim()

  const track = LEADING_TRACK.exec(rest)
  if (track) {
    result.trackNo = Number(track[1])
    result.trackNoRaw = track[1]
    rest = rest.slice(track[0].length)
  }

  const specs = []
  let titleFromBook = null

  // Work segment by segment on '.' so that stray dots inside a title survive
  // (e.g. `【解锁奖励1】兰音无后期干音with.和声` keeps its dot).
  const segments = rest.split('.')
  const kept = []
  for (const raw of segments) {
    const segment = raw.trim()
    if (segment === '') continue

    const book = BOOK_TITLE.exec(segment)
    if (book) {
      const before = segment.slice(0, book.index).trim()
      const after = segment.slice(book.index + book[0].length).trim()
      // Text glued to the 《》 stays part of the title: 《梦倾天下》伴奏
      const glued = `${before}${after}`.trim()
      if (titleFromBook === null) titleFromBook = `${book[1].trim()}${glued}`
      else if (glued) kept.push(glued)
      continue
    }

    const spec = SPEC_SEGMENT.exec(segment)
    if (spec) { specs.push(specLabel(spec)); continue }

    if (YEAR_SEGMENT.test(segment)) {
      if (result.year === null) { result.year = Number(segment); result.yearFrom = 'segment' }
      continue
    }

    if (EDITION_SEGMENT.test(segment)) { kept.push(segment); continue }

    kept.push(segment)
  }

  if (titleFromBook !== null) {
    result.title = titleFromBook
    // Segments that survived after the title (edition words, stray words) are
    // appended only when they were glued to the title segment itself.
    // Edition words such as 伴奏 are already carried by the folder name, so
    // they are not reported as unknown leftovers.
    result.unknownTokens = [...result.unknownTokens, ...kept.filter((s) => !EDITION_SEGMENT.test(s))]
  } else {
    // No 《》: keep the remaining text verbatim, minus recognized metadata.
    const leftovers = []
    for (const segment of kept) {
      if (YEAR_LOOSE.test(segment) && !/[\u4e00-\u9fff]/.test(segment)) {
        if (result.year === null) { result.year = Number(YEAR_LOOSE.exec(segment)[1]); result.yearFrom = 'loose' }
        const cleaned = segment.replace(YEAR_LOOSE, ' ').trim()
        if (cleaned) leftovers.push(cleaned)
        continue
      }
      leftovers.push(segment)
    }
    result.title = leftovers.join('.').trim() || stem.trim()
  }

  if (result.year === null) {
    const loose = YEAR_LOOSE.exec(rest)
    if (loose) { result.year = Number(loose[1]); result.yearFrom = 'loose' }
  }

  if (specs.length > 0) result.qualityTag = specs.join('/')
  if (result.title === '') result.title = stem.trim()
  result.unknownTokens = [...new Set(result.unknownTokens.filter((t) => t && t !== result.title))]

  return result
}

/**
 * Folder label: the directory name with a leading `YYYY-MM-DD ` date removed.
 * Pure formatting — no words are dropped from the middle.
 */
export function folderLabel(dirName) {
  return dirName.replace(/^\s*\d{4}-\d{2}-\d{2}\s+/, '').trim() || dirName
}

/**
 * Display shorthand for an album name. When the folder label carries a
 * `《…》` section, that title is what a listener would call the album; the raw
 * label stays available everywhere else (details, tooltips). This only extracts
 * a substring — it never adds words.
 */
export function albumShortName(label) {
  const text = String(label ?? '').trim()
  const book = BOOK_TITLE.exec(text)
  if (book !== null) {
    const title = book[1].trim()
    if (title !== '') return title
  }
  return text
}

/** Natural compare used for track lists: 2 before 10, Chinese by code point. */
export function naturalCompare(a, b) {
  const re = /(\d+)|(\D+)/g
  const ax = String(a).toLowerCase().match(re) ?? []
  const bx = String(b).toLowerCase().match(re) ?? []
  const n = Math.min(ax.length, bx.length)
  for (let i = 0; i < n; i++) {
    const an = /^\d/.test(ax[i])
    const bn = /^\d/.test(bx[i])
    if (an && bn) {
      const d = Number(ax[i]) - Number(bx[i])
      if (d !== 0) return d
    } else if (ax[i] !== bx[i]) {
      return ax[i] < bx[i] ? -1 : 1
    }
  }
  return ax.length - bx.length
}

/** Track ordering inside a folder: track number first, then natural name. */
export function trackOrder(a, b) {
  const at = a.trackNo ?? 1e9
  const bt = b.trackNo ?? 1e9
  if (at !== bt) return at - bt
  return naturalCompare(a.basename, b.basename)
}
