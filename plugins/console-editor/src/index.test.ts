import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Context } from 'cordis'
import { DataSource, MemoryDriver } from '@akari/core'
import { ServerService } from '@akari/plugin-server'
import { ConsoleService } from '@akari/plugin-console'
import { apply, inject } from './index.js'

interface PostRecord {
  id: number
  slug: string
  title: string
  content: string
  published: boolean
  status: 'draft' | 'published' | 'private'
  sourceType: string
  layout: string
  date: Date
  updated: Date
  tags: string[]
  categories: string[]
  meta: Record<string, any>
}

interface PageRecord {
  id: number
  slug: string
  title: string
  content: string
  sourceType: string
  layout: string
  date: Date
  updated: Date
  meta: Record<string, any>
}

declare module '@akari/core' {
  interface ListCollections {
    posts: PostRecord
    pages: PageRecord
  }
}

describe('console-editor', () => {
  let ctx: Context

  beforeEach(async () => {
    ctx = new Context()
    ctx.plugin(DataSource)
    ctx.plugin(ServerService, { port: 0 })
    ctx.plugin(ConsoleService)
    await ctx.start()
    ctx.datasource.defineCollection('posts', new MemoryDriver<PostRecord>())
    ctx.datasource.defineCollection('pages', new MemoryDriver<PageRecord>())
    await new Promise<void>((resolve) => {
      ctx.inject(['datasource', 'console'], () => resolve())
    })
  })

  afterEach(async () => {
    await ctx.stop()
  })

  it('exports correct inject dependencies', () => {
    expect(inject).toEqual(['console', 'datasource'])
  })

  it('registers datasource listeners', () => {
    apply(ctx)
    expect(ctx.console.listeners['datasource/definitions']).toBeDefined()
    expect(ctx.console.listeners['datasource/read']).toBeDefined()
    expect(ctx.console.listeners['datasource/create']).toBeDefined()
    expect(ctx.console.listeners['datasource/update']).toBeDefined()
    expect(ctx.console.listeners['datasource/delete']).toBeDefined()
    expect(ctx.console.listeners['datasource/set']).toBeDefined()
  })

  it('returns registered domain metadata', async () => {
    apply(ctx)
    const definitions = await ctx.console.listeners['datasource/definitions'].callback()
    expect(definitions).toHaveLength(2)
    expect(definitions.map((item: any) => item.name)).toEqual(['pages', 'posts'])
  })

  it('reads collection records through generic listener', async () => {
    apply(ctx)
    await ctx.datasource.collection('posts').create({
      title: 'Test Post',
      slug: 'test-post',
      content: 'hello',
      sourceType: 'test',
      layout: 'post',
      date: new Date(),
      updated: new Date(),
      tags: [],
      categories: [],
      status: 'published',
      published: true,
      meta: {},
    })

    const posts = await ctx.console.listeners['datasource/read'].callback('posts')
    expect(posts).toHaveLength(1)
    expect(posts[0].title).toBe('Test Post')
  })

  it('creates records through generic listener', async () => {
    apply(ctx)

    const post = await ctx.console.listeners['datasource/create'].callback('posts', {
      title: 'RPC Test',
      slug: 'rpc-test',
      content: 'hello',
      sourceType: 'test',
      layout: 'post',
      date: new Date(),
      updated: new Date(),
      tags: [],
      categories: [],
      status: 'published',
      published: true,
      meta: {},
    })

    expect(post.title).toBe('RPC Test')
    const fetched = await ctx.datasource.collection('posts').get(post.id)
    expect(fetched).not.toBeNull()
    expect(fetched!.title).toBe('RPC Test')
  })
})