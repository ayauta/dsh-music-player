#!/usr/bin/env node
/**
 * How often does this test file go red?
 *
 * A probabilistic bug (B34, B35) is invisible to a single green run: the loop has
 * to be measured, not trusted. Running one file N times answers the only question
 * that matters when a symptom is "sometimes" — *what is the red rate?* — and it
 * answers it on the test, not on the user's machine.
 *
 * Exit codes: 0 = green every run, 1 = at least one red run, 3 = usage error.
 *
 * Usage:
 *   node scripts/test-repeat.mjs test/player-transport.test.mjs        # 5 runs
 *   node scripts/test-repeat.mjs test/playhead.test.mjs 20
 *   node scripts/test-repeat.mjs test/player-transport.test.mjs 20 --verbose
 *
 * Output is summarised, never piped: each run's streams are inherited only when
 * `--verbose` is passed or a run fails, so the interesting output is the one you
 * actually get.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const repo = join(dirname(fileURLToPath(import.meta.url)), '..')

function usage() {
  return 'usage: node scripts/test-repeat.mjs <test-file> [runs=5] [--verbose]'
}

const args = process.argv.slice(2)
const verbose = args.includes('--verbose')
const rest = args.filter((arg) => arg !== '--verbose')
if (rest.length === 0) {
  process.stderr.write(`${usage()}\n`)
  process.exitCode = 3
} else {
  const file = resolve(repo, rest[0])
  const runs = rest[1] === undefined ? 5 : Number(rest[1])
  if (!existsSync(file)) {
    process.stderr.write(`test-repeat: no such file: ${file}\n`)
    process.exitCode = 3
  } else if (!Number.isInteger(runs) || runs < 1 || runs > 500) {
    process.stderr.write('test-repeat: runs must be an integer between 1 and 500\n')
    process.exitCode = 3
  } else {
    process.exitCode = run(file, runs, verbose)
  }
}

function run(file, runs, verbose) {
  const red = []
  const started = process.hrtime.bigint()
  for (let index = 1; index <= runs; index += 1) {
    const result = spawnSync(process.execPath, ['--test', file], {
      cwd: repo,
      stdio: verbose ? 'inherit' : 'ignore',
    })
    if (result.status !== 0) {
      red.push(index)
      if (!verbose) {
        // Show the detail once, so the summary stays short but the failure is visible.
        process.stdout.write(`run ${index} went red; replaying its output:\n`)
        spawnSync(process.execPath, ['--test', file], { cwd: repo, stdio: 'inherit' })
      }
    }
  }
  const seconds = Number(process.hrtime.bigint() - started) / 1e9
  const label = `${red.length}/${runs} red`
  process.stdout.write(`${label} in ${seconds.toFixed(1)}s  (${file})\n`)
  if (red.length > 0) process.stdout.write(`red runs: ${red.join(', ')}\n`)
  return red.length === 0 ? 0 : 1
}
