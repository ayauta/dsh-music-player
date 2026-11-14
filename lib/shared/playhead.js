/**
 * Playhead arithmetic — pure, dependency-free, and the only place that reads
 * "a position the host sampled once per second" as "where the playhead is now".
 *
 * `client.js` carries a copy between its `BEGIN inlined lib/shared/playhead.js` /
 * `END …` markers, written by `node scripts/inline-playhead.mjs --write` and
 * checked by `test/inline-playhead.test.mjs`. Edit here; never edit the copy.
 *
 * Two clocks, two questions — the split is the point of this file:
 *
 *  - **How much time has passed?** The caller's *monotonic* clock
 *    (`performance.now()`), anchored when the snapshot landed. Wall readings jump
 *    on NTP steps and suspend/resume, and a jumped clock used for interpolation
 *    shows up as the bar leaping. Neither function here reads a clock; both take
 *    the reading as a parameter, which is also how the tests fix time.
 *  - **Did the host see my seek yet?** The *wall* clock. The host stamps
 *    `positionSampledAt` with `Date.now()`, so comparing it against the wall
 *    reading taken when the seek was requested is the only cross-process
 *    comparison available. A snapshot stamped *before* the request is the 1 Hz
 *    one already in flight — stale, and painting it is what made the bar snap
 *    back after a seek.
 *
 * Both ends of the position are clamped. Upper: never past the duration. Lower:
 * never below zero — an anchor later than `now` is clock skew, not a rewind
 * (Home Assistant's `getCurrentProgress` clamps it for the same reason).
 *
 * Precedent: media-chrome `range-animation.ts` (interpolation in its own unit,
 * monotonic clock), video.js 10 `TimeCore` (seek state owned by the state layer,
 * no duration threshold), Home Assistant's exported `getCurrentProgress`.
 * See `docs/research/2026-11-13-playhead-architecture.md`.
 */

/**
 * Is the host's position advancing right now?
 *
 * Both flags must be present: the host always publishes `paused` as a real
 * boolean, so an absent flag means a malformed snapshot, and inventing motion
 * from one is worse than holding still.
 */
export function isAdvancing(player) {
  return player !== null && player !== undefined && player.playing === true && player.paused === false
}

/**
 * Freeze a host snapshot onto the caller's monotonic clock.
 *
 * The host's own `positionSampledAt` is deliberately dropped here: it is a wall
 * reading, and using it to interpolate is what makes the playhead jump when the
 * wall clock does. It is still needed — for the seek latch, which is why
 * `resolveSeek` takes it separately.
 *
 * @param {object|null|undefined} player host snapshot: `positionMs`, `durationMs`, `playing`, `paused`
 * @param {number} receivedAtMs monotonic reading taken when this snapshot landed
 * @returns {{ positionMs: number, anchorMs: number, durationMs: number, advancing: boolean }|null}
 */
export function anchorOf(player, receivedAtMs) {
  if (player === null || player === undefined) return null
  return {
    positionMs: finiteOr(player.positionMs, 0),
    anchorMs: finiteOr(receivedAtMs, 0),
    durationMs: finiteOr(player.durationMs, 0),
    advancing: isAdvancing(player),
    // The host's own stamp, kept only as the sample's identity: two reads with
    // the same `sampleMs` and position are the same sample, and re-anchoring one
    // of them is what makes the bar rewind. See `nextAnchor`.
    sampleMs: finiteOr(player.positionSampledAt, 0),
  }
}

/**
 * Decide the anchor to keep after another read of the player.
 *
 * The client re-reads `status` far more often than the host samples: once a
 * second by poll, and again after every command. Those extra reads carry the
 * sample it already has, and re-dating them restarts interpolation from the same
 * position — the bar jumps back and creeps forward again. So the anchor is
 * reused while the sample is unchanged, and replaced when a genuinely new sample
 * (or a transport change) arrives.
 *
 * @param {object|null|undefined} previous the anchor in use
 * @param {object|null|undefined} player the player as just read
 * @param {number} receivedAtMs monotonic reading taken now
 * @returns {object|null} the anchor to use, possibly `previous` itself
 */
