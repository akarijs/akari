import { Context } from 'cordis'
import type { PageRecord as Page, PostRecord as Post } from '@akari/plugin-source-fs'

export const name = 'sitemap'
export const inject = ['router', 'datasource']

export interface Config {
  /** Base URL of the site, e.g. "https://example.com". */
  hostname?: string
  /** Default change frequency (default: "weekly"). */
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'
  /** Default priority (default: 0.5). */
  priority?: number
  /** Output file path relative to the output directory (default: "sitemap.xml"). */
  output?: string
  /** Permalink pattern for post URLs. */
  permalink?: string
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function buildPostUrl(hostname: string, permalink: string, post: Post): string {
  const base = hostname.replace(/\/+$/, '')
  const d = post.date instanceof Date ? post.date : new Date(post.date)
  const path = permalink
    .replace(':year', String(d.getFullYear()))
    .replace(':month', String(d.getMonth() + 1).padStart(2, '0'))
    .replace(':day', String(d.getDate()).padStart(2, '0'))
    .replace(':slug', post.slug || 'untitled')
    .replace(':title', post.slug || 'untitled')
  return `${base}/${path.replace(/^\//, '')}`
}

function toW3CDate(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date)
  return d.toISOString().split('T')[0]
}

interface SitemapEntry {
  loc: string
  lastmod?: string
  changefreq?: string
  priority?: number
}

export function generateSitemap(
  posts: Post[],
  pages: Page[],
  config: Required<Config>,
): string {
  const entries: SitemapEntry[] = []

  // Home page
  entries.push({
    loc: config.hostname.replace(/\/+$/, '') + '/',
    changefreq: 'daily',
    priority: 1.0,
  })

  // Published posts
  const publishedPosts = posts
    .filter(p => p.published !== false && p.status === 'published')
    .sort((a, b) => {
      const da = a.date instanceof Date ? a.date.getTime() : new Date(a.date).getTime()
      const db = b.date instanceof Date ? b.date.getTime() : new Date(b.date).getTime()
      return db - da
    })

  for (const post of publishedPosts) {
    entries.push({
      loc: buildPostUrl(config.hostname, config.permalink, post),
      lastmod: toW3CDate(post.updated || post.date),
      changefreq: config.changefreq,
      priority: 0.8,
    })
  }

  // Pages
  for (const page of pages) {
    const base = config.hostname.replace(/\/+$/, '')
    entries.push({
      loc: `${base}/${page.slug}/`,
      lastmod: toW3CDate(page.updated || page.date),
      changefreq: 'monthly',
      priority: 0.6,
    })
  }

  // Archive page
  entries.push({
    loc: config.hostname.replace(/\/+$/, '') + '/archives/',
    changefreq: 'weekly',
    priority: 0.5,
  })

  // Tags page
  entries.push({
    loc: config.hostname.replace(/\/+$/, '') + '/tags/',
    changefreq: 'weekly',
    priority: 0.5,
  })

  const urlEntries = entries.map(entry => {
    let xml = `  <url>\n    <loc>${escapeXml(entry.loc)}</loc>`
    if (entry.lastmod) xml += `\n    <lastmod>${entry.lastmod}</lastmod>`
    if (entry.changefreq) xml += `\n    <changefreq>${entry.changefreq}</changefreq>`
    if (entry.priority !== undefined) xml += `\n    <priority>${entry.priority}</priority>`
    xml += '\n  </url>'
    return xml
  }).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>
`
}

export function apply(ctx: Context, config: Config = {}) {
  const resolvedConfig: Required<Config> = {
    hostname: config.hostname ?? 'https://example.com',
    changefreq: config.changefreq ?? 'weekly',
    priority: config.priority ?? 0.5,
    output: config.output ?? 'sitemap.xml',
    permalink: config.permalink ?? ':year/:month/:day/:slug/',
  }

  ctx.router.register('sitemap', {
    collections: ['posts', 'pages'],
    async generate(ctx) {
      const posts = await ctx.datasource.collection('posts').list({
        sort: [{ field: 'date', order: 'desc' }],
      })
      const pages = ctx.datasource.hasCollection('pages')
        ? await ctx.datasource.collection('pages').list()
        : []
      return [{
        path: `/${resolvedConfig.output}`,
        type: 'application/xml',
        render: () => Promise.resolve(generateSitemap(posts, pages, resolvedConfig)),
      }]
    },
  })
}
