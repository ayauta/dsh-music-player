#!/usr/bin/env node
/**
 * Stress tier for the model-based queue regression.
 *
 *   npm run test:stress                      # 1000 seeds x up to 100 commands
 *   npm run test:stress -- --runs 10000      # the long sweep, run on purpose
 *   npm run test:stress -- --seed 12345      # replay a reported seed
 *   npm run test:stress -- --replay '[...]'  # replay the shrunk counterexample
 *
 * Same model, same seed, same commands ⇒ same result. Runs against the fake
 * engine through `test/support/player-harness.mjs`: no mpv, no user queue, no
 * database, no wall clock.
 */
import { readFileSync } from 'node:fs'
import fc from 'fast-check'

import {
  createCommandArbitraries,
  freezePositionPolling,
  runSequence,
} from '../test/support/queue-model.mjs'

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (!arg.startsWith('--')) continue
    const [key, inline] = arg.slice(2).split('=')
    out[key] = inline ?? argv[i + 1]
    if (inline === undefined) i += 1
  }
  return out
}

const args = parseArgs(process.argv.slice(2))
const runs = Number(args.runs ?? 1000)
const minLength = Number(args['min-length'] ?? 60)
const maxLength = Number(args['max-length'] ?? 100)
const seed = Number(args.seed ?? 20261106)
const suite = args.suite ?? 'both'
const replay = args.replay === undefined
  ? null
  : JSON.parse(String(args.replay).startsWith('@') ? readFileSync(String(args.replay).slice(1), 'utf8') : String(args.replay))

const restore = freezePositionPolling()
const started = Date.now()
let commandsRun = 0
let failures = 0

/** Does this exact sequence still fail? Used by the minimizer and by --replay. */
async function fails(commands, options) {
  try {
    await runSequence(commands, options)
    return null
  } catch (error) {
    return error
  }
}

/**
 * The identity of a failure: the violated rule without step numbers. Shrinking
 * must keep this, otherwise a candidate could "fail" for an unrelated reason
 * and the reported trace would no longer reproduce the original problem.
 */
function failureSignature(error) {
  if (error === null || error === undefined) return null
  const first = String(error.message ?? '').split('\n')[0]
  return first.replace(/^step \d+\/\d+ \([a-zA-Z]+\): /, '')
}

/**
 * A deterministic pass on top of fast-check: drop a command while the same
 * failure survives. The result is a shorter counterexample, not a proven
 * global minimum.
 */
async function minimize(commands, options, budgetMs = 20000) {
  const deadline = Date.now() + budgetMs
  const original = await fails(commands, options)
  const signature = failureSignature(original)
  let current = commands
  let changed = true
  while (changed && Date.now() < deadline) {
    changed = false
    for (let i = current.length - 1; i >= 0 && Date.now() < deadline; i -= 1) {
      const candidate = current.slice(0, i).concat(current.slice(i + 1))
      if (candidate.length === 0) continue
      if (failureSignature(await fails(candidate, options)) === signature) { current = candidate; changed = true }
    }
  }
  return current
}

async function sweep(name, { exact, shuffle }) {
  if (suite !== 'both' && suite !== name) return
  const arbitrary = createCommandArbitraries(fc, { shuffle })
  let lastFailure = null
  let executed = 0
  const outcome = await fc.check(
    fc.asyncProperty(fc.array(arbitrary, { minLength, maxLength }), async (commands) => {
      executed += commands.length
      try {
        await runSequence(commands, { exact })
      } catch (error) {
        lastFailure = error
        throw error
      }
    }),
    { numRuns: runs, seed, endOnFailure: true },
  )
  commandsRun += executed

  if (outcome.failed === true) {
    failures += 1
    const shrunk = outcome.counterexample?.[0]
    const originalSignature = failureSignature(lastFailure)
    const candidate = await minimize(shrunk ?? [], { exact })
    const minimalError = await fails(candidate, { exact })
    // Keep the original counterexample if the shorter one broke something else.
    const minimal = failureSignature(minimalError) === originalSignature ? candidate : (shrunk ?? [])
    const reported = await fails(minimal, { exact })
    console.log(`FAIL  ${name}: ${runs} runs, ${executed} commands`)
    console.log(`  seed        : ${seed}`)
    console.log(`  suite       : ${name}${shuffle ? ' (invariants only)' : ' (exact model)'}`)
    console.log(`  first rule  : ${String(reported?.message ?? lastFailure?.message ?? '').split('\n')[0]}`)
    console.log(`  details     : ${String(reported?.message ?? '').split('\n').slice(1).join('\n                ')}`)
    console.log(`  fast-check  : ${outcome.numShrinks ?? '?'} shrinks → ${shrunk?.length ?? 0} commands`)
    console.log(`  reduced     : ${minimal.length} commands (same rule, not proven minimal)`)
    console.log(`  trace       : ${JSON.stringify(minimal)}`)
    console.log(`  replay seed : npm run test:stress -- --suite ${name} --seed ${seed} --runs ${runs} --max-length ${maxLength}`)
    console.log(`  replay trace: npm run test:stress -- --suite ${name} --replay '${JSON.stringify(minimal)}'`)
  } else {
    console.log(`PASS  ${name}: ${runs} runs, ${executed} commands`)
  }
}

try {
  if (replay !== null) {
    // A recorded counterexample: run exactly this sequence, no shrinking.
    await runSequence(replay, { exact: suite !== 'shuffle' })
      .then(() => console.log(`PASS  replay: ${replay.length} commands`))
      .catch((error) => {
        failures += 1
        console.log(`FAIL  replay: ${replay.length} commands`)
        console.log(String(error.message))
        process.exitCode = 1
      })
  } else {
    await sweep('exact', { exact: true, shuffle: false })
    await sweep('shuffle', { exact: false, shuffle: true })
  }
} catch (error) {
  failures += 1
  console.log(`CRASH ${error.message}`)
} finally {
  restore()
}

const elapsed = Date.now() - started
console.log(`\n${failures === 0 ? 'STRESS PASSED' : 'STRESS FAILED'} · ${commandsRun} commands · ${elapsed}ms`)
if (failures !== 0) process.exitCode = 1