export function nextAnchor(previous, player, receivedAtMs) {
  const fresh = anchorOf(player, receivedAtMs)
  if (fresh === null) return null
  if (previous === null || previous === undefined) return fresh
  const sameSample = previous.sampleMs === fresh.sampleMs
    && previous.positionMs === fresh.positionMs
    && previous.durationMs === fresh.durationMs
    && previous.advancing === fresh.advancing
  return sameSample ? previous : fresh
}

/**
 * Where the playhead is at `nowMs`.
 * @param {object|null} anchor from `anchorOf`
 * @param {number} nowMs monotonic reading
 * @returns {number} milliseconds, within `0 .. durationMs` when the duration is known
 */
export function positionOf(anchor, nowMs) {
  if (anchor === null || anchor === undefined) return 0
  const base = finiteOr(anchor.positionMs, 0)
  const anchorMs = finiteOr(anchor.anchorMs, 0)
  // No anchor reading means no way to date the sample: advancing from 0 would
  // invent a position.
  const advance = anchor.advancing === true && anchorMs > 0 && Number.isFinite(nowMs)
    ? Math.max(0, nowMs - anchorMs)
    : 0
  const value = Math.max(0, base + advance)
  const duration = finiteOr(anchor.durationMs, 0)
  return duration > 0 ? Math.min(value, duration) : value
}

/**
 * The playhead as a 0..1 fraction, for progress bars and `aria-valuenow`.
 */
export function fractionOf(anchor, nowMs) {
  const duration = finiteOr(anchor?.durationMs, 0)
  if (!(duration > 0)) return 0
  return clamp01(positionOf(anchor, nowMs) / duration)
}

/**
 * Time left in the track, for the `−3:21` readout. Zero when the duration is unknown.
 */
export function remainingOf(anchor, nowMs) {
  const duration = finiteOr(anchor?.durationMs, 0)
  if (!(duration > 0)) return 0
  return Math.max(0, duration - positionOf(anchor, nowMs))
}

/**
 * What this frame should write to the DOM — and whether it should write at all.
 *
 * A paused playhead does not move, but the paint loop still runs sixty times a
 * second. Assigning the fill's `--p` and the bubble's text unconditionally
 * invalidates style and layout on every one of those frames, and the two things
 * `--p` drives (`left: calc(...)` on the thumb, `scaleX(...)` on the fill)
 * re-round each time: at rest that is a visible ~1 px shimmer. The two time
 * readouts never had this problem because they already skip unchanged values.
 *
 * The fraction is rounded to 1e-5 — roughly a hundredth of a pixel on a wide
 * bar — so sub-pixel noise can never be mistaken for movement.
 *
 * @param {{ fraction: number, label: string }|null|undefined} previous the values last written
 * @param {{ fraction: number, label: string }} next this frame's values
 * @returns {{ write: boolean, fraction: number, label: string }}
 */
export function nextPaint(previous, next) {
  const raw = finiteOr(next?.fraction, 0)
  const fraction = Math.round(clamp01(raw) * 1e5) / 1e5
  const label = typeof next?.label === 'string' ? next.label : ''
  const unchanged = previous !== null && previous !== undefined
    && previous.fraction === fraction
    && previous.label === label
  return { write: !unchanged, fraction, label }
}

/**
 * The seek latch: which position should the bar paint right now?
 *
 * Replaces the old "1600ms and at least 900ms away" pair. Both were proxies for
 * the real question — *is this snapshot older than my request?* — and the 900ms
 * one could release the latch early on the very snapshot it was meant to hide.
 *
 * @param {{ ms: number, atMs: number }|null|undefined} pending the request: target position and the wall reading taken when it was made
 * @param {object|null|undefined} player the newest host snapshot (`positionSampledAt`, wall clock; 0 when never sampled)
 * @param {number} wallNowMs the wall reading taken now
 * @returns {{ pending: object|null, ms: number|null }} `ms` is the position to paint while latched, `null` to trust the host
 */
