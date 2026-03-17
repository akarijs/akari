import { Context, Service } from 'cordis'
import Koa from 'koa'
import { createServer, Server } from 'node:http'
import { resolve, join, normalize, extname } from 'node:path'
import { stat, readFile } from 'node:fs/promises'

export const name = 'server'

declare module 'cordis' {
  interface Context {
    server: ServerService
  }
}

export interface Config {
  port?: number
  host?: string
  staticDir?: string
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
}

export class ServerService extends Service {
  static [Service.provide] = 'server'
  static [Service.immediate] = true
  static inject = { router: { required: false } }

  public app: Koa
  public httpServer: Server
  public port: number
  public host: string

  private _listening = false
  private staticDir: string | null

  constructor(ctx: Context, public config: Config = {}) {
    super(ctx)
    this.port = config.port ?? 4000
    this.host = config.host ?? '0.0.0.0'
    this.staticDir = config.staticDir ? resolve(config.staticDir) : null
    this.app = new Koa()
    this.setupRouterMiddleware()
    this.setupStaticMiddleware()
    this.httpServer = createServer(this.app.callback())

    ctx.effect(() => {
      this.listen()
      return () => this.close()
    })
  }

  /** On-demand rendering via RouterService (if available). */
  private setupRouterMiddleware() {
    this.app.use(async (ctx, next) => {
      if (ctx.method !== 'GET' && ctx.method !== 'HEAD') {
        return next()
      }

      // Skip console routes
      if (ctx.path.startsWith('/console')) {
        return next()
      }

      const router = this.ctx.get('router')
      if (!router) return next()

      const requestPath = decodeURIComponent(ctx.path)
      const result = await router.render(requestPath)
      if (result) {
        if (result.type === 'text/html') {
          ctx.type = 'text/html; charset=utf-8'
        } else {
          ctx.type = result.type
        }
        ctx.body = result.content
        return
      }

      return next()
    })
  }

  /** Static file serving fallback (theme assets, images, etc.). */
  private setupStaticMiddleware() {
    this.app.use(async (ctx, next) => {
      if (ctx.method !== 'GET' && ctx.method !== 'HEAD') {
        return next()
      }

      if (ctx.path.startsWith('/console')) {
        return next()
      }

      // Resolve static directory: explicit config or theme.sourceDir fallback
      const staticDir = this.staticDir ?? this.ctx.get('theme.sourceDir' as any) as string | undefined
      if (!staticDir) return next()

      const requestPath = decodeURIComponent(ctx.path)
      const cleanPath = requestPath.replace(/^\/+/, '')
      const normalized = normalize(cleanPath)

      if (!normalized || normalized === '.') {
        const indexPath = join(staticDir, 'index.html')
        try {
          const ext = extname(indexPath).toLowerCase()
          ctx.type = MIME_TYPES[ext] ?? 'application/octet-stream'
          ctx.body = await readFile(indexPath)
          return
        } catch {
          return next()
        }
      }

      if (normalized.startsWith('..')) {
        return next()
      }

      const candidates = [
        join(staticDir, normalized),
        join(staticDir, normalized, 'index.html'),
      ]

      for (const filePath of candidates) {
        try {
          const fileStat = await stat(filePath)
          if (!fileStat.isFile()) continue
          const ext = extname(filePath).toLowerCase()
          ctx.type = MIME_TYPES[ext] ?? 'application/octet-stream'
          ctx.body = await readFile(filePath)
          return
        } catch {
          // try next candidate
        }
      }

      return next()
    })
  }

  private listen() {
    if (this._listening) return
    this.httpServer.listen(this.port, this.host, () => {
      this.ctx.emit('server/ready', this.port, this.host)
    })
    this._listening = true
  }

  private close() {
    if (!this._listening) return
    this.httpServer.close()
    this._listening = false
  }
}

declare module 'cordis' {
  interface Events {
    'server/ready'(port: number, host: string): void
  }
}

export default ServerService
