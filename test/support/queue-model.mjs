/**
 * Reference model for the queue / transport, and the driver that plays random
 * command sequences against a real `createPlayer`.
 *
 * The model is written from the approved rules (DESIGN R13 / R07.c, DECISIONS
 * D-14..D-17), **not** from `player.js`: it never imports `lib/host`, and it
 * does not call the production `normalize()` / `commit()` helpers to predict
 * what they will do. If the model and the player disagree, the player is not
 * automatically right.
 *
 * Two kinds of run:
 *   - `exact`  — modes without randomness (sequence / all / one). Every stable
 *                transition must match the model field for field.
 *   - shuffle  — the permutation is intentionally unpredictable, so only the
 *                invariants and the shuffle contract (same entries, same
 *                current slot) are checked.
 */
import { createPlayerHarness } from './player-harness.mjs'

/* ── fixtures ─────────────────────────────────────────────── */

export const TRACKS = [
  { id: 'a', durationMs: 8000 },
  { id: 'b', durationMs: 3000 },
  { id: 'c', durationMs: 3000 },
  { id: 'd', durationMs: 3000 },
  { id: 'e', durationMs: 1000 },
  { id: 'm', durationMs: 2000, missing: true },
]
const ALL_IDS = TRACKS.map((t) => t.id)
const USABLE = TRACKS.filter((t) => !t.missing).map((t) => t.id)
const DURATION = new Map(TRACKS.map((t) => [t.id, t.durationMs]))
const dedupe = (ids) => [...new Set(ids.filter((id) => USABLE.includes(id)))]

export const MODES = ['sequence', 'all', 'one', 'shuffle']

/* ── command space ────────────────────────────────────────── */

/**
 * @param {typeof import('fast-check')} fc
 * @param {{ shuffle?: boolean }} [options]
 */
export function createCommandArbitraries(fc, { shuffle = false } = {}) {
  const ids = fc.array(fc.constantFrom(...ALL_IDS), { maxLength: 4 })
  const index = fc.nat({ max: 5 })
  const modes = shuffle
    ? ['sequence', 'all', 'one', 'shuffle']
    : ['sequence', 'all', 'one']

  return fc.oneof(
    { weight: 8, arbitrary: fc.record({ kind: fc.constant('play'), ids, startIndex: index }) },
    { weight: 3, arbitrary: fc.record({ kind: fc.constant('pause') }) },
    { weight: 3, arbitrary: fc.record({ kind: fc.constant('resume') }) },
    { weight: 5, arbitrary: fc.record({ kind: fc.constant('next') }) },
    { weight: 3, arbitrary: fc.record({ kind: fc.constant('prev') }) },
    { weight: 3, arbitrary: fc.record({ kind: fc.constant('seek'), ms: fc.nat({ max: 9000 }) }) },
    { weight: 4, arbitrary: fc.record({ kind: fc.constant('eof') }) },
    { weight: 4, arbitrary: fc.record({ kind: fc.constant('setMode'), mode: fc.constantFrom(...modes) }) },
    { weight: 6, arbitrary: fc.record({ kind: fc.constant('enqueueNext'), ids }) },
    { weight: 5, arbitrary: fc.record({ kind: fc.constant('enqueueEnd'), ids }) },
    { weight: 4, arbitrary: fc.record({ kind: fc.constant('move'), from: index, to: index }) },
    { weight: 4, arbitrary: fc.record({ kind: fc.constant('remove'), index }) },
    { weight: 4, arbitrary: fc.record({ kind: fc.constant('jump'), id: fc.constantFrom(...ALL_IDS, '', 'zz') }) },
    { weight: 3, arbitrary: fc.record({ kind: fc.constant('setQueue'), ids }) },
    { weight: 2, arbitrary: fc.record({ kind: fc.constant('clear') }) },
    { weight: 2, arbitrary: fc.record({ kind: fc.constant('bogus') }) },
  )
}

/* ── reference model ──────────────────────────────────────── */

export const initialModel = () => ({
  queue: [],
  cursor: -1,
  mode: 'all',
  paused: false,
  positionMs: 0,
  loaded: false,
  duration: 0,
})