export function resolveSeek(pending, player, wallNowMs) {
  if (pending === null || pending === undefined) return { pending: null, ms: null }
  const requestedAt = finiteOr(pending.atMs, 0)
  const sampledAt = finiteOr(player?.positionSampledAt, 0)
  // An undatable request cannot be argued for: do not latch on a timestamp we
  // do not have.
  if (requestedAt <= 0) return { pending: null, ms: null }
  // The host stamps when it *applies* the seek, so a stamp at or after our
  // request proves it has seen it. Anything earlier is the in-flight snapshot,
  // and a snapshot that does not exist yet (0) proves nothing at all.
  if (sampledAt >= requestedAt) return { pending: null, ms: null }
  // The wall clock ran backwards (suspend/resume, NTP): the request can no longer
  // be dated against the host's stamps. Freezing the bar is worse than one frame
  // of stale position, so let go.
  if (requestedAt > finiteOr(wallNowMs, 0)) return { pending: null, ms: null }
  return { pending, ms: Math.max(0, finiteOr(pending.ms, 0)) }
}

/**
 * The seek queue: one request in flight at a time.
 *
 * `resolveSeek` decides the latch by comparing wall stamps, and the host stamps
 * `positionSampledAt` **when it applies** a seek. That works for one request;
 * with two in flight it breaks in a way that looks like a different bug: press
 * `→` twice, and the *first* seek's stamp is newer than the *second* request, so
 * the second latch lets go on the older position and the bar steps back for one
 * poll. (Measured in the prototype: three fast presses moved the bar by two
 * steps, and one of the three was swallowed.)
 *
 * The fix is ordering, not thresholds: keep at most one request in flight, and
 * let the newest target overwrite whatever is queued behind it. Then "a stamp at
 * or after my request" is true again for every request that is actually in
 * flight, which is the only assumption `resolveSeek` ever made.
 *
 * @param {{ inFlight: boolean, queued: number|null }|null|undefined} state
 * @param {number} requestMs target position for this request
 * @returns {{ send: number|null, state: { inFlight: boolean, queued: number|null } }}
 */
export function planSeek(state, requestMs) {
  const target = Math.max(0, finiteOr(requestMs, 0))
  if (state !== null && state !== undefined && state.inFlight === true) {
    return { send: null, state: { inFlight: true, queued: target } }
  }
  return { send: target, state: { inFlight: true, queued: null } }
}

/**
 * The in-flight request landed: send the newest queued target, or go idle.
 * @param {{ inFlight: boolean, queued: number|null }|null|undefined} state
 * @returns {{ send: number|null, state: { inFlight: boolean, queued: number|null } }}
 */
export function settleSeek(state) {
  const queued = state !== null && state !== undefined && Number.isFinite(state.queued)
    ? Math.max(0, state.queued)
    : null
  if (queued === null) return { send: null, state: idleSeek() }
  return { send: queued, state: { inFlight: true, queued: null } }
}

/** A queue with nothing in flight and nothing waiting. */
export function idleSeek() {
  return { inFlight: false, queued: null }
}

/**
 * Should this status answer be applied at all?
 *
 * The client asks for `status` from two places — the 1 Hz poll and the refresh
 * after every command — and nothing orders the answers. A command sits on an
 * `await` for a couple of hundred milliseconds (fade, mpv confirmation), so a
 * poll issued before the click can be served and returned after the refresh that
 * carries the result. Applying it re-anchors the playhead on an older position
 * *and* flips `advancing` back on: the bar rips backwards, then forward again on
 * the next poll.
 *
 * Requests are numbered when they are **issued**, so ordering needs no clock and
 * cannot be inverted by a wall-clock jump or a host restart — unlike the host's
 * `uptimeMs`, which resets whenever the process does.
 *
 * @param {number} lastAppliedId request number of the answer already on screen (0 for none)
 * @param {number} responseId request number this answer belongs to
 * @returns {boolean} whether to apply it
 */
export function acceptResponse(lastAppliedId, responseId) {
  if (!Number.isFinite(responseId)) return false
  return responseId > finiteOr(lastAppliedId, 0)
}

/** A non-number (missing field, `NaN` from a half-written snapshot) falls back. */
function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback
}

function clamp01(value) {
  if (value < 0) return 0
  return value > 1 ? 1 : value
}
