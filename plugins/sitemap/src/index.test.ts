import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Context } from 'cordis'
import { DataSource, MemoryDriver, TransformerService, RendererService, LayoutService, RouterService } from '@akari/core'
import * as engineNunjucks from '@akari/plugin-engine-nunjucks'
import type { PageRecord as Page, PostRecord as Post } from '@akari/plugin-source-fs'
import * as themeDefault from '@akari/plugin-theme-default'
import { generateSitemap } from './index.js'
import * as pluginSitemap from './index.js'

declare module '@akari/core' {
  interface ListCollections {
    posts: Post
    pages: Page
  }
}

describe('plugin-sitemap', () => {
  describe('generateSitemap', () => {
    it('generates valid sitemap XML', () => {
      const posts = [
        {
          id: 1, slug: 'hello-world', title: 'Hello World',
          content: 'content', published: true, status: 'published' as const,
          date: new Date('2024-06-15'), updated: new Date('2024-06-15'),
          sourceType: 'test', layout: 'post', tags: [], categories: [], meta: {},
        },
      ]
      const pages = [
        {
          id: 1, slug: 'about', title: 'About',
          content: 'about', sourceType: 'test', layout: 'page',
          date: new Date('2024-06-01'), updated: new Date('2024-06-01'),
          meta: {},
        },
      ]

      const xml = generateSitemap(posts, pages, {
        hostname: 'https://example.com',
        changefreq: 'weekly',
        priority: 0.5,
        output: 'sitemap.xml',
        permalink: ':year/:month/:day/:slug/',
      })

      expect(xml).toContain('<?xml version="1.0"')
      expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
      expect(xml).toContain('<loc>https://example.com/</loc>')
      expect(xml).toContain('<loc>https://example.com/2024/06/15/hello-world/</loc>')
      expect(xml).toContain('<loc>https://example.com/about/</loc>')
      expect(xml).toContain('<loc>https://example.com/archives/</loc>')
      expect(xml).toContain('<loc>https://example.com/tags/</loc>')
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

      const xml = generateSitemap(posts, [], {
        hostname: 'https://example.com',
        changefreq: 'weekly',
        priority: 0.5,
        output: 'sitemap.xml',
        permalink: ':year/:month/:day/:slug/',
      })

      expect(xml).toContain('published')
      expect(xml).not.toContain('/draft/')
    })

    it('includes lastmod for posts and pages', () => {
      const posts = [
        {
          id: 1, slug: 'test', title: 'Test',
          content: 'text', published: true, status: 'published' as const,
          date: new Date('2024-06-15'), updated: new Date('2024-06-20'),
          sourceType: 'test', layout: 'post', tags: [], categories: [], meta: {},
        },
      ]

      const xml = generateSitemap(posts, [], {
        hostname: 'https://example.com',
        changefreq: 'weekly',
        priority: 0.5,
        output: 'sitemap.xml',
        permalink: ':year/:month/:day/:slug/',
      })

      expect(xml).toContain('<lastmod>2024-06-20</lastmod>')
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
      ctx.plugin(pluginSitemap, {
        hostname: 'https://example.com',
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

    it('generates sitemap.xml during site generation', async () => {
      await ctx.datasource.collection('posts').create({
        title: 'Sitemap Test Post',
        slug: 'sitemap-test',
        content: 'Hello from sitemap',
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

      await ctx.datasource.collection('pages').create({
        title: 'About',
        slug: 'about',
        content: 'About page',
        sourceType: 'test',
        layout: 'page',
        date: new Date('2024-06-15'),
        updated: new Date('2024-06-15'),
        meta: {},
      })

      await ctx.router.refresh()
      const result = await ctx.router.render('/sitemap.xml')
      expect(result).not.toBeNull()
      const sitemapXml = result!.content
      expect(sitemapXml).toContain('<?xml version="1.0"')
      expect(sitemapXml).toContain('sitemap-test')
      expect(sitemapXml).toContain('about')
      expect(sitemapXml).toContain('https://example.com/')
    })
  })
})