const currentOf = (m) => (m.cursor >= 0 ? m.queue[m.cursor] : null)
const seedDuration = (m) => {
  const id = currentOf(m)
  if (id !== null) m.duration = DURATION.get(id) ?? m.duration
}
/** A sequence run that reached its end: no file, playhead parked on the duration. */
const finished = (m) => !m.loaded && m.duration > 0 && m.positionMs >= m.duration

/** Apply one command to the model. Must not consult the player. */
export function applyModel(m, cmd) {
  switch (cmd.kind) {
    case 'play': {
      const list = dedupe(cmd.ids)
      const wanted = cmd.ids[cmd.startIndex] ?? cmd.ids[0] ?? null
      const picked = list.length === 0 ? null : (list.includes(wanted) ? wanted : list[0])
      m.queue = list
      m.cursor = picked === null ? -1 : list.indexOf(picked)
      if (picked !== null) m.paused = false // loading a file unpauses; an empty play does not
      m.positionMs = 0
      m.loaded = picked !== null
      break
    }
    case 'pause': m.paused = true; break
    case 'resume': {
      if (m.queue.length === 0) break
      if (finished(m)) { m.cursor = 0; m.positionMs = 0; m.loaded = true; m.paused = false; break }
      if (m.cursor < 0) m.cursor = 0
      m.paused = false
      m.loaded = true
      break
    }
    case 'next': {
      if (m.queue.length === 0) break
      if (m.cursor < m.queue.length - 1) { m.cursor += 1; m.positionMs = 0; m.loaded = true; m.paused = false; break }
      if (m.mode === 'all' || m.mode === 'one') { m.cursor = 0; m.positionMs = 0; m.loaded = true; m.paused = false; break }
      m.paused = true // sequence: next at the end pauses
      break
    }
    case 'prev': {
      if (m.queue.length === 0) break
      if (m.positionMs > 3000) { m.positionMs = 0; break }
      if (m.cursor > 0) { m.cursor -= 1; m.positionMs = 0; m.loaded = true; m.paused = false; break }
      if (m.mode === 'all' && m.queue.length > 1) { m.cursor = m.queue.length - 1; m.positionMs = 0; m.loaded = true; m.paused = false; break }
      m.positionMs = 0
      break
    }
    case 'seek': m.positionMs = Math.max(0, Math.min(cmd.ms, m.duration || cmd.ms)); break
    case 'eof': {
      // A paused or idle player cannot reach end-of-file.
      if (m.queue.length === 0 || m.cursor < 0 || m.paused || !m.loaded) break
      if (m.mode === 'one') { m.positionMs = 0; m.loaded = true; break }
      if (m.cursor < m.queue.length - 1) { m.cursor += 1; m.positionMs = 0; m.loaded = true; break }
      if (m.mode === 'all') { m.cursor = 0; m.positionMs = 0; m.loaded = true; break }
      m.paused = false
      m.loaded = false
      m.positionMs = DURATION.get(m.queue[m.cursor]) ?? 0
      break
    }
    case 'setMode': m.mode = cmd.mode; break
    case 'enqueueNext': {
      const incoming = dedupe(cmd.ids)
      if (incoming.length === 0) break
      const keep = currentOf(m)
      const movable = incoming.filter((id) => id !== keep)
      if (movable.length === 0) break
      m.queue = m.queue.filter((id) => !movable.includes(id))
      if (keep !== null) m.cursor = m.queue.indexOf(keep)
      m.queue.splice(Math.max(0, m.cursor + 1), 0, ...movable)
      if (keep !== null) m.cursor = m.queue.indexOf(keep)
      if (m.cursor < 0) m.positionMs = 0 // a stopped player re-mirrors, which clears the position
      break
    }
    case 'enqueueEnd': {
      const fresh = dedupe(cmd.ids).filter((id) => !m.queue.includes(id))
      if (fresh.length === 0) break
      m.queue.push(...fresh)
      if (m.cursor < 0) m.positionMs = 0
      break
    }
    case 'move': {
      if (cmd.from === cmd.to) break
      if (cmd.from >= m.queue.length || cmd.to >= m.queue.length) break
      const keep = currentOf(m)
      const [item] = m.queue.splice(cmd.from, 1)
      m.queue.splice(cmd.to, 0, item)
      m.cursor = keep === null ? m.cursor : m.queue.indexOf(keep)
      if (m.cursor < 0) m.positionMs = 0
      break
    }
    case 'remove': {
      if (cmd.index >= m.queue.length) break
      const keep = currentOf(m)
      const wasCurrent = cmd.index === m.cursor
      m.queue.splice(cmd.index, 1)
      if (!wasCurrent) { m.cursor = keep === null ? m.cursor : m.queue.indexOf(keep); break }
      if (m.queue.length === 0) { m.cursor = -1; m.loaded = false; m.positionMs = 0; break }
      if (cmd.index < m.queue.length) { m.cursor = cmd.index; m.positionMs = 0; m.loaded = true; break }
      m.cursor = -1; m.loaded = false; m.positionMs = 0
      break
    }
    case 'jump': {
      if (typeof cmd.id !== 'string' || !m.queue.includes(cmd.id)) break
      m.cursor = m.queue.indexOf(cmd.id)
      m.positionMs = 0
      m.paused = false
      m.loaded = true
      break
    }
    case 'setQueue': {
      const keep = currentOf(m)
      m.queue = dedupe(cmd.ids)
      if (m.queue.length === 0) { m.cursor = -1; m.loaded = false; m.positionMs = 0; break }
      if (keep !== null && m.queue.includes(keep)) { m.cursor = m.queue.indexOf(keep); break }
      if (m.loaded) { m.cursor = 0; m.positionMs = 0; break }
      m.cursor = -1
      break
    }
    case 'clear': {
      // `stop` clears the file but leaves mpv's own `pause` property alone.
      m.queue = []; m.cursor = -1; m.loaded = false; m.positionMs = 0; m.duration = 0
      break
    }
    default: break
  }
  if (['play', 'next', 'prev', 'jump', 'remove', 'setQueue', 'resume', 'eof'].includes(cmd.kind)) seedDuration(m)
}

