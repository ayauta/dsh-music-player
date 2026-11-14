/**
 * Playhead arithmetic — the one place that turns "a position the host sampled
 * once per second" into "where the playhead is *now*", plus the seek latch that
 * decides which value the progress bar paints right after a request.
 *
 * Two clocks, two questions — the split and the reason for it live in
 * `docs/DECISIONS.md` D-27; this file only pins the behaviour.
 *
 *  - **How much time has passed?** → the caller's monotonic clock.
 *  - **Did the host see my seek yet?** → the wall clock, the one reading both
 *    processes can date the same way (the host stamps it with `Date.now()`).
 *    A snapshot stamped *before* the request is the
 *    in-flight one from the previous poll: it is stale, and painting it is what
 *    made the bar snap back.
 *
 * So: `anchorOf` / `positionOf` never look at the host's sample time, and
 * `resolveSeek` never looks at the monotonic clock. Neither reads a clock itself;
 * every reading is a parameter.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { anchorOf, nextAnchor, nextPaint, acceptResponse, positionOf, fractionOf, remainingOf, resolveSeek, idleSeek, planSeek, settleSeek } from '../lib/shared/playhead.js'

/** A host snapshot shaped like `player.state` (only the fields read here). */
const playing = (positionMs, durationMs) => ({
  playing: true,
  paused: false,
  positionMs,
  durationMs,
  positionSampledAt: 7_000,
})

const paused = (positionMs, durationMs) => ({
  playing: false,
  paused: true,
  positionMs,
  durationMs,
  positionSampledAt: 7_000,
})

/* ── the anchor ─────────────────────────────────────────────────────────── */

test('an anchor keeps the position, the duration and the advancing flag', () => {
  assert.deepEqual(anchorOf(playing(12_000, 200_000), 500), {
    positionMs: 12_000,
    anchorMs: 500,
    durationMs: 200_000,
    advancing: true,
    sampleMs: 7_000,
  })
  assert.equal(anchorOf(paused(12_000, 200_000), 500).advancing, false)
})

test('an anchor reports `advancing: false` for the states that are not moving', () => {
  // `playing` without `paused: false` is the host's ambiguous middle state.
  assert.equal(anchorOf({ playing: true, positionMs: 0 }, 500).advancing, false)
  assert.equal(anchorOf({ playing: true, paused: true, positionMs: 0 }, 500).advancing, false)
  assert.equal(anchorOf({ positionMs: 0 }, 500).advancing, false)
})

/* ── interpolation ──────────────────────────────────────────────────────── */

test('an unknown player is at zero', () => {
  assert.equal(anchorOf(null, 500), null)
  assert.equal(anchorOf(undefined, 500), null)
  assert.equal(positionOf(null, 1_000), 0)
  assert.equal(positionOf(anchorOf(null, 500), 1_000), 0)
})

test('an advancing anchor advances with the monotonic clock', () => {
  const anchor = anchorOf(playing(12_000, 200_000), 500)
  assert.equal(positionOf(anchor, 500), 12_000)
  assert.equal(positionOf(anchor, 3_000), 14_500)
})

test('a paused anchor stays where it landed', () => {
  const anchor = anchorOf(paused(12_000, 200_000), 500)
  assert.equal(positionOf(anchor, 99_000), 12_000)
})

test('an anchor with no timestamp does not advance', () => {
  const anchor = anchorOf(playing(12_000, 200_000), 0)
  assert.equal(positionOf(anchor, 99_000), 12_000)
})

test('the position never runs past the duration', () => {
  const anchor = anchorOf(playing(199_500, 200_000), 500)
  assert.equal(positionOf(anchor, 9_000), 200_000)
})

test('an unknown duration leaves the position uncapped but never negative', () => {
  assert.equal(positionOf(anchorOf(playing(12_000, 0), 500), 3_000), 14_500)
  assert.equal(positionOf(anchorOf(paused(-40, 0), 500), 3_000), 0)
})

/**
 * The defect the module exists to remove: the old inline `estimateMs` clamped
 * only the upper bound, so a clock reading behind the sample produced a
 * negative playhead. Home Assistant's `getCurrentProgress` clamps for the same
 * reason.
 */
test('an anchor stamped after `now` holds position instead of going backwards', () => {
  assert.equal(positionOf(anchorOf(playing(5_000, 200_000), 5_000), 1_000), 5_000)
})

test('a non-finite clock reading does not poison the position', () => {
  assert.equal(positionOf(anchorOf(playing(5_000, 200_000), 1_000), Number.NaN), 5_000)
})

