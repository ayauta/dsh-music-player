#!/usr/bin/env node
/**
 * `node --check` over every source file, not just the two entry points.
 *
 * `npm run check` used to parse `index.js` and `client.js` only. Every other file
 * was parsed indirectly, at most, by whichever test happened to import it — so a
 * syntax error in `scripts/`, or in a host module no test covers, would sit there
 * until something ran it. This walks the trees instead, in one process per file,
 * and reports the first line that will not parse.
 *
 * Exit codes: 0 = all parsed, 1 = at least one file failed, 3 = usage error.
 */
import { readdirSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = join(dirname(fileURLToPath(import.meta.url)), '..')
/** Files we author. `test/` is included: a broken test is a broken check. */
const ROOTS = ['index.js', 'client.js', 'lib', 'scripts', 'test']
/** Never descended into. */
const SKIP = new Set(['node_modules', '.git', '.dsh', '.scratch', 'artifacts'])

function collect(target, found = []) {
  const path = join(repo, target)
  let stat
  try {
    stat = statSync(path)
  } catch {
    return found
  }
  if (stat.isFile()) {
    if (/\.(?:mjs|cjs|js)$/.test(path)) found.push(path)
    return found
  }
  for (const entry of readdirSync(path)) {
    if (SKIP.has(entry)) continue
    collect(join(target, entry), found)
  }
  return found
}

const files = [...new Set(ROOTS.flatMap((root) => collect(root)))].sort()
const failures = []
for (const file of files) {
  // `stdio: 'ignore'` keeps this off the pipe path entirely; the exit code is the signal.
  const result = spawnSync(process.execPath, ['--check', file], { cwd: repo, stdio: 'ignore' })
  if (result.status !== 0) failures.push(relative(repo, file))
}

if (failures.length > 0) {
  process.stdout.write(`syntax: ${failures.length} file(s) will not parse\n`)
  for (const file of failures) {
    // Replay one file with its output visible: the message is the whole value here.
    spawnSync(process.execPath, ['--check', file], { cwd: repo, stdio: 'inherit' })
    process.stdout.write(`  ^ ${file}\n`)
  }
  process.exitCode = 1
} else {
  process.stdout.write(`syntax: ${files.length} files parse\n`)
}
