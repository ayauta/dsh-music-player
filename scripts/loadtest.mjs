/**
 * Load test: play the whole library through the live plugin, then saturate the
 * CPU for a bounded window and compare the playhead against wall clock.
 *
 *   node scripts/loadtest.mjs [baselineSeconds] [stressSeconds]
 *
 * The playhead is mpv's own `time-pos` (sampled through the plugin's status
 * endpoint), so a stall means the audio clock stopped, not that a DOM timer
 * slipped.
 */
import { spawn } from 'node:child_process'
import os from 'node:os'

const API = process.env.DSH_MUSIC_API ?? 'http://127.0.0.1:62618/music/api'
const baselineSeconds = Number(process.argv[2] ?? 20)
const stressSeconds = Number(process.argv[3] ?? 45)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function call(op, payload) {
  const response = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ op, ...(payload ?? {}) }),
  })
  const body = await response.json()
  if (body.ok !== true) throw new Error(body.error ?? 'host rejected request')
  return body.data
}

async function sample(seconds) {
  const started = Date.now()
  const points = []
  let latencyMax = 0
  while (Date.now() - started < seconds * 1000) {
    const t0 = Date.now()
    const state = await call('player.state')
    const latency = Date.now() - t0
    latencyMax = Math.max(latencyMax, latency)
    points.push({
      at: Date.now() - started,
      positionMs: state.positionMs,
      playing: state.playing,
      paused: state.paused,
      trackId: state.trackId,
    })
    await sleep(900)
  }
  return { points, latencyMax, elapsed: Date.now() - started }
}

/**
 * The host publishes the playhead once per second, so per-pair ratios are
 * meaningless; what matters is cumulative advance against wall clock and the
 * longest window in which the playhead did not move at all.
 */
function analyse(phase) {
  const { points, elapsed, latencyMax } = phase
  let progressed = 0
  let longestStallMs = 0
  let stallRunStart = null
  let lastPosition = null
  let lastTrack = null
  for (const point of points) {
    if (lastPosition !== null && point.trackId === lastTrack) {
      const delta = point.positionMs - lastPosition
      if (delta > 0) {
        progressed += delta
        if (stallRunStart !== null) {
          longestStallMs = Math.max(longestStallMs, point.at - stallRunStart)
          stallRunStart = null
        }
      } else if (stallRunStart === null) {
        stallRunStart = point.at
      }
    }
    lastPosition = point.positionMs
    lastTrack = point.trackId
  }
  if (stallRunStart !== null) longestStallMs = Math.max(longestStallMs, elapsed - stallRunStart)
  return {
    samples: points.length,
    wallMs: elapsed,
    progressed,
    ratio: Number((progressed / elapsed).toFixed(3)),
    longestStallMs,
    maxLatencyMs: latencyMax,
  }
}

function startBurner(seconds) {
  const program = `const end=Date.now()+${seconds * 1000};let x=0;while(Date.now()<end){x+=Math.sqrt(Math.random()*1e6)}`
  const child = spawn(process.execPath, ['-e', program], { stdio: 'ignore', windowsHide: true })
  return child
}

const tracks = await call('library.list', { view: 'all' })
console.log(`library: ${tracks.length} tracks`)
await call('queue.play', { ids: tracks.map((track) => track.id), startIndex: 0 })
await sleep(2500)

const before = await call('status')
console.log(`engine : ${before.engineMode} / ${before.engine.status} / out=${JSON.stringify(before.engine.audioOut)}`)

const baseline = analyse(await sample(baselineSeconds))
console.log('baseline:', JSON.stringify(baseline))

const workers = Math.max(2, Math.min(4, os.cpus().length - 2))
const burners = Array.from({ length: workers }, () => startBurner(stressSeconds))
const loadStarted = Date.now()
const stress = analyse(await sample(stressSeconds))
const cpuSeconds = ((Date.now() - loadStarted) / 1000) * workers
for (const burner of burners) { try { burner.kill('SIGKILL') } catch { /* gone */ } }

console.log('stress  :', JSON.stringify(stress))
console.log(`load    : ${workers} workers × ${stressSeconds}s ≈ ${cpuSeconds.toFixed(0)} cpu-seconds requested`)

const after = await call('status')
console.log(`after   : playing=${after.player.playing} paused=${after.player.paused} pos=${after.player.positionMs} track=${after.player.trackId}`)
console.log(JSON.stringify({ baseline, stress, workers, stressSeconds }, null, 2))
