import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Context } from 'cordis'
import { DataSource, MemoryDriver, TransformerService, RendererService, LayoutService, RouterService } from '@akari/core'
import * as engineNunjucks from '@akari/plugin-engine-nunjucks'
import type { PageRecord as Page, PostRecord as Post } from '@akari/plugin-source-fs'
import * as themeDefault from '@akari/plugin-theme-default'
import { generateRss } from './index.js'
import * as pluginRss from './index.js'

declare module '@akari/core' {
  interface ListCollections {
    posts: Post
    pages: Page
  }
}

describe('plugin-rss', () => {
  describe('generateRss', () => {
    it('generates valid RSS XML from posts', () => {
      const posts = [
        {
          id: 1, slug: 'hello-world', title: 'Hello World',
          content: 'Hello content', html: '<p>Hello content</p>',
          published: true, status: 'published' as const,
          date: new Date('2024-06-15'), updated: new Date('2024-06-15'),
          sourceType: 'test', layout: 'post', tags: [], categories: [],
          meta: {},
        },
        {
          id: 2, slug: 'second-post', title: 'Second Post',
          content: 'Second content', html: '<p>Second content</p>',
          published: true, status: 'published' as const,
          date: new Date('2024-06-10'), updated: new Date('2024-06-10'),
          sourceType: 'test', layout: 'post', tags: ['test'], categories: ['blog'],
          meta: {},
        },
      ]

      const xml = generateRss(posts, {
        title: 'Test Blog',
        description: 'A test blog',
        link: 'https://example.com',
        language: 'en',
        limit: 20,
        output: 'rss.xml',
        permalink: ':year/:month/:day/:slug/',
      })

      expect(xml).toContain('<?xml version="1.0"')
      expect(xml).toContain('<rss version="2.0"')
      expect(xml).toContain('<title>Test Blog</title>')
      expect(xml).toContain('<title>Hello World</title>')
      expect(xml).toContain('<title>Second Post</title>')
      expect(xml).toContain('<link>https://example.com/2024/06/15/hello-world/</link>')
      expect(xml).toContain('<category>blog</category>')
      expect(xml).toContain('<description><![CDATA[<p>Hello content</p>]]></description>')
    })

    it('respects limit config', () => {
      const posts = Array.from({ length: 5 }, (_, i) => ({
        id: i + 1, slug: `post-${i}`, title: `Post ${i}`,
        content: `Content ${i}`, published: true, status: 'published' as const,
        date: new Date(`2024-06-${String(15 - i).padStart(2, '0')}`),
        updated: new Date(`2024-06-${String(15 - i).padStart(2, '0')}`),
        sourceType: 'test', layout: 'post', tags: [], categories: [], meta: {},
      }))

      const xml = generateRss(posts, {
        title: 'Test', description: '', link: 'https://example.com',
        language: 'en', limit: 2, output: 'rss.xml',
        permalink: ':year/:month/:day/:slug/',
      })

      const itemCount = (xml.match(/<item>/g) || []).length
      expect(itemCount).toBe(2)
    })

    it('excludes draft posts', () => {
      const posts = [
        {
          id: 1, slug: 'published', title: 'Published',
          content: 'text', published: true, status: 'published' as const,
          date: new Date('2024-06-15'), updated: new Date('2024-06-15'),
          sourceType: 'test', layout: 'post', tags: [], categories: [], meta: {},
        },
        {
          id: 2, slug: 'draft', title: 'Draft',
          content: 'text', published: false, status: 'draft' as const,
          date: new Date('2024-06-14'), updated: new Date('2024-06-14'),
          sourceType: 'test', layout: 'post', tags: [], categories: [], meta: {},
        },
      ]

      const xml = generateRss(posts, {
        title: 'Test', description: '', link: 'https://example.com',
        language: 'en', limit: 20, output: 'rss.xml',
        permalink: ':year/:month/:day/:slug/',
      })

      expect(xml).toContain('Published')
      expect(xml).not.toContain('<title>Draft</title>')
    })

    it('escapes special XML characters in titles', () => {
      const posts = [
        {
          id: 1, slug: 'special', title: 'Post with <special> & "chars"',
          content: 'text', published: true, status: 'published' as const,
          date: new Date('2024-06-15'), updated: new Date('2024-06-15'),
          sourceType: 'test', layout: 'post', tags: [], categories: [], meta: {},
        },
      ]

      const xml = generateRss(posts, {
        title: 'Test', description: '', link: 'https://example.com',
        language: 'en', limit: 20, output: 'rss.xml',
        permalink: ':year/:month/:day/:slug/',
      })

      expect(xml).toContain('&lt;special&gt;')
      expect(xml).toContain('&amp;')
    })
  })

  describe('integration with theme-default', () => {
    let ctx: Context

    beforeEach(async () => {
      ctx = new Context()
      ctx.plugin(DataSource)
      ctx.plugin(TransformerService)
      ctx.plugin(RendererService)
      ctx.plugin(LayoutService)
      ctx.plugin(RouterService)
      ctx.plugin(engineNunjucks)
      ctx.plugin(themeDefault, { permalink: ':year/:month/:day/:slug/' })
      ctx.plugin(pluginRss, {
        title: 'My Blog',
        description: 'Test blog',
        link: 'https://example.com',
      })

      await ctx.start()
      ctx.datasource.defineCollection('posts', new MemoryDriver<Post>())
      ctx.datasource.defineCollection('pages', new MemoryDriver<Page>())
      await new Promise<void>(resolve => {
        ctx.inject(['datasource', 'transformer', 'renderer', 'layout', 'router'], () => resolve())
      })

      ctx.transformer.register('markdown', (content) => ({
        content: `<p>${content}</p>`,
      }))
    }, 15000)

    afterEach(() => {
      ctx.stop()
    })

    it('generates rss.xml during site generation', async () => {
      await ctx.datasource.collection('posts').create({
        title: 'RSS Test Post',
        slug: 'rss-test',
        content: 'Hello from RSS',
        sourceType: 'test',
        date: new Date('2024-06-15'),
        updated: new Date('2024-06-15'),
        layout: 'post',
        tags: [],
        categories: [],
        meta: {},
        status: 'published',
        published: true,
      })

      await ctx.router.refresh()
      const result = await ctx.router.render('/rss.xml')
      expect(result).not.toBeNull()
      const rssXml = result!.content
      expect(rssXml).toContain('<?xml version="1.0"')
      expect(rssXml).toContain('RSS Test Post')
      expect(rssXml).toContain('My Blog')
    })
  })
})
