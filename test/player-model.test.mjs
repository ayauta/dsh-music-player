/**
 * Model-based regression for the queue / transport state machine.
 *
 * Daily tier: fixed seed, small run count — `npm test` stays fast and a failure
 * is always the same failure. The heavy sweep is `npm run test:stress`, which
 * runs the same model with more seeds; `--seed` replays a reported failure.
 *
 * The model itself lives in `test/support/queue-model.mjs` and is written from
 * the approved rules, not from `player.js`.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fc from 'fast-check'

import {
  createCommandArbitraries,
  freezePositionPolling,
  runSequence,
} from './support/queue-model.mjs'

const SEED = 20261106
const RUNS = 20
const MIN_LENGTH = 8
const MAX_LENGTH = 20

async function sweep(t, { exact, shuffle }) {
  const restore = freezePositionPolling()
  t.after(restore)

  const arbitrary = createCommandArbitraries(fc, { shuffle })
  let lastFailure = null
  const outcome = await fc.check(
    fc.asyncProperty(fc.array(arbitrary, { minLength: MIN_LENGTH, maxLength: MAX_LENGTH }), async (commands) => {
      try {
        await runSequence(commands, { exact })
      } catch (error) {
        lastFailure = error
        throw error
      }
    }),
    { numRuns: RUNS, seed: SEED, endOnFailure: true },
  )

  if (outcome.failed === true) {
    const shrunk = outcome.counterexample?.[0]
    assert.fail([
      `model mismatch (suite ${shuffle ? 'shuffle' : 'exact'}, seed ${SEED}, runs ${RUNS})`,
      lastFailure?.message,
      `shrunk counterexample (${shrunk?.length ?? 0} commands): ${JSON.stringify(shrunk)}`,
      `replay: npm run test:stress -- --suite ${shuffle ? 'shuffle' : 'exact'} --seed ${SEED} --runs ${RUNS} --max-length ${MAX_LENGTH}`,
    ].filter(Boolean).join('\n'))
  }
}

test('the queue state machine matches the reference model (sequence / all / one)', async (t) => {
  await sweep(t, { exact: true, shuffle: false })
})

test('the queue state machine holds its invariants under shuffle', async (t) => {
  await sweep(t, { exact: false, shuffle: true })
})
