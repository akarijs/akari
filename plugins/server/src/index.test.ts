import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Context } from 'cordis'
import { ServerService } from './index.js'

describe('ServerService', () => {
  let ctx: Context

  beforeEach(async () => {
    ctx = new Context()
  })

  afterEach(async () => {
    await ctx.stop()
  })

  it('registers as a service on the context', async () => {
    ctx.plugin(ServerService, { port: 0 })
    await new Promise<void>((resolve) => {
      ctx.inject(['server'], () => resolve())
    })
    expect(ctx.server).toBeInstanceOf(ServerService)
  })

  it('creates a Koa app instance', async () => {
    ctx.plugin(ServerService, { port: 0 })
    await new Promise<void>((resolve) => {
      ctx.inject(['server'], () => resolve())
    })
    expect(ctx.server.app).toBeDefined()
    expect(typeof ctx.server.app.use).toBe('function')
  })

  it('creates an HTTP server instance', async () => {
    ctx.plugin(ServerService, { port: 0 })
    await new Promise<void>((resolve) => {
      ctx.inject(['server'], () => resolve())
    })
    expect(ctx.server.httpServer).toBeDefined()
  })

  it('uses default port and host', async () => {
    ctx.plugin(ServerService)
    await new Promise<void>((resolve) => {
      ctx.inject(['server'], () => resolve())
    })
    expect(ctx.server.port).toBe(4000)
    expect(ctx.server.host).toBe('0.0.0.0')
  })

  it('accepts custom port and host', async () => {
    ctx.plugin(ServerService, { port: 8080, host: '127.0.0.1' })
    await new Promise<void>((resolve) => {
      ctx.inject(['server'], () => resolve())
    })
    expect(ctx.server.port).toBe(8080)
    expect(ctx.server.host).toBe('127.0.0.1')
  })
})
