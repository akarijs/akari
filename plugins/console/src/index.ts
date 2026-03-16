import { Context, Service } from 'cordis'
import { WebSocketServer } from 'ws'
import type { WebSocket } from 'ws'
import type { ViteDevServer } from 'vite'

import { Client } from './client.js'
import { Entry } from './entry.js'
import { DataService } from './service.js'
import { createServer } from './builder.js'
import { promises as fs, createReadStream } from 'node:fs'
import { resolve, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

export * from './client.js'
export * from './entry.js'
export * from './service.js'

export const name = 'console'

export class EntryProvider extends DataService<Record<string, any>> {
  static inject = ['console']
  static [Service.provide] = 'console-entry' as const

  constructor(ctx: Context) {
    super(ctx, 'entry', { immediate: true })
  }

  async get(_forced: boolean, client: Client) {
    return this.ctx.console.getEntries(client)
  }
}

declare module 'cordis' {
  interface Context {
    console: ConsoleService
  }
  interface Events {
    'console/connection'(client: Client): void
    'console/intercept'(client: Client, options: DataService.Options): boolean | Promise<boolean>
  }
}

export interface Config {
  uiPath?: string
  apiPath?: string
  devMode?: boolean
}

export interface RouteRecord {
  path: string
  title?: string
  html?: string
  [key: string]: any
}

export interface AddRouteOptions {
  namespace?: string
  override?: boolean
}

type RpcListener = (...args: any[]) => any

export namespace ConsoleService {
  export interface Services {
    entry: EntryProvider
  }
}

export class ConsoleService extends Service {
  static inject = ['server']
  static [Service.provide] = 'console'
  static [Service.immediate] = true

  private uiPath: string
  private apiPath: string
  private devMode: boolean

  private wss!: WebSocketServer
  private clients = new Map<string, Client>()
  
  public entries: Record<string, Entry> = Object.create(null)
  public listeners: Record<string, { callback: RpcListener } & DataService.Options> = Object.create(null)
  public services: Record<string, DataService> = Object.create(null)

  private _routes: Map<string, RouteRecord> = new Map()
  private vite: ViteDevServer | null = null

  constructor(ctx: Context, public config: Config = {}) {
    super(ctx)
    this.uiPath = config.uiPath ?? '/console'
    this.apiPath = config.apiPath ?? '/console/api'
    this.devMode = config.devMode ?? false

    ctx.plugin(EntryProvider)

    ctx.effect(() => {
      const disposeStats = this.addListener('console/get-stats', () => ({
        clients: this.clients.size,
        entries: Object.keys(this.entries).length,
      }))
      void this.setup()
      return () => {
        disposeStats()
        this.teardown()
      }
    })
  }

  private async setup() {
    if (this.devMode) {
      const consoleRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
      this.vite = await createServer(process.cwd(), {
        root: resolve(consoleRoot, 'app'),
        base: this.uiPath + '/',
      })
    }

    // Direct routing for Vite-served frontend
    this.ctx.get('server')!.app.use(async (ctx, next) => {
      const path = ctx.path
      
      // Handle the SPA fallback dynamically
      if (path === this.uiPath || path === `${this.uiPath}/` || path.startsWith(`${this.uiPath}/`)) {
        if (this.vite) {
          if (path !== this.uiPath && path !== `${this.uiPath}/`) {
            await new Promise<void>((resolve, reject) => {
              this.vite!.middlewares(ctx.req, ctx.res, (err: any) => {
                if (err) return reject(err)
                resolve()
              })
            })
            
            if (ctx.res.writableEnded) return
          }
          
          // SPA Fallback locally
          ctx.type = 'text/html'
          try {
            const indexHtmlPath = resolve(fileURLToPath(new URL('..', import.meta.url)), 'app/index.html')
            let rawHtml = await fs.readFile(indexHtmlPath, 'utf-8')
            // Transform index.html programmatically via vite dev server
            let html = await this.vite!.transformIndexHtml(path, rawHtml)
            // Inject dynamically the global __AKARI_CONFIG__
            const configScript = `<script>globalThis.__AKARI_CONFIG__ = ${JSON.stringify({
              endpoint: this.apiPath,
              devMode: this.devMode,
            })}</script>`
            html = html.replace(/<head>/i, `$&${configScript}`)
            ctx.body = html
            return
          } catch (e: any) {
            ctx.status = 500
            ctx.body = e.message
            return
          }
        } else {
          // Serve pre-built static files in production
          const url = ctx.path.replace(this.uiPath, '') || '/'
          const distDir = resolve(fileURLToPath(new URL('..', import.meta.url)), 'dist')
          
          let targetPath = resolve(distDir, url.slice(1))
          
          try {
            const stat = await fs.stat(targetPath)
            if (!stat.isFile()) throw new Error('Not a file')
          } catch {
            targetPath = resolve(distDir, 'index.html')
          }
          
          try {
            const stat = await fs.stat(targetPath)
            if (stat.isFile()) {
              const ext = extname(targetPath)
              if (ext === '.js') ctx.type = 'application/javascript'
              else if (ext === '.css') ctx.type = 'text/css'
              if (ext === '.html') {
                ctx.type = 'text/html'
                let rawHtml = await fs.readFile(targetPath, 'utf-8')
                const configScript = `<script>globalThis.__AKARI_CONFIG__ = ${JSON.stringify({
                  endpoint: this.apiPath,
                  devMode: false,
                })}</script>`
                ctx.body = rawHtml.replace(/<head>/i, `$&${configScript}`)
              } else {
                ctx.body = createReadStream(targetPath)
              }
              return
            }
          } catch {
            // Check if it matches a module path
            const modMatch = url.match(/^\/modules\/([^\/]+)\/(.*)$/)
            if (modMatch) {
              const [_, id, rest] = modMatch
              const entry = Object.values(this.entries).find(e => e.id === id)
              if (entry) {
                // Determine prod file path
                const prodFileStr = typeof entry.files === 'string' || Array.isArray(entry.files)
                  ? (Array.isArray(entry.files) ? entry.files[0] : entry.files)
                  : (Array.isArray(entry.files.prod) ? entry.files.prod[0] : entry.files.prod)
                
                // prodFile is typically .../dist/index.js. We map the requested file based on dist directory
                const distDir = resolve(prodFileStr, '..')
                const modTargetPath = resolve(distDir, rest)
                
                try {
                  const s = await fs.stat(modTargetPath)
                  if (s.isFile()) {
                    const ext = extname(modTargetPath)
                    if (ext === '.js') ctx.type = 'application/javascript'
                    else if (ext === '.css') ctx.type = 'text/css'
                    else if (ext === '.svg') ctx.type = 'image/svg+xml'
                    
                    ctx.body = createReadStream(modTargetPath)
                    return
                  }
                } catch {
                  // Fall through
                }
              }
            }
            
            // Fall through to 404
          }
        }
      }

      return next()
    })

    this.mountWebSocket()
  }

  private teardown() {
    for (const client of this.clients.values()) client.socket?.close()
    this.clients.clear()
    if (this.wss) this.wss.close()
    if (this.vite) void this.vite.close()
    this.vite = null
  }

  private mountWebSocket() {
    this.wss = new WebSocketServer({ noServer: true })
    const serverCore = this.ctx.get('server')!.httpServer

    serverCore.on('upgrade', (req: any, socket: any, head: any) => {
      const { pathname } = new URL(req.url || '/', `http://${req.headers.host}`)
      if (pathname === this.apiPath) {
        this.wss.handleUpgrade(req, socket, head, (ws) => {
          this.wss.emit('connection', ws, req)
        })
      }
    })

    this.wss.on('connection', (socket: WebSocket, req) => {
      const client = new Client(this.ctx, socket, req)
      this.clients.set(client.id, client)
      
      socket.on('close', () => {
        this.clients.delete(client.id)
      })

      this.ctx.emit('console/connection', client)
    })
  }

  // -------------------------------------------------------------------------
  // Registry API
  // -------------------------------------------------------------------------
  addEntry<T>(files: Entry.Files, data?: (client: Client) => T) {
    return new Entry(this.ctx, files, data)
  }

  addListener(event: string, callback: RpcListener, options: DataService.Options = {}) {
    this.listeners[event] = { callback, ...options }
    return () => {
      delete this.listeners[event]
    }
  }

  async broadcast(type: string, body: any, options: DataService.Options = {}) {
    if (this.clients.size === 0) return
    await Promise.all(Array.from(this.clients.values()).map(async (client) => {
      if (await this.ctx.serial('console/intercept', client, options)) return
      
      let finalBody = body
      if (typeof body === 'function') finalBody = await body(client)
        
      client.send({ type, body: finalBody })
    }))
  }

  refresh(type: string) {
    if (this.services[type]) {
      this.services[type].refresh()
    } else if (type === 'entry') {
      this.ctx.get('console-entry')?.refresh()
    }
  }

  patch(type: string, value: any) {
    if (this.services[type]) {
      this.services[type].patch(value as never)
    }
  }

  addRoute(route: RouteRecord, opts: AddRouteOptions = {}) {
    const finalPath = opts.namespace ? `${opts.namespace}/${route.path}` : route.path
    if (this._routes.has(finalPath) && !opts.override) {
      throw new Error(`Route already exists: ${finalPath}`)
    }
    this._routes.set(finalPath, { ...route, path: finalPath })
    this.refresh('entry')
    return () => this._routes.delete(finalPath)
  }

  getRoutes(): RouteRecord[] {
    return Array.from(this._routes.values())
  }

  getEntries(client?: Client) {
    const result: Record<string, any> = {}
    for (const e of Object.values(this.entries)) {
      let files: string[] = typeof e.files === 'string' || Array.isArray(e.files)
        ? (Array.isArray(e.files) ? e.files : [e.files])
        : (this.devMode ? 
            (Array.isArray(e.files.dev) ? e.files.dev : [e.files.dev]) : 
            (Array.isArray(e.files.prod) ? e.files.prod : [e.files.prod])
          )
        
      if (this.devMode) {
        files = files.map(f => this.uiPath + '/@fs/' + f.replace(/\\/g, '/'))
      } else {
        // Production: Since we build into plugins/<name>/dist/index.js
        // We will just expose them under /console/modules/<id>/index.js
        files = files.map(_f => `${this.uiPath}/modules/${e.id}/index.js`)
      }

      result[e.id] = {
        files,
        data: e.data && client ? e.data(client) : e.data ? (e.data as any)() : null
      }
    }
    return result
  }
}

export default ConsoleService