test('progress is a 0..1 fraction of the duration', () => {
  const anchor = anchorOf(playing(50_000, 200_000), 500)
  assert.equal(fractionOf(anchor, 500), 0.25)
  assert.equal(fractionOf(anchor, 1_000_000), 1)
  assert.equal(fractionOf(anchorOf(playing(50_000, 0), 500), 500), 0)
  assert.equal(fractionOf(null, 500), 0)
})

test('remaining time is the distance to the end, floored at zero', () => {
  const anchor = anchorOf(playing(50_000, 200_000), 500)
  assert.equal(remainingOf(anchor, 500), 150_000)
  assert.equal(remainingOf(anchor, 1_000_000), 0)
  assert.equal(remainingOf(null, 500), 0)
})

/* ── re-anchoring ───────────────────────────────────────────────────────── */

/**
 * The status payload is re-read constantly — on the 1 Hz poll, and again after
 * every command. The host, though, only produces a new position about once a
 * second, so most reads carry the sample we already have. Re-anchoring those
 * restarts interpolation from the same position: the bar rewinds, then creeps.
 * That is the "一卡一卡" in the Now Playing sheet.
 */
test('the same sample read twice keeps its anchor', () => {
  const player = playing(12_000, 200_000)
  const first = nextAnchor(null, player, 500)
  const second = nextAnchor(first, player, 1_500)

  assert.equal(second, first, 'the anchor is reused, not re-dated')
  assert.equal(positionOf(second, 1_500), 13_000, 'so the playhead keeps advancing instead of restarting')
})

test('a repeated read never moves the playhead backwards', () => {
  const player = playing(12_000, 200_000)
  let anchor = nextAnchor(null, player, 500)
  const before = positionOf(anchor, 900)

  anchor = nextAnchor(anchor, player, 1_400)

  assert.ok(positionOf(anchor, 1_400) >= before, 'a duplicate sample must not rewind the bar')
})

test('a new sample re-anchors', () => {
  const first = nextAnchor(null, playing(12_000, 200_000), 500)
  const fresher = { ...playing(13_000, 200_000), positionSampledAt: 8_000 }

  const second = nextAnchor(first, fresher, 1_500)

  assert.notEqual(second, first)
  assert.equal(second.positionMs, 13_000)
  assert.equal(second.anchorMs, 1_500)
})

test('a transport change re-anchors even when the position is unchanged', () => {
  // Pausing must stop the creep right away: same position, no longer advancing.
  const first = nextAnchor(null, playing(12_000, 200_000), 500)
  const stopped = nextAnchor(first, paused(12_000, 200_000), 1_000)

  assert.notEqual(stopped, first)
  assert.equal(positionOf(stopped, 9_000), 12_000)
})

test('an unknown player clears the anchor', () => {
  assert.equal(nextAnchor(nextAnchor(null, playing(12_000, 200_000), 500), null, 900), null)
})

/* ── what to write to the DOM ───────────────────────────────────────────── */

/**
 * B32: a paused progress bar still shook.
 *
 * The host's position is provably constant while paused (measured: 10 Hz for
 * 6 s, spread 0 ms), and nothing in the CSS animates the bar. What is left is
 * *writing*: the fill's `--p` and the bubble's text were assigned every frame,
 * 120 DOM writes a second for a value that had not changed, and the text
 * siblings `--p` drives (`left: calc(...)`, `scaleX(...)`) re-round on every one
 * of those layout invalidations. At rest that reads as a ~1 px shimmer. The two
 * time readouts never had this problem — they already skip unchanged values.
 *
 * `nextPaint` is that same guard, applied to the bar.
 */
test('an unchanged frame writes nothing', () => {
  const previous = { fraction: 0.5372, label: '1:41' }
  assert.deepEqual(nextPaint(previous, { fraction: 0.5372, label: '1:41' }), {
    write: false,
    fraction: 0.5372,
    label: '1:41',
  })
})

test('a first paint always writes', () => {
  assert.equal(nextPaint(null, { fraction: 0.2, label: '0:12' }).write, true)
  assert.equal(nextPaint(undefined, { fraction: 0.2, label: '0:12' }).write, true)
})

test('a moved playhead writes', () => {
  assert.equal(nextPaint({ fraction: 0.2, label: '0:12' }, { fraction: 0.2003, label: '0:12' }).write, true)
})

test('a new label writes even when the fraction is unchanged', () => {
  assert.equal(nextPaint({ fraction: 0.2, label: '0:12' }, { fraction: 0.2, label: '0:13' }).write, true)
})

test('sub-pixel noise never writes', () => {
  // Rounding jitter far below one device pixel must not count as movement.
  const previous = { fraction: 0.5, label: '0:30' }
  assert.equal(nextPaint(previous, { fraction: 0.50000004, label: '0:30' }).write, false)
  assert.equal(nextPaint(previous, { fraction: 0.49999998, label: '0:30' }).write, false)
})

