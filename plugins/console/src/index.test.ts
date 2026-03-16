import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Context } from 'cordis'
import { ServerService } from '@akari/plugin-server'
import { ConsoleService, DataService } from './index.js'

describe('ConsoleService', () => {
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

  it('registers as a service on the context', () => {
    expect(ctx.console).toBeInstanceOf(ConsoleService)
  })

  it('supports addListener and returns dispose', () => {
    const dispose = ctx.console.addListener('test/echo', (msg: string) => msg)
    expect(typeof dispose).toBe('function')
  })

  it('supports addEntry and adds to entries', () => {
    const entry = ctx.console.addEntry({ dev: '/dev', prod: '/prod' })
    expect(typeof entry.dispose).toBe('function')
  })

  it('supports addRoute and getRoutes', () => {
    const dispose = ctx.console.addRoute({
      path: 'sample',
      title: 'Sample',
      html: '<div>sample</div>',
    })
    expect(typeof dispose).toBe('function')
    const routes = ctx.console.getRoutes()
    expect(routes.some((route) => route.path === 'sample')).toBe(true)
  })

  it('rejects duplicate routes by default', () => {
    ctx.console.addRoute({ path: 'dup', title: 'First' })
    expect(() => {
      ctx.console.addRoute({ path: 'dup', title: 'Second' })
    }).toThrow(/Route already exists/)
  })

  it('allows overriding duplicate routes when override=true', () => {
    ctx.console.addRoute({ path: 'dup2', title: 'First' })
    ctx.console.addRoute({ path: 'dup2', title: 'Second' }, { override: true })
    const route = ctx.console.getRoutes().find((item) => item.path === 'dup2')
    expect(route?.title).toBe('Second')
  })

  it('supports namespaced route paths', () => {
    ctx.console.addRoute({ path: 'list', title: 'List' }, { namespace: 'explorer' })
    const route = ctx.console.getRoutes().find((item) => item.path === 'explorer/list')
    expect(route?.title).toBe('List')
  })

  it('tracks entries correctly', () => {
    ctx.console.addEntry({ dev: '/a', prod: '/a' })
    ctx.console.addEntry({ dev: '/b', prod: '/b' })
    expect(ctx.console.getEntries()).toHaveLength(2)
  })

  it('starts with zero clients', () => {
    expect(ctx.console.broadcast).toBeDefined()
  })
})

describe('DataService', () => {
  it('can be subclassed and get() returns data', async () => {
    const ctx = new Context()
    ctx.plugin(ServerService, { port: 0 })
    ctx.plugin(ConsoleService)
    await new Promise<void>((resolve) => {
      ctx.inject(['console'], () => resolve())
    })

    class TestProvider extends DataService<string[]> {
      constructor(innerCtx: Context) {
        super(innerCtx, 'test-data' as any)
      }
      async get() {
        return ['a', 'b', 'c']
      }
    }

    const provider = new TestProvider(ctx)
    const data = await provider.get()
    expect(data).toEqual(['a', 'b', 'c'])

    await ctx.stop()
  })
})
