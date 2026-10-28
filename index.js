/**
 * Host half of the DSH Music bundle.
 *
 * Synchronous `apply` on purpose: the route is registered immediately (so the
 * Client can call it as soon as it renders), while the heavy work — SQLite,
 * ffprobe, mpv — happens behind a `ready` promise.
 */
import { startMusicService, normalizeConfig, makeFileLogger, dataRoot, VERSION } from './lib/host/plugin.js'

export const name = '@local/dsh-music'
export const inject = ['webServer']

export function apply(ctx, rawConfig) {
  const config = normalizeConfig(rawConfig)
  const log = makeFileLogger(dataRoot())
  const ready = startMusicService(config, { ctx, log })

  let disposed = false
  const teardown = () => {
    if (disposed) return
    disposed = true
    ready.then((service) => service.dispose()).catch(() => {})
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/music',
    handler: async (req, res) => {
      let service
      try {
        service = await ready
      } catch (error) {
        log('error', `music service failed to start: ${error?.stack ?? error}`)
        res.writeHead(503, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ ok: false, error: `music service failed to start: ${error?.message ?? error}` }))
        return
      }
      await service.api.handle(req, res)
    },
  }), 'dsh-music http route')

  ctx.effect(() => () => teardown(), 'dsh-music lifecycle')

  ready.then((service) => {
    log('info', `music service ready (engine=${service.engineMode}, data=${service.dataDir})`)
    if (service.engineMode === 'browser' && service.engineFailure !== null) {
      log('warn', `browser fallback active: ${service.engineFailure?.message ?? 'unknown reason'}`)
    }
  }).catch((error) => {
    log('error', `music service start failed: ${error?.stack ?? error}`)
  })
}

export const VERSION_STRING = VERSION