/* ── driving the player ───────────────────────────────────── */

const tick = () => new Promise((done) => setTimeout(done, 0))

/** Replay one command against the player. `eof` imitates mpv's own event order. */
export async function applyCommand(h, cmd) {
  const player = h.player
  switch (cmd.kind) {
    case 'play': await player.playQueue(cmd.ids, cmd.startIndex); break
    case 'pause': await player.pause(); break
    case 'resume': await player.resume(); break
    case 'next': await player.next(false); break
    case 'prev': await player.prev(); break
    case 'seek': await player.seek(cmd.ms); break
    case 'eof': {
      if (h.snap().paused || h.engine.state.currentFile === null) break
      const at = h.engine.state.playlistPos
      const count = h.engine.state.playlistCount
      if (at + 1 < count) {
        h.engine.emit({ type: 'endFile', reason: 'eof' })
        h.engine.advance()
        h.engine.emit({ type: 'pos', value: h.engine.state.playlistPos })
        h.engine.emit({ type: 'fileLoaded' })
      } else {
        h.engine.state.idleActive = true
        h.engine.state.currentFile = null
        h.engine.emit({ type: 'endFile', reason: 'eof' })
      }
      await tick()
      break
    }
    case 'setMode': await player.setMode(cmd.mode); break
    case 'enqueueNext': await player.enqueue(cmd.ids, 'next'); break
    case 'enqueueEnd': await player.enqueue(cmd.ids, 'end'); break
    case 'move': await player.move(cmd.from, cmd.to); break
    case 'remove': await player.removeAt(cmd.index); break
    case 'jump': await player.jumpToTrack(cmd.id); break
    case 'setQueue': await player.setQueue(cmd.ids); break
    case 'clear': await player.clear(); break
    case 'bogus': {
      // Calls that must be refused without touching the queue.
      await player.removeAt(99)
      await player.move(-1, 99)
      await player.enqueue([], 'end')
      await player.jumpToTrack('zz')
      await player.jumpToTrack('')
      await player.setVolume(50)
      break
    }
    default: break
  }
}

/* ── invariants ───────────────────────────────────────────── */

