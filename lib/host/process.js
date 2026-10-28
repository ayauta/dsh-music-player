/**
 * Process abstraction with one shape for both worlds.
 *
 * The plugin prefers the Harness `subprocess` service (it owns the execution
 * world, tracks every child for disposal and bounds collected output). The
 * standalone harness in `scripts/` has no Cordis context, so a local
 * `node:child_process` implementation is used there.
 *
 * Both return the same handle shape: { done, terminate, readStdout, readStderr }.
 * Reads are non-consuming so a caller can inspect output after exit.
 */
import { spawn as nodeSpawn } from 'node:child_process'

const STDOUT_CAP = 1024 * 1024
const STDERR_CAP = 32 * 1024

export function createLocalProcesses() {
  const children = new Set()

  return {
    kind: 'local',
    async resolve(command) { return command },
    spawn({ argv, cwd, env }) {
      const child = nodeSpawn(argv[0], argv.slice(1), {
        cwd: cwd ?? process.cwd(),
        env: { ...process.env, ...(env ?? {}) },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })
      children.add(child)
      let stdout = ''
      let stderr = ''
      child.stdout?.setEncoding('utf8')
      child.stderr?.setEncoding('utf8')
      child.stdout?.on('data', (chunk) => {
        stdout += chunk
        if (stdout.length > STDOUT_CAP) stdout = stdout.slice(-STDOUT_CAP)
      })
      child.stderr?.on('data', (chunk) => {
        stderr += chunk
        if (stderr.length > STDERR_CAP) stderr = stderr.slice(-STDERR_CAP)
      })
      const done = new Promise((resolve) => {
        child.on('exit', (code, signal) => { children.delete(child); resolve({ exitCode: code, signal }) })
        child.on('error', (error) => { children.delete(child); resolve({ exitCode: null, signal: null, error: String(error?.message ?? error) }) })
      })
      return {
        child,
        done,
        terminate() { try { child.kill('SIGKILL') } catch { /* already gone */ } },
        readStdout() { return stdout },
        readStderr() { return stderr },
      }
    },
    disposeAll() {
      for (const child of children) { try { child.kill('SIGKILL') } catch { /* already gone */ } }
      children.clear()
    },
  }
}

export function createServiceProcesses(ctx, log) {
  return {
    kind: 'service',
    async resolve(command) {
      try { return await ctx.subprocess.resolveExecutable(command) } catch (error) {
        log?.('warn', `resolveExecutable failed for ${command}: ${String(error?.message ?? error)}`)
        return command
      }
    },
    spawn({ argv, cwd, env }) {
      const handle = ctx.subprocess.spawn({
        argv,
        cwd: cwd ?? process.cwd(),
        stdio: {
          stdin: 'ignore',
          stdout: { maxBytes: STDOUT_CAP },
          stderr: { maxBytes: STDERR_CAP },
        },
        graceMs: 2000,
        env: { ...process.env, ...(env ?? {}) },
      })
      const read = (name) => {
        try {
          const reader = handle.collected?.[name]
          if (reader === undefined || reader === null) return ''
          return reader.readFrom(0).text ?? ''
        } catch { return '' }
      }
      return {
        handle,
        done: handle.done,
        terminate() { try { handle.terminate?.() } catch { /* already gone */ } },
        readStdout() { return read('stdout') },
        readStderr() { return read('stderr') },
      }
    },
    disposeAll() { /* the subprocess service owns teardown of managed children */ },
  }
}

/** Run one command to completion, then read its collected output. */
export async function runCollect(processes, argv, { cwd, timeoutMs = 20000 } = {}) {
  let handle
  try {
    handle = processes.spawn({ argv, cwd })
  } catch (error) {
    return { code: 1, stdout: '', stderr: `spawn failed: ${String(error?.message ?? error)}` }
  }

  let timer = null
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve('timeout'), timeoutMs) })
  const outcome = await Promise.race([handle.done.then((value) => ({ value })), timeout])
  if (timer !== null) clearTimeout(timer)

  if (outcome === 'timeout') {
    handle.terminate()
    return { code: 124, stdout: handle.readStdout?.() ?? '', stderr: `timed out after ${timeoutMs}ms` }
  }
  const value = outcome.value ?? {}
  return {
    code: value.exitCode ?? 1,
    stdout: handle.readStdout?.() ?? '',
    stderr: handle.readStderr?.() ?? (value.error ?? ''),
  }
}
