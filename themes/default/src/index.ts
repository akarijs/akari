import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from 'cordis'
import type { RouteDefinition } from '@akari/core'
import type { PageRecord as Page, PostRecord as Post } from '@akari/plugin-source-fs'

declare module '@akari/core' {
  interface ListCollections {
    posts: Post
    pages: Page
  }
}

/** Post with a resolved URL for use in templates. */
interface TemplatePost extends Post {
  url: string
}

export const name = 'theme-default'
export const inject = ['layout', 'router', 'transformer', 'datasource']

export interface Config {
  postsPerPage?: number
  dateFormat?: string
  permalink?: string
  language?: string
}

function formatDate(date: Date | string, format?: string): string {
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return String(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  if (format === 'YYYY-MM-DD' || !format) {
    return `${year}-${month}-${day}`
  }
  return `${year}-${month}-${day}`
}

function isodate(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date)
  return d.toISOString()
}

function urlFor(path: string): string {
  return '/' + path.replace(/^\//, '')
}

function truncate(str: string, len: number): string {
  if (!str) return ''
  if (str.length <= len) return str
  return str.slice(0, len) + '...'
}

function resolvePermalink(pattern: string, post: Post): string {
  const d = post.date instanceof Date ? post.date : new Date(post.date)
  return pattern
    .replace(':year', String(d.getFullYear()))
    .replace(':month', String(d.getMonth() + 1).padStart(2, '0'))
    .replace(':day', String(d.getDate()).padStart(2, '0'))
    .replace(':slug', post.slug || 'untitled')
    .replace(':title', post.slug || 'untitled')
}

/** Fetch posts sorted by date desc, transform markdown, compute URLs and build tag/category indices. */
async function preparePosts(ctx: Context, config: Required<Config>) {
  const posts = await ctx.datasource.collection('posts').list({
    sort: [{ field: 'date', order: 'desc' }],
  })

  posts.sort((a, b) => {
    const da = a.date instanceof Date ? a.date.getTime() : new Date(a.date).getTime()
    const db = b.date instanceof Date ? b.date.getTime() : new Date(b.date).getTime()
    return db - da
  })

  const tagMap = new Map<string, TemplatePost[]>()
  const catMap = new Map<string, TemplatePost[]>()

  const templatePosts: TemplatePost[] = posts.map(post => ({
    ...post,
    url: urlFor(resolvePermalink(config.permalink, post)),
  }))

  for (const post of templatePosts) {
    if (!post.html && post.content) {
      const result = await ctx.transformer.transform('markdown', post.content)
      post.html = result.content
    }
    for (const tagName of (post.tags || [])) {
      if (!tagMap.has(tagName)) tagMap.set(tagName, [])
      tagMap.get(tagName)!.push(post)
    }
    for (const catName of (post.categories || [])) {
      if (!catMap.has(catName)) catMap.set(catName, [])
      catMap.get(catName)!.push(post)
    }
  }

  const tags = Array.from(tagMap.entries()).map(([name, entries], index) => ({
    id: index + 1,
    name,
    slug: name.toLowerCase().replace(/\s+/g, '-'),
    count: entries.length,
  }))
  const categories = Array.from(catMap.entries()).map(([name, entries], index) => ({
    id: index + 1,
    name,
    slug: name.toLowerCase().replace(/\s+/g, '-'),
    count: entries.length,
  }))

  return { templatePosts, tagMap, catMap, tags, categories }
}

export function apply(ctx: Context, config: Config = {}) {
  const defaultConfig: Required<Config> = {
    postsPerPage: config.postsPerPage ?? 10,
    dateFormat: config.dateFormat ?? 'YYYY-MM-DD',
    permalink: config.permalink ?? ':year/:month/:day/:slug/',
    language: config.language ?? 'en',
  }

  const __dirname = dirname(fileURLToPath(import.meta.url))
  const layoutDir = resolve(__dirname, '../layout')

  // Expose static source dir for server / build to serve/copy
  const sourceDir = resolve(__dirname, '../source')
  ctx.provide('theme.sourceDir', true)
  ;(ctx as any)['theme.sourceDir'] = sourceDir

  // ─── Register Layouts ────────────────────────────────────────────────
  const layouts = ['post', 'index', 'archive', 'tag', 'tags', 'categories', 'page'] as const
  for (const id of layouts) {
    ctx.layout.register(id, {
      renderer: 'nunjucks',
      template: resolve(layoutDir, `${id}.njk`),
    })
  }

  // ─── Register Helpers ────────────────────────────────────────────────
  ctx.layout.helper('formatDate', (date: Date | string, format?: string) =>
    formatDate(date, format || defaultConfig.dateFormat))
  ctx.layout.helper('isodate', isodate)
  ctx.layout.helper('url_for', urlFor)
  ctx.layout.helper('truncate', truncate)

  // ─── Route Generators ────────────────────────────────────────────────

  // 1. Post detail pages
  ctx.router.register('post-pages', {
    collections: ['posts'],
    async *generate(ctx: Context): AsyncGenerator<RouteDefinition> {
      const { templatePosts, tags, categories } = await preparePosts(ctx, defaultConfig)
      const pages = ctx.datasource.hasCollection('pages')
        ? await ctx.datasource.collection('pages').list({ sort: [{ field: 'date', order: 'desc' }] })
        : []
      const site = { posts: templatePosts, pages, tags, categories, time: new Date() }
      const siteConfig = { ...defaultConfig }

      for (let i = 0; i < templatePosts.length; i++) {
        const post = templatePosts[i]
        const permalink = resolvePermalink(defaultConfig.permalink, post)
        yield {
          path: permalink,
          layout: 'post',
          data: () => Promise.resolve({
            post,
            site,
            config: siteConfig,
            prev_post: templatePosts[i + 1] || null,
            next_post: templatePosts[i - 1] || null,
          }),
        }
      }
    },
  })

  // 2. Index pages (with pagination)
  ctx.router.register('index-pages', {
    collections: ['posts'],
    async *generate(ctx: Context): AsyncGenerator<RouteDefinition> {
      const { templatePosts, tags, categories } = await preparePosts(ctx, defaultConfig)
      const pages = ctx.datasource.hasCollection('pages')
        ? await ctx.datasource.collection('pages').list({ sort: [{ field: 'date', order: 'desc' }] })
        : []
      const site = { posts: templatePosts, pages, tags, categories, time: new Date() }
      const siteConfig = { ...defaultConfig }

      const publishedPosts = templatePosts.filter(p => p.published !== false && p.status === 'published')
      const totalPages = Math.max(1, Math.ceil(publishedPosts.length / defaultConfig.postsPerPage))

      for (let page = 0; page < totalPages; page++) {
        const start = page * defaultConfig.postsPerPage
        const pagePosts = publishedPosts.slice(start, start + defaultConfig.postsPerPage)
        const path = page === 0 ? '/' : `/page/${page + 1}/`

        yield {
          path,
          layout: 'index',
          data: () => Promise.resolve({
            posts: pagePosts,
            site,
            config: siteConfig,
            pagination: {
              current: page + 1,
              total: totalPages,
              prev: page > 0 ? (page === 1 ? '/' : `/page/${page}/`) : null,
              next: page < totalPages - 1 ? `/page/${page + 2}/` : null,
            },
          }),
        }
      }
    },
  })

  // 3. Archive page
  ctx.router.register('archive', {
    collections: ['posts'],
    async *generate(ctx: Context): AsyncGenerator<RouteDefinition> {
      const { templatePosts, tags, categories } = await preparePosts(ctx, defaultConfig)
      const pages = ctx.datasource.hasCollection('pages')
        ? await ctx.datasource.collection('pages').list({ sort: [{ field: 'date', order: 'desc' }] })
        : []
      const site = { posts: templatePosts, pages, tags, categories, time: new Date() }
      const siteConfig = { ...defaultConfig }
      const publishedPosts = templatePosts.filter(p => p.published !== false && p.status === 'published')

      yield {
        path: '/archives/',
        layout: 'archive',
        data: () => Promise.resolve({
          posts: publishedPosts,
          site,
          config: siteConfig,
        }),
      }
    },
  })

  // 4. Tag pages
  ctx.router.register('tag-pages', {
    collections: ['posts'],
    async *generate(ctx: Context): AsyncGenerator<RouteDefinition> {
      const { templatePosts, tagMap, tags, categories } = await preparePosts(ctx, defaultConfig)
      const pages = ctx.datasource.hasCollection('pages')
        ? await ctx.datasource.collection('pages').list({ sort: [{ field: 'date', order: 'desc' }] })
        : []
      const site = { posts: templatePosts, pages, tags, categories, time: new Date() }
      const siteConfig = { ...defaultConfig }

      // Tags listing page
      yield {
        path: '/tags/',
        layout: 'tags',
        data: () => Promise.resolve({
          tags: Array.from(tagMap.entries()).map(([name, posts]) => ({
            name,
            slug: name.toLowerCase().replace(/\s+/g, '-'),
            count: posts.length,
          })),
          site,
          config: siteConfig,
        }),
      }

      // Individual tag pages
      for (const [tagName, tagPosts] of tagMap) {
        yield {
          path: `/tags/${tagName.toLowerCase().replace(/\s+/g, '-')}/`,
          layout: 'tag',
          data: () => Promise.resolve({
            tag: { name: tagName, slug: tagName.toLowerCase().replace(/\s+/g, '-') },
            posts: tagPosts,
            site,
            config: siteConfig,
          }),
        }
      }
    },
  })

  // 5. Category pages
  ctx.router.register('category-pages', {
    collections: ['posts'],
    async *generate(ctx: Context): AsyncGenerator<RouteDefinition> {
      const { templatePosts, catMap, tags, categories } = await preparePosts(ctx, defaultConfig)
      const pages = ctx.datasource.hasCollection('pages')
        ? await ctx.datasource.collection('pages').list({ sort: [{ field: 'date', order: 'desc' }] })
        : []
      const site = { posts: templatePosts, pages, tags, categories, time: new Date() }
      const siteConfig = { ...defaultConfig }

      yield {
        path: '/categories/',
        layout: 'categories',
        data: () => Promise.resolve({
          categories: Array.from(catMap.entries()).map(([name, posts]) => ({
            name,
            slug: name.toLowerCase().replace(/\s+/g, '-'),
            count: posts.length,
          })),
          site,
          config: siteConfig,
        }),
      }
    },
  })

  // 6. Static pages (about, etc.)
  ctx.router.register('static-pages', {
    collections: ['pages'],
    async *generate(ctx: Context): AsyncGenerator<RouteDefinition> {
      if (!ctx.datasource.hasCollection('pages')) return

      const pageRecords = await ctx.datasource.collection('pages').list({
        sort: [{ field: 'date', order: 'desc' }],
      })

      const { templatePosts, tags, categories } = await preparePosts(ctx, defaultConfig)
      const site = { posts: templatePosts, pages: pageRecords, tags, categories, time: new Date() }
      const siteConfig = { ...defaultConfig }

      for (const page of pageRecords) {
        yield {
          path: `/${page.slug}/`,
          layout: page.layout || 'page',
          data: async () => {
            if (!page.html && page.content) {
              const result = await ctx.transformer.transform('markdown', page.content)
              page.html = result.content
            }
            return { page, site, config: siteConfig }
          },
        }
      }
    },
  })
}