test('ten seconds of a paused playhead is one paint, not twelve hundred', () => {
  // The user's scenario, at 60 fps: nothing moves, so nothing is written.
  const anchor = anchorOf(paused(101_764, 189_457), 1_000)
  let last = null
  let writes = 0
  for (let frame = 0; frame < 600; frame += 1) {
    const now = 1_000 + frame * (1000 / 60)
    const fraction = fractionOf(anchor, now)
    const next = nextPaint(last, { fraction, label: `t${Math.floor(fraction * 10)}` })
    if (next.write) {
      writes += 1
      last = { fraction: next.fraction, label: next.label }
    }
  }
  assert.equal(writes, 1, 'a paused bar touches the DOM once, not once per frame')
})

test('a playing playhead still paints, and never loses the latest value', () => {
  const anchor = anchorOf(playing(101_764, 189_457), 1_000)
  let last = null
  let writes = 0
  let finalNow = 0
  for (let frame = 0; frame < 60; frame += 1) {
    finalNow = 1_000 + frame * (1000 / 60)
    const next = nextPaint(last, { fraction: fractionOf(anchor, finalNow), label: '1:41' })
    if (next.write) {
      writes += 1
      last = { fraction: next.fraction, label: next.label }
    }
  }
  assert.ok(writes > 0, 'motion still paints')
  // The guard must never swallow the newest value: a skipped frame is only safe
  // because the next write carries the up-to-date number.
  assert.equal(last.fraction, Math.round(fractionOf(anchor, finalNow) * 1e5) / 1e5,
    'the last frame of motion reached the DOM')
})

test('a non-finite fraction paints as zero', () => {
  const next = nextPaint(null, { fraction: Number.NaN, label: 'x' })
  assert.equal(next.fraction, 0)
  assert.equal(next.write, true)
})

/* ── response ordering ──────────────────────────────────────────────────── */

/**
 * B34: after pressing pause, the bar *sometimes* slid back and then forward.
 *
 * The client asks for `status` from two places — the 1 Hz poll and the refresh
 * right after every command — with nothing ordering the answers. The pause
 * handler sits on an `await` for ~200 ms (fade + mpv confirmation), so a poll
 * issued *before* the click can be served and returned *after* the post-command
 * refresh. Applying it re-anchors the playhead on an older position **and** flips
 * `advancing` back to true: the bar rips backwards, then forward on the next
 * poll. Whether it happens at all depends on that interleaving, which is why it
 * looked probabilistic.
 *
 * Precedent for the fix: video.js 10 *drops* time updates that arrive during a
 * seek instead of smoothing them; Spotify's Web Playback SDK hands out one
 * ordered state object. Neither re-anchors from a stale answer.
 *
 * The gate numbers a request when it is **issued**, so ordering needs no clock:
 * a wall-clock jump or a host restart cannot invert it.
 */
test('the first response is accepted', () => {
  assert.equal(acceptResponse(0, 1), true)
})

test('a response older than the one already applied is dropped', () => {
  // Issue #1 (the poll, pre-pause) comes back after issue #2 (the refresh that
  // carries the pause). Applying #1 would undo the pause on screen.
  assert.equal(acceptResponse(2, 1), false)
})

test('the same response applied twice is dropped', () => {
  assert.equal(acceptResponse(2, 2), false)
})

test('a late, older answer must not move the bar backwards', () => {
  // Pinned arrival order — this is the probabilistic race made deterministic.
  const pausedAnswer = { id: 2, player: { ...paused(100_900, 189_457), positionSampledAt: 10_100 } }
  const staleAnswer = { id: 1, player: { ...playing(100_400, 189_457), positionSampledAt: 9_000 } }

  const painted = []
  let applied = 0
  let anchor = null
  let clock = 0
  for (const answer of [pausedAnswer, staleAnswer]) {
    if (!acceptResponse(applied, answer.id)) continue
    applied = answer.id
    anchor = nextAnchor(anchor, answer.player, clock)
    painted.push(positionOf(anchor, clock))
    clock += 16
  }

  assert.equal(applied, 2, 'the stale answer never became the applied snapshot')
  assert.deepEqual(painted, [100_900], 'the pause froze where it was; nothing ripped back to 100 400')
})
/* ── the seek latch ─────────────────────────────────────────────────────── */

/**
 * `pending` is the seek request: `{ ms, atMs }`, where `atMs` is the **wall**
 * reading taken when the request was made. The snapshot's `positionSampledAt`
 * is also wall clock, and also the only value both processes can date the same
 * way.
 */
