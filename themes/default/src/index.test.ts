import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Context } from 'cordis'
import { DataSource, MemoryDriver, TransformerService, RendererService, LayoutService, RouterService } from '@akari/core'
import * as engineNunjucks from '@akari/plugin-engine-nunjucks'
import type { PageRecord as Page, PostRecord as Post } from '@akari/plugin-source-fs'
import * as themeDefault from './index.js'

declare module '@akari/core' {
  interface ListCollections {
    posts: Post
    pages: Page
  }
}

describe('theme-default', () => {
  let ctx: Context

  beforeEach(async () => {
    ctx = new Context()
    ctx.plugin(DataSource)
    ctx.plugin(TransformerService)
    ctx.plugin(RendererService)
    ctx.plugin(LayoutService)
    ctx.plugin(RouterService)
    ctx.plugin(engineNunjucks)

    // Register the theme
    ctx.plugin(themeDefault, {
      postsPerPage: 5,
      permalink: ':year/:month/:day/:slug/',
    })

    await ctx.start()

    // Wait for all services including the theme to be ready
    await new Promise<void>(resolve => {
      ctx.inject(['datasource', 'transformer', 'renderer', 'layout', 'router'], () => resolve())
    })

    ctx.datasource.defineCollection('posts', new MemoryDriver<Post>())
    ctx.datasource.defineCollection('pages', new MemoryDriver<Page>())

    // Register a simple markdown transformer
    ctx.transformer.register('markdown', (content) => ({
      content: `<p>${content}</p>`,
    }))
  }, 15000)

  afterEach(() => {
    ctx.stop()
  })

  it('generates index page', async () => {
    await ctx.datasource.collection('posts').create({
      title: 'Test Post',
      slug: 'test-post',
      content: 'Hello world',
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
    const result = await ctx.router.render('/')
    expect(result).not.toBeNull()
    const indexHtml = result!.content
    expect(indexHtml).toContain('Test Post')
    // Verify links use permalink format, not bare slug
    expect(indexHtml).toContain('href="/2024/06/15/test-post/"')
    expect(indexHtml).not.toContain('href="/test-post/"')
  })

  it('generates post detail page', async () => {
    await ctx.datasource.collection('posts').create({
      title: 'My Post',
      slug: 'my-post',
      content: 'Post content here',
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
    const result = await ctx.router.render('/2024/06/15/my-post/')
    expect(result).not.toBeNull()
    const postHtml = result!.content
    expect(postHtml).toContain('My Post')
    expect(postHtml).toContain('<p>Post content here</p>')
  })

  it('generates archive page', async () => {
    await ctx.datasource.collection('posts').create({
      title: 'Archived Post',
      slug: 'archived',
      content: 'content',
      sourceType: 'test',
      date: new Date('2024-01-01'),
      updated: new Date('2024-01-01'),
      layout: 'post',
      tags: [],
      categories: [],
      meta: {},
      status: 'published',
      published: true,
    })

    await ctx.router.refresh()
    const result = await ctx.router.render('/archives/')
    expect(result).not.toBeNull()
    const archiveHtml = result!.content
    expect(archiveHtml).toContain('Archived Post')
    expect(archiveHtml).toContain('Archives')
    // Verify archive links use permalink format
    expect(archiveHtml).toContain('href="/2024/01/01/archived/"')
    expect(archiveHtml).not.toContain('href="/archived/"')
  })

  it('generates tag pages', async () => {
    await ctx.datasource.collection('posts').create({
      title: 'Tagged Post',
      slug: 'tagged',
      content: 'content',
      sourceType: 'test',
      date: new Date('2024-01-01'),
      updated: new Date('2024-01-01'),
      layout: 'post',
      tags: ['javascript'],
      categories: [],
      meta: {},
      status: 'published',
      published: true,
    })

    await ctx.router.refresh()
    const result = await ctx.router.render('/tags/')
    expect(result).not.toBeNull()
    const tagsHtml = result!.content
    expect(tagsHtml).toContain('javascript')
  })
})
