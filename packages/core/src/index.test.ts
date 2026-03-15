import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { SiteConfig, SourceFile, SiteData } from './index.js'
import { Context } from 'cordis'
import { DataSource } from './datasource.js'
import { MemoryDriver, MemorySingleton } from './datasource/memory.js'
import { TransformerService } from './transformer.js'
import { TemplateService } from './template.js'

interface BlogPost {
  id: number
  title: string
  slug: string
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

declare module './datasource.js' {
  interface ListCollections {
    posts: BlogPost
  }

  interface SingletonCollections {
    site: SiteConfig
  }
}

// ---- Existing tests (kept unchanged) ----

describe('@akari/core types', () => {
  it('SiteConfig accepts required title field', () => {
    const config: SiteConfig = { title: 'My Akari Blog' }
    expect(config.title).toBe('My Akari Blog')
  })

  it('SiteConfig optional fields default to undefined', () => {
    const config: SiteConfig = { title: 'Test' }
    expect(config.subtitle).toBeUndefined()
    expect(config.author).toBeUndefined()
    expect(config.url).toBeUndefined()
  })

  it('SourceFile holds raw content and front-matter', () => {
    const now = new Date()
    const file: SourceFile = {
      path: 'posts/hello-world.md',
      raw: '---\ntitle: Hello\n---\nWorld',
      frontMatter: { title: 'Hello' },
      content: 'World',
      createdAt: now,
      updatedAt: now,
    }
    expect(file.path).toBe('posts/hello-world.md')
    expect(file.frontMatter['title']).toBe('Hello')
    expect(file.content).toBe('World')
  })

  it('SiteData organises posts and tags', () => {
    const now = new Date()
    const post: SourceFile = {
      path: 'posts/a.md',
      raw: '',
      frontMatter: {},
      content: '',
      createdAt: now,
      updatedAt: now,
    }
    const data: SiteData = {
      config: { title: 'Blog' },
      posts: [post],
      pages: [],
      tags: new Map([['typescript', [post]]]),
      categories: new Map(),
    }
    expect(data.posts).toHaveLength(1)
    expect(data.tags.get('typescript')).toHaveLength(1)
  })
})

// ---- TransformerService tests ----

describe('TransformerService', () => {
  let root: Context

  beforeEach(() => {
    root = new Context()
    root.plugin(TransformerService)
  })

  afterEach(() => root.stop())

  it('registers and transforms', async () => {
    await new Promise<void>(resolve => {
      root.inject(['transformer'], (ctx) => {
        ctx.transformer.register('markdown', (content) => ({
          content: `<p>${content}</p>`,
        }))
        resolve()
      })
    })

    const result = await root.transformer.transform('markdown', 'hello')
    expect(result.content).toBe('<p>hello</p>')
  })

  it('supports() returns correct result', async () => {
    await new Promise<void>(resolve => {
      root.inject(['transformer'], (ctx) => {
        ctx.transformer.register('markdown', (c) => ({ content: c }))
        resolve()
      })
    })

    expect(root.transformer.supports('markdown')).toBe(true)
    expect(root.transformer.supports('unknown')).toBe(false)
  })

  it('throws for unknown format', async () => {
    await expect(root.transformer.transform('unknown', 'test'))
      .rejects.toThrow('No transformer registered for format: unknown')
  })
})

// ---- TemplateService tests ----

describe('TemplateService', () => {
  let root: Context

  beforeEach(() => {
    root = new Context()
    root.plugin(TemplateService)
  })

  afterEach(() => root.stop())

  it('registers helpers', async () => {
    await new Promise<void>(resolve => {
      root.inject(['template'], (ctx) => {
        ctx.template.helper('upper', (s: string) => s.toUpperCase())
        resolve()
      })
    })

    const helpers = root.template.getHelpers()
    expect(helpers['upper']('hello')).toBe('HELLO')
  })

  it('adds and retrieves dirs', async () => {
    await new Promise<void>(resolve => {
      root.inject(['template'], (ctx) => {
        ctx.template.addDir('/some/path')
        resolve()
      })
    })

    expect(root.template.getDirs()).toContain('/some/path')
  })

  it('registers template engines', async () => {
    await new Promise<void>(resolve => {
      root.inject(['template'], (ctx) => {
        ctx.template.engine('njk', {
          renderFile: async (path, _locals) => `rendered: ${path}`,
        })
        resolve()
      })
    })

    expect(root.template).toBeDefined()
  })

  it('throws when template not found', async () => {
    await expect(root.template.render('nonexistent'))
      .rejects.toThrow('Template not found: nonexistent')
  })
})

describe('DataSource', () => {
  let root: Context

  beforeEach(() => {
    root = new Context()
    root.plugin(DataSource)
  })

  afterEach(() => root.stop())

  it('registers collections and supports CRUD through MemoryDriver', async () => {
    await new Promise<void>((resolve) => {
      root.inject(['datasource'], (ctx) => {
        ctx.datasource.defineCollection('posts', new MemoryDriver<BlogPost>())
        resolve()
      })
    })

    const post = await root.datasource.collection('posts').create({
      title: 'Hello',
      slug: 'hello',
      content: 'world',
      sourceType: 'memory',
      layout: 'post',
      date: new Date('2024-01-01'),
      updated: new Date('2024-01-01'),
      tags: [],
      categories: [],
      meta: {},
      published: true,
      status: 'published',
    })

    expect(post.id).toBe(1)
    const posts = await root.datasource.collection('posts').list()
    expect(posts).toHaveLength(1)

    const updated = await root.datasource.collection('posts').update(post.id, { title: 'Updated' })
    expect(updated.title).toBe('Updated')

    await root.datasource.collection('posts').delete(post.id)
    expect(await root.datasource.collection('posts').list()).toHaveLength(0)
  })

  it('registers singleton values', async () => {
    await new Promise<void>((resolve) => {
      root.inject(['datasource'], (ctx) => {
        ctx.datasource.defineSingleton('site', new MemorySingleton<SiteConfig>({ title: 'Akari' }))
        resolve()
      })
    })

    expect(await root.datasource.singleton('site').get()).toEqual({ title: 'Akari' })
    await root.datasource.singleton('site').set({ subtitle: 'Static site' })
    expect(await root.datasource.singleton('site').get()).toEqual({ title: 'Akari', subtitle: 'Static site' })
  })
})