const request = (ms, atMs) => ({ ms, atMs })
const sampledAt = (atMs) => ({ playing: true, paused: false, positionMs: 0, durationMs: 0, positionSampledAt: atMs })

test('no request means nothing to latch', () => {
  assert.deepEqual(resolveSeek(null, sampledAt(9_000), 10_000), { pending: null, ms: null })
  assert.deepEqual(resolveSeek(undefined, sampledAt(9_000), 10_000), { pending: null, ms: null })
})

test('a snapshot sampled at or after the request releases the latch', () => {
  // The host stamps `positionSampledAt` when it applies the seek, so a stamp at
  // or after our request time proves it saw it.
  assert.deepEqual(resolveSeek(request(60_000, 10_000), sampledAt(10_000), 10_050), { pending: null, ms: null })
  assert.deepEqual(resolveSeek(request(60_000, 10_000), sampledAt(10_400), 10_500), { pending: null, ms: null })
})

test('a snapshot sampled before the request is stale, so the request still paints', () => {
  // This is the 1 Hz snapshot that was already in flight when the user let go.
  const pending = request(60_000, 10_000)
  assert.deepEqual(resolveSeek(pending, sampledAt(9_200), 10_050), { pending, ms: 60_000 })
})

test('a host that has not sampled at all does not release the latch', () => {
  // `positionSampledAt` stays 0 until the host's first poll lands.
  const pending = request(60_000, 10_000)
  assert.deepEqual(resolveSeek(pending, sampledAt(0), 10_050), { pending, ms: 60_000 })
})

test('an undatable request is dropped instead of latching on nothing', () => {
  assert.deepEqual(resolveSeek(request(60_000, 0), sampledAt(9_200), 10_050), { pending: null, ms: null })
})

test('a request the wall clock has run backwards past is dropped, not honoured forever', () => {
  // Suspend/resume or an NTP step: the request can no longer be dated against
  // the host's stamps. Freezing the bar is worse than one stale frame.
  assert.deepEqual(resolveSeek(request(60_000, 10_000), sampledAt(9_200), 8_000), { pending: null, ms: null })
})

test('a latched position is never negative', () => {
  assert.deepEqual(resolveSeek(request(-500, 10_000), sampledAt(9_200), 10_050), {
    pending: request(-500, 10_000),
    ms: 0,
  })
})

/* ── one seek in flight at a time ───────────────────────────────────────── */

/**
 * The latch in `resolveSeek` compares wall stamps, and the host stamps *when it
 * applies* a seek. Two seeks in flight at once therefore break it: the first
 * one's stamp is newer than the second request, so the latch lets go on the
 * older position and the bar steps back for one poll. Serialising the requests
 * is what keeps "a stamp at or after my request" true — hence this tiny queue.
 * See `docs/DECISIONS.md` D-36.
 */
test('a second seek waits for the first to land, then goes out by itself', () => {
  const first = planSeek(idleSeek(), 30_000)
  assert.equal(first.send, 30_000, 'an idle queue sends at once')
  assert.deepEqual(first.state, { inFlight: true, queued: null })

  const second = planSeek(first.state, 31_000)
  assert.equal(second.send, null, 'nothing else goes out while one seek is in flight')
  assert.deepEqual(second.state, { inFlight: true, queued: 31_000 })

  const landed = settleSeek(second.state)
  assert.equal(landed.send, 31_000, 'the queued target is sent as soon as the first lands')
  assert.deepEqual(landed.state, { inFlight: true, queued: null })

  const done = settleSeek(landed.state)
  assert.equal(done.send, null)
  assert.deepEqual(done.state, idleSeek())
})

test('the queue keeps only the newest target', () => {
  let state = planSeek(idleSeek(), 30_000).state
  state = planSeek(state, 31_000).state
  state = planSeek(state, 32_000).state
  assert.deepEqual(state, { inFlight: true, queued: 32_000 }, 'three presses while in flight = one seek')
})

test('a queued target is never reordered against the one in flight', () => {
  // The interesting failure was not "dropped" but "applied out of order": the
  // queued seek must go out after the first lands, never before.
  const first = planSeek(idleSeek(), 60_000)
  const second = planSeek(first.state, 61_000)
  assert.equal(second.send, null)
  assert.equal(settleSeek(second.state).send, 61_000)
})

test('a missing or negative target is clamped, not queued as garbage', () => {
  assert.equal(planSeek(idleSeek(), Number.NaN).send, 0)
  assert.equal(planSeek(idleSeek(), -500).send, 0)
  const queued = planSeek(planSeek(idleSeek(), 1_000).state, undefined).state
  assert.equal(queued.queued, 0)
})