/** Everything that must hold after every settled transition. */
export function checkInvariants(snap, pathOf, cmd) {
  const where = cmd.kind
  const queue = snap.queue
  if (new Set(queue).size !== queue.length) throw new Error(`queue holds duplicate ids after ${where}: ${JSON.stringify(queue)}`)
  for (const id of queue) if (!USABLE.includes(id)) throw new Error(`queue holds an unusable id after ${where}: ${id}`)
  if (snap.cursor < -1 || snap.cursor >= queue.length) throw new Error(`cursor ${snap.cursor} out of range after ${where} (length ${queue.length})`)
  if (!MODES.includes(snap.mode)) throw new Error(`unknown mode ${snap.mode}`)

  if (snap.cursor === -1) {
    if (snap.trackId !== null) throw new Error(`cursor -1 but trackId ${snap.trackId} after ${where}`)
    if (snap.engineFile !== null) throw new Error(`cursor -1 but the engine holds a file after ${where}`)
  } else {
    if (snap.trackId !== queue[snap.cursor]) {
      throw new Error(`trackId ${snap.trackId} != queue[cursor=${snap.cursor}]=${queue[snap.cursor]} after ${where}`)
    }
    if (snap.engineFile !== null && snap.engineFile !== pathOf(snap.trackId)) {
      throw new Error(`engine plays ${snap.engineFile} while the current track is ${pathOf(snap.trackId)} after ${where}`)
    }
  }
}

/** Shuffle must keep the same entries and keep the current slot where it is. */
export function checkShuffleContract(before, after, cmd) {
  if (cmd.kind !== 'setMode' || cmd.mode !== 'shuffle' || before.mode === 'shuffle') return
  const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())
  if (!same(before.queue, after.queue)) throw new Error(`shuffle changed the queue contents (${JSON.stringify(before.queue)} -> ${JSON.stringify(after.queue)})`)
  if (before.cursor !== after.cursor) throw new Error(`shuffle moved the cursor from ${before.cursor} to ${after.cursor}`)
  if (before.cursor >= 0 && before.queue[before.cursor] !== after.queue[after.cursor]) {
    throw new Error('shuffle replaced the entry playing at the cursor')
  }
}

/* ── one sequence ─────────────────────────────────────────── */

/**
 * Play `commands` against a fresh player and compare with the model after each
 * step. Throws an Error carrying the step, the first violated rule and both
 * states, so the caller can print something replayable.
 *
 * @param {Array} commands
 * @param {{ exact?: boolean }} [options]
 */
export async function runSequence(commands, { exact = true } = {}) {
  const model = initialModel()
  // Shuffle is the only source of randomness; a fixed stream makes a seed
  // replay the same logical run.
  let seed = 0x9e3779b9
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 0x100000000
  }
  const h = await createPlayerHarness(undefined, { tracks: TRACKS, random })
  try {
    for (let index = 0; index < commands.length; index += 1) {
      const cmd = commands[index]
      const before = h.snap()
      applyModel(model, cmd)
      await applyCommand(h, cmd)
      const after = h.snap()
      try {
        checkInvariants(after, h.pathOf, cmd)
        checkShuffleContract(before, after, cmd)
        if (exact) {
          if (JSON.stringify(after.queue) !== JSON.stringify(model.queue)) {
            throw new Error(`queue ${JSON.stringify(after.queue)} != model ${JSON.stringify(model.queue)}`)
          }
          if (after.cursor !== model.cursor) throw new Error(`cursor ${after.cursor} != model ${model.cursor}`)
          if (after.mode !== model.mode) throw new Error(`mode ${after.mode} != model ${model.mode}`)
          if (after.paused !== model.paused) throw new Error(`paused ${after.paused} != model ${model.paused}`)
        }
      } catch (error) {
        const failure = new Error(
          `step ${index + 1}/${commands.length} (${cmd.kind}): ${error.message}\n` +
          `  command : ${JSON.stringify(cmd)}\n` +
          `  model   : ${JSON.stringify({ queue: model.queue, cursor: model.cursor, mode: model.mode, paused: model.paused, positionMs: model.positionMs })}\n` +
          `  player  : ${JSON.stringify({ queue: after.queue, cursor: after.cursor, mode: after.mode, paused: after.paused, trackId: after.trackId, engineFile: after.engineFile ? 'set' : null })}\n` +
          `  trace   : ${JSON.stringify(commands.slice(0, index + 1))}`,
        )
        failure.commands = commands
        failure.step = index
        throw failure
      }
    }
  } finally {
    await h.dispose()
  }
}

/**
 * The player samples position once a second from a wall clock. That timer is not
 * part of the state machine, so the model runs freeze it and restore on exit.
 */
export function freezePositionPolling() {
  const original = globalThis.setInterval
  globalThis.setInterval = () => 0
  return () => { globalThis.setInterval = original }
}
