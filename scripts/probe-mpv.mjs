/**
 * One-off probe: prove that a supervised mpv process can be driven over the
 * Windows named-pipe JSON IPC channel, and learn the exact property names we
 * need for the engine. Not part of the shipped plugin.
 */
import { spawn } from 'node:child_process'
import net from 'node:net'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'

const MPV = process.argv[2] ?? 'C:\\Users\\andy\\scoop\\apps\\mpv\\current\\mpv.exe'
const TRACK = process.argv[3] ?? 'D:\\归档\\兰音专辑\\2024-05-11 兰音.2024.《形神合一》.兰音工作室.兰音Reine音乐作品集\\01.《形神合一》.2024.兰音.24bits.48khz.wav'

if (!existsSync(MPV)) throw new Error(`mpv not found: ${MPV}`)
if (!existsSync(TRACK)) throw new Error(`track not found: ${TRACK}`)

const pipeName = `dsh-music-probe-${randomBytes(4).toString('hex')}`
const pipePath = `\\\\.\\pipe\\${pipeName}`

const child = spawn(MPV, [
  '--idle=yes',
  '--no-video',
  '--no-terminal',
  '--no-config',
  '--no-input-default-bindings',
  '--audio-display=no',
  '--gapless-audio=weak',
  '--volume-max=100',
  '--keep-open=no',
  `--input-ipc-server=\\\\.\\pipe\\${pipeName}`,
], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true })

let stderr = ''
child.stderr.on('data', (d) => { stderr += d.toString() })
child.on('exit', (code) => console.log(`\n[mpv exited] code=${code}`))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function connect(retries = 40) {
  for (let i = 0; i < retries; i++) {
    try {
      return await new Promise((resolve, reject) => {
        const sock = net.connect(pipePath)
        sock.once('connect', () => resolve(sock))
        sock.once('error', reject)
      })
    } catch {
      await sleep(100)
    }
  }
  throw new Error('could not connect to mpv IPC pipe')
}

const sock = await connect()
const pending = new Map()
const events = []
let nextId = 1
let buffer = ''

sock.on('data', (chunk) => {
  buffer += chunk.toString('utf8')
  let idx
  while ((idx = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, idx).trim()
    buffer = buffer.slice(idx + 1)
    if (!line) continue
    const msg = JSON.parse(line)
    if (msg.request_id !== undefined && pending.has(msg.request_id)) {
      pending.get(msg.request_id)(msg)
      pending.delete(msg.request_id)
    } else if (msg.event) {
      events.push(msg)
    }
  }
})

function cmd(...command) {
  const request_id = nextId++
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(request_id); reject(new Error(`timeout: ${command[0]}`)) }, 5000)
    pending.set(request_id, (msg) => { clearTimeout(timer); resolve(msg) })
    sock.write(JSON.stringify({ command, request_id }) + '\n')
  })
}

async function prop(name) {
  const r = await cmd('get_property', name)
  return r.error === 'success' ? r.data : { __error: r.error }
}

console.log('mpv version :', (await prop('mpv-version')))
console.log('ao list     :', Object.keys((await cmd('get_property', 'audio-out-detected-device')).error === 'success'
  ? { ok: 1 } : {}).length ? 'probed' : 'probed')

await cmd('observe_property', 1, 'time-pos')
await cmd('observe_property', 2, 'audio-out-params')
await cmd('observe_property', 3, 'audio-params')
await cmd('observe_property', 4, 'eof-reached')
await cmd('observe_property', 5, 'pause')

const load = await cmd('loadfile', TRACK, 'replace')
console.log('loadfile    :', load.error)

await sleep(2500)
console.log('time-pos    :', await prop('time-pos'))
console.log('duration    :', await prop('duration'))
console.log('audio-codec :', await prop('audio-codec-name'))
console.log('audio-params:', await prop('audio-params'))
console.log('out-params  :', await prop('audio-out-params'))
console.log('ao          :', await prop('current-ao'))
console.log('device      :', await prop('audio-device'))
console.log('paused      :', await prop('pause'))

// seek + pause + resume
console.log('seek        :', (await cmd('seek', 30, 'absolute+exact')).error)
await sleep(600)
console.log('pos after   :', await prop('time-pos'))
console.log('pause       :', (await cmd('set_property', 'pause', true)).error)
await sleep(400)
const p1 = await prop('time-pos')
await sleep(700)
const p2 = await prop('time-pos')
console.log('paused drift:', p1, '->', p2)
console.log('volume      :', (await cmd('set_property', 'volume', 42)).error, await prop('volume'))

console.log('\nevents seen :', [...new Set(events.map((e) => e.event))].join(', '))
const outParams = events.filter((e) => e.event === 'property-change' && e.name === 'audio-out-params')
console.log('out-params events:', JSON.stringify(outParams.slice(-1)))

await cmd('quit')
await sleep(1200)
try { sock.destroy() } catch {}
console.log('stderr tail :', stderr.trim().split('\n').slice(-6).join(' | '))
if (!child.killed) child.kill()
process.exit(0)
