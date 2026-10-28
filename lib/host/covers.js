/**
 * Cover resolution and cache.
 *
 * Priority used by the player (deliberate order, documented in LIMITATIONS.md):
 *   1. a cover the user set explicitly for the track or its album
 *   2. artwork embedded in the file
 *   3. a conventional image file in the same folder
 *   4. nothing — the UI draws a neutral placeholder
 *
 * A deliberate override outranks automatic sources, otherwise "set cover" would
 * appear to do nothing for a folder that already ships a `cover.jpg`.
 */
import { existsSync, statSync, mkdirSync, readdirSync } from 'node:fs'
import { join, dirname, extname, basename } from 'node:path'
import { createHash } from 'node:crypto'
import { runCollect } from './process.js'

const FOLDER_COVER_NAMES = [
  'cover.jpg', 'cover.jpeg', 'cover.png', 'cover.webp',
  'folder.jpg', 'folder.jpeg', 'folder.png',
  'front.jpg', 'front.png', 'album.jpg', 'albumart.jpg', 'albumartsmall.jpg',
]
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'])

export const MIME_BY_EXT = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp',
}

export function createCovers({ dataDir, processes, ffmpegPath, log }) {
  const cacheDir = join(dataDir, 'cache', 'covers')
  mkdirSync(cacheDir, { recursive: true })
  const folderCache = new Map() // dir -> {file, at}
  const embeddedInFlight = new Map()

  function folderCover(dir) {
    const cached = folderCache.get(dir)
    if (cached !== undefined && Date.now() - cached.at < 30_000) return cached.file
    let file = null
    try {
      const entries = readdirSync(dir)
      const byLower = new Map(entries.map((name) => [name.toLowerCase(), name]))
      for (const wanted of FOLDER_COVER_NAMES) {
        const actual = byLower.get(wanted)
        if (actual !== undefined) { file = join(dir, actual); break }
      }
      if (file === null) {
        // Fall back to `*cover*.jpg` style names, e.g. 反转童话cover.jpg
        const loose = entries.find((name) => /cover|front|folder/i.test(name) && IMAGE_EXT.has(extname(name).toLowerCase()))
        if (loose !== undefined) file = join(dir, loose)
      }
    } catch { /* unreadable */ }
    folderCache.set(dir, { file, at: Date.now() })
    return file
  }

  async function embeddedCover(track) {
    const key = `${track.id}:${track.mtimeMs}`
    if (embeddedInFlight.has(key)) return embeddedInFlight.get(key)
    const promise = (async () => {
      const out = join(cacheDir, `${createHash('sha1').update(key).digest('hex').slice(0, 16)}.jpg`)
      if (existsSync(out)) return out
      try {
        const result = await runCollect(processes, [
          ffmpegPath, '-v', 'error', '-y',
          '-i', track.path,
          '-map', '0:v:0',
          '-frames:v', '1',
          '-vf', 'scale=iw:ih',
          out,
        ], { timeoutMs: 15000 })
        if (result.code === 0 && existsSync(out)) return out
      } catch (error) { log?.('warn', `cover extraction failed for ${basename(track.path)}: ${error.message}`) }
      return null
    })()
    embeddedInFlight.set(key, promise)
    try { return await promise } finally { embeddedInFlight.delete(key) }
  }

  /** User-set cover file for a track or its album, if it still exists. */
  function userCover(track, albumOverride) {
    const candidates = [track.coverPath, albumOverride?.coverPath]
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate !== '' && existsSync(candidate) && IMAGE_EXT.has(extname(candidate).toLowerCase())) {
        return candidate
      }
    }
    return null
  }

  return {
    cacheDir,

    /** @returns {Promise<{file: string, source: 'user'|'embedded'|'folder', mime: string}|null>} */
    async resolve(track, albumOverride) {
      const user = userCover(track, albumOverride)
      if (user !== null) return { file: user, source: 'user', mime: MIME_BY_EXT[extname(user).toLowerCase()] ?? 'image/jpeg' }
      if (track.hasEmbeddedArt) {
        const extracted = await embeddedCover(track)
        if (extracted !== null) return { file: extracted, source: 'embedded', mime: 'image/jpeg' }
      }
      const folder = folderCover(track.dir)
      if (folder !== null) return { file: folder, source: 'folder', mime: MIME_BY_EXT[extname(folder).toLowerCase()] ?? 'image/jpeg' }
      return null
    },

    /** Cheap check for list rendering: does a cover of any kind exist? */
    hasCover(track, albumOverride) {
      if (userCover(track, albumOverride) !== null) return true
      if (track.hasEmbeddedArt) return true
      return folderCover(track.dir) !== null
    },

    statOf(file) {
      try { return statSync(file) } catch { return null }
    },

    invalidate(dir) {
      if (dir === undefined) folderCache.clear()
      else folderCache.delete(dir)
    },

    dirOf: (file) => dirname(file),
  }
}
