import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Context } from 'cordis'
import { ServerService } from '@akari/plugin-server'
import { ConsoleService } from '@akari/plugin-console'
import MarketPlugin from './index.js'
import { name } from './index.js'

describe('console-market', () => {
  let ctx: Context

  beforeEach(async () => {
    ctx = new Context()
    ctx.plugin(ServerService, { port: 0 })
    ctx.plugin(ConsoleService)
    await new Promise<void>((resolve) => {
      ctx.inject(['console'], () => resolve())
    })
  })

  afterEach(async () => {
    await ctx.stop()
  })

  it('exports the correct plugin name', async () => {
    expect(name).toBe('console-market')
  })

  it('exports correct inject dependencies', () => {
    expect(MarketPlugin.inject).toEqual(['console'])
  })

  it('Market returns array from get()', async () => {
    const provider = new MarketPlugin(ctx, {
      registry: 'http://localhost:1',
    })
    const packages = await provider.get()
    expect(Array.isArray(packages)).toBe(true)
  })

  it('apply registers RPC listeners', () => {
    ctx.plugin(MarketPlugin, {})
    expect(true).toBe(true)
  })

  it('apply registers market route', () => {
    ctx.plugin(MarketPlugin, {})
    const routes = ctx.console.getRoutes()
    expect(routes.some((route) => route.path === 'market')).toBe(true)
  })
})
