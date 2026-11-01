/**
 * Authorization-gate tests.
 *
 * These prove the refusal path *without* touching a real player:
 *   - a local HTTP server stands in for "the target";
 *   - the scripts are spawned with a URL that would reach it;
 *   - the assertion is that the server receives ZERO requests.
 *
 * That is stronger than "it exited quickly with code 2": a script could exit
 * after sending a request, and the counter would catch it.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..')

/** Start a counter server that records any incoming request. */
async function counterServer() {
  const requests = []
  const server = createServer((request, response) => {
    requests.push(`${request.method} ${request.url}`)
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ ok: true, data: null }))
  })
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  const { port } = server.address()
  return {
    url: `http://127.0.0.1:${port}/music/api`,
    requests,
    close: () => new Promise((done) => server.close(done)),
  }
}

function runScript(script, env) {
  const base = { ...process.env }
  // Never inherit authorization from the parent shell: each case states its own.
  delete base.DSH_MUSIC_ALLOW_LIVE
  delete base.DSH_MUSIC_ALLOW_PERF
  delete base.DSH_MUSIC_API

  const started = Date.now()
  return new Promise((done) => {
    const child = spawn(process.execPath, [join(repo, 'scripts', script)], {
      env: { ...base, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('close', (code) => done({ code, stdout, stderr, ms: Date.now() - started }))
  })
}

test('dangerous scripts refuse by default', { timeout: 30000 }, async (t) => {
  const server = await counterServer()
  t.after(() => server.close())

  await t.test('playback-test refuses without live authorization', async () => {
    const result = await runScript('playback-test.mjs', { DSH_MUSIC_API: server.url })
    assert.equal(result.code, 2, `expected exit 2, got ${result.code}\n${result.stderr}`)
    assert.match(result.stderr, /refused/i)
    assert.match(result.stderr, /DSH_MUSIC_ALLOW_LIVE/)
    assert.deepEqual(server.requests, [], 'the script must not reach the target server')
    assert.ok(result.ms < 5000, `refusal must be immediate (took ${result.ms}ms)`)
  })

  await t.test('playback-test has no default port', async () => {
    const result = await runScript('playback-test.mjs', { DSH_MUSIC_ALLOW_LIVE: '1' })
    assert.equal(result.code, 2, `expected exit 2, got ${result.code}`)
    assert.match(result.stderr, /DSH_MUSIC_API/)
    assert.deepEqual(server.requests, [], 'no request without an explicit target')
  })

  await t.test('playback-test rejects non-loopback targets', async () => {
    const result = await runScript('playback-test.mjs', {
      DSH_MUSIC_ALLOW_LIVE: '1',
      DSH_MUSIC_API: 'http://192.0.2.10:8080/music/api',
    })
    assert.equal(result.code, 2)
    assert.match(result.stderr, /loopback/i)
    assert.deepEqual(server.requests, [])
  })

  await t.test('playback-test rejects a wrong API path', async () => {
    const result = await runScript('playback-test.mjs', {
      DSH_MUSIC_ALLOW_LIVE: '1',
      DSH_MUSIC_API: server.url.replace('/music/api', '/wrong'),
    })
    assert.equal(result.code, 2)
    assert.match(result.stderr, /music\/api/)
    assert.deepEqual(server.requests, [])
  })

  await t.test('loadtest needs its own performance authorization', async () => {
    const result = await runScript('loadtest.mjs', {
      DSH_MUSIC_ALLOW_LIVE: '1',
      DSH_MUSIC_API: server.url,
    })
    assert.equal(result.code, 2, `expected exit 2, got ${result.code}\n${result.stderr}`)
    assert.match(result.stderr, /DSH_MUSIC_ALLOW_PERF/)
    assert.deepEqual(server.requests, [], 'a live token alone must not start the load test')
  })

  await t.test('loadtest with both tokens still needs an explicit target', async () => {
    const result = await runScript('loadtest.mjs', {
      DSH_MUSIC_ALLOW_LIVE: '1',
      DSH_MUSIC_ALLOW_PERF: '1',
    })
    assert.equal(result.code, 2)
    assert.match(result.stderr, /DSH_MUSIC_API/)
    assert.deepEqual(server.requests, [])
  })
})
