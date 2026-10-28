/**
 * Executable discovery for the two external tools the player needs.
 * The host process inherits the user's PATH, but a GUI-launched app can have a
 * stale one, so well-known install locations are probed as well.
 */
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const LOCALAPPDATA = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local')

function firstExisting(paths) {
  for (const candidate of paths) {
    if (candidate && existsSync(candidate)) return candidate
  }
  return null
}

function wingetFfmpegBin() {
  const root = join(LOCALAPPDATA, 'Microsoft', 'WinGet', 'Packages')
  if (!existsSync(root)) return []
  const found = []
  try {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || !/ffmpeg/i.test(entry.name)) continue
      const packageDir = join(root, entry.name)
      for (const inner of readdirSync(packageDir, { withFileTypes: true })) {
        if (!inner.isDirectory()) continue
        const bin = join(packageDir, inner.name, 'bin')
        if (existsSync(bin)) found.push(bin)
      }
    }
  } catch { /* unreadable directory */ }
  return found
}

export function resolveMpv(config = {}) {
  if (config.mpvPath) return existsSync(config.mpvPath) ? config.mpvPath : null
  return firstExisting([
    join(config.pluginDir ?? '.', 'bin', 'mpv', 'mpv.exe'),
    join(homedir(), 'scoop', 'apps', 'mpv', 'current', 'mpv.exe'),
    join(homedir(), 'scoop', 'shims', 'mpv.exe'),
    join(LOCALAPPDATA, 'mpv', 'mpv.exe'),
    'C:\\Program Files\\mpv\\mpv.exe',
    'C:\\Program Files (x86)\\mpv\\mpv.exe',
    'C:\\ProgramData\\chocolatey\\bin\\mpv.exe',
  ])
}

export function resolveFfprobe(config = {}) {
  if (config.ffprobePath) return existsSync(config.ffprobePath) ? config.ffprobePath : null
  const wingetBins = wingetFfmpegBin().map((bin) => join(bin, 'ffprobe.exe'))
  const candidates = [
    ...wingetBins,
    join(homedir(), 'scoop', 'apps', 'ffmpeg', 'current', 'bin', 'ffprobe.exe'),
    join(homedir(), 'scoop', 'shims', 'ffprobe.exe'),
    'C:\\ffmpeg\\bin\\ffprobe.exe',
    'C:\\Program Files\\ffmpeg\\bin\\ffprobe.exe',
    'C:\\ProgramData\\chocolatey\\bin\\ffprobe.exe',
  ]
  const local = firstExisting(candidates)
  if (local !== null) return local
  return 'ffprobe' // last resort: bare name resolved through PATH
}

export function resolveFfmpeg(config = {}) {
  if (config.ffmpegPath) return existsSync(config.ffmpegPath) ? config.ffmpegPath : null
  const probe = resolveFfprobe(config)
  if (probe && probe !== 'ffprobe') {
    const sibling = probe.replace(/ffprobe(\.exe)?$/i, (m) => (m.toLowerCase().endsWith('.exe') ? 'ffmpeg.exe' : 'ffmpeg'))
    if (existsSync(sibling)) return sibling
  }
  const wingetBins = wingetFfmpegBin().map((bin) => join(bin, 'ffmpeg.exe'))
  return firstExisting([
    ...wingetBins,
    join(homedir(), 'scoop', 'apps', 'ffmpeg', 'current', 'bin', 'ffmpeg.exe'),
    join(homedir(), 'scoop', 'shims', 'ffmpeg.exe'),
    'C:\\ffmpeg\\bin\\ffmpeg.exe',
  ]) ?? 'ffmpeg'
}
