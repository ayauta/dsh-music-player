/**
 * Test fixtures: a tiny, generated music library.
 *
 * Nothing is committed to Git and nothing touches the user's library: every
 * file is produced with ffmpeg into a caller-provided temporary directory.
 *
 *   test/support/fixtures.mjs  ← imported by test/support/host.mjs
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { pluginDir } from '../../lib/host/plugin.js'
import { resolveMpv, resolveFfprobe, resolveFfmpeg } from '../../lib/host/binaries.js'

const CONFIG = { pluginDir: pluginDir() }

/** Which external tools this machine actually has. */
export function detectTooling() {
  return {
    mpv: resolveMpv(CONFIG),
    ffprobe: resolveFfprobe(CONFIG),
    ffmpeg: resolveFfmpeg(CONFIG),
  }
}

function run(ffmpeg, args) {
  const result = spawnSync(ffmpeg, args, { encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed (${args.join(' ')}): ${result.stderr ?? result.error ?? 'unknown'}`)
  }
}

function tone(ffmpeg, file, { frequency, seconds, codec }) {
  const args = ['-v', 'error', '-y', '-f', 'lavfi', '-i', `sine=frequency=${frequency}:duration=${seconds}`,
    '-ar', '48000', '-ac', '2']
  if (codec === 'mp3') args.push('-c:a', 'libmp3lame', '-b:a', '128k')
  else args.push('-c:a', 'pcm_s24le')
  args.push(file)
  run(ffmpeg, args)
}

/**
 * Create `<root>/library` with three tracks and a folder cover.
 * Track A is long enough for the "prev restarts after 3s" assertion.
 *
 * @param {string} root  temporary root owned by the caller
 * @param {{ffmpeg: string}} tooling
 */
export function createFixtureLibrary(root, tooling) {
  if (!tooling?.ffmpeg) throw new Error('ffmpeg not found; fixtures cannot be generated')
  const dir = join(root, 'library')
  mkdirSync(dir, { recursive: true })

  const tracks = [
    { file: join(dir, '01.《测试甲》.wav'), seconds: 8, title: '测试甲', ext: '.wav' },
    { file: join(dir, '02.测试乙.wav'), seconds: 3, title: '测试乙', ext: '.wav' },
    { file: join(dir, '03.测试丙.mp3'), seconds: 3, title: '测试丙', ext: '.mp3' },
  ]
  const frequencies = [440, 660, 880]
  tracks.forEach((track, index) => {
    tone(tooling.ffmpeg, track.file, {
      frequency: frequencies[index],
      seconds: track.seconds,
      codec: track.ext === '.mp3' ? 'mp3' : 'wav',
    })
  })

  // A 1x1 JPEG would be enough for cover detection, but a small square is
  // easier to eyeball when a failing test prints it.
  const cover = join(dir, 'cover.jpg')
  run(tooling.ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x334455:s=64x64',
    '-frames:v', '1', cover])
  if (!existsSync(cover)) writeFileSync(cover, Buffer.alloc(0))

  return { dir, tracks, cover }
}
