/**
 * ffprobe wrapper: the single source of truth for what a file actually is.
 * Filename claims are never promoted into these fields.
 */
import { runCollect } from './process.js'

/**
 * @returns {Promise<{ok: boolean, reason?: string, container?: string, codec?: string,
 *   sampleRate?: number, bitsPerSample?: number, channels?: number, durationMs?: number,
 *   bitrate?: number, hasEmbeddedArt?: boolean, tags?: Record<string,string>}>}
 */
export async function probeFile(processes, ffprobePath, filePath, options = {}) {
  const result = await runCollect(processes, [
    ffprobePath,
    '-v', 'error',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    filePath,
  ], { timeoutMs: options.timeoutMs ?? 20000 })

  if (result.code !== 0) {
    return { ok: false, reason: firstLine(result.stderr) || `ffprobe exit ${result.code}`, stderr: tail(result.stderr) }
  }

  let parsed
  try { parsed = JSON.parse(result.stdout) } catch {
    return {
      ok: false,
      reason: result.stdout.trim() === '' ? 'ffprobe produced no output' : 'ffprobe returned unparsable output',
      stderr: tail(result.stderr),
    }
  }

  const streams = Array.isArray(parsed.streams) ? parsed.streams : []
  const audio = streams.find((s) => s.codec_type === 'audio')
  if (audio === undefined) {
    return { ok: false, reason: 'no audio stream' }
  }

  const format = parsed.format ?? {}
  const tags = {}
  for (const [key, value] of Object.entries(format.tags ?? {})) {
    if (typeof value === 'string' && value.trim() !== '') tags[key.toLowerCase()] = value.trim()
  }
  for (const [key, value] of Object.entries(audio.tags ?? {})) {
    if (tags[key.toLowerCase()] === undefined && typeof value === 'string' && value.trim() !== '') {
      tags[key.toLowerCase()] = value.trim()
    }
  }

  const container = String(format.format_name ?? '').split(',')[0] || undefined
  const codec = audio.codec_name ?? undefined
  const sampleRate = Number(audio.sample_rate) || undefined
  const channels = Number(audio.channels) || undefined

  // Bits: WAV/FLAC report bits_per_raw_sample; AAC/MP3 report 0 (lossy).
  const rawBits = Number(audio.bits_per_raw_sample)
  const streamBits = Number(audio.bits_per_sample)
  const bitsPerSample = Number.isFinite(rawBits) && rawBits > 0
    ? rawBits
    : Number.isFinite(streamBits) && streamBits > 0 ? streamBits : undefined

  const formatDuration = Number(format.duration)
  const streamDuration = Number(audio.duration)
  const seconds = Number.isFinite(formatDuration) && formatDuration > 0
    ? formatDuration
    : Number.isFinite(streamDuration) && streamDuration > 0 ? streamDuration : undefined

  const formatBitrate = Number(format.bit_rate)
  const streamBitrate = Number(audio.bit_rate)

  const hasEmbeddedArt = streams.some(
    (s) => (s.disposition?.attached_pic === 1) || (s.codec_type === 'video' && s.disposition?.attached_pic === 1),
  )

  return {
    ok: true,
    container,
    codec,
    sampleRate,
    bitsPerSample,
    channels,
    durationMs: seconds === undefined ? undefined : Math.round(seconds * 1000),
    bitrate: Number.isFinite(formatBitrate) && formatBitrate > 0
      ? formatBitrate
      : Number.isFinite(streamBitrate) && streamBitrate > 0 ? streamBitrate : undefined,
    hasEmbeddedArt,
    tags,
  }
}

/** Human label for a measured spec, e.g. `24bit/48kHz/2ch`. */
export function specLabel(probe) {
  if (!probe) return ''
  const parts = []
  if (probe.bitsPerSample) parts.push(`${probe.bitsPerSample}bit`)
  else if (probe.codec) parts.push(formatCodec(probe.codec))
  if (probe.sampleRate) parts.push(`${formatRate(probe.sampleRate)}kHz`)
  if (probe.channels) parts.push(`${probe.channels}ch`)
  return parts.join('/')
}

export function formatRate(hz) {
  const value = hz / 1000
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

export function formatCodec(codec) {
  if (!codec) return '?'
  const map = {
    pcm_s16le: 'PCM 16', pcm_s24le: 'PCM 24', pcm_s32le: 'PCM 32', pcm_f32le: 'PCM float',
    flac: 'FLAC', mp3: 'MP3', aac: 'AAC', alac: 'ALAC', opus: 'Opus', vorbis: 'Vorbis',
  }
  return map[codec] ?? codec.toUpperCase()
}

function firstLine(text) {
  return String(text ?? '').split('\n').map((l) => l.trim()).find((l) => l !== '') ?? ''
}

function tail(text) {
  const lines = String(text ?? '').trim().split('\n').filter((line) => line !== '')
  return lines.slice(-3).join(' | ')
}
