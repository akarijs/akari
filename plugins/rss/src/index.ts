import { Context } from 'cordis'
import type { PostRecord as Post } from '@akari/plugin-source-fs'

export const name = 'rss'
export const inject = ['router', 'datasource']

export interface Config {
  /** Site title shown in the RSS channel. */
  title?: string
  /** Site description. */
  description?: string
  /** Base URL of the site, e.g. "https://example.com". */
  link?: string
  /** Feed language (default: "en"). */
  language?: string
  /** Maximum number of items in the feed (default: 20). */
  limit?: number
  /** Output file path relative to the output directory (default: "rss.xml"). */
  output?: string
  /** Permalink pattern, used to build full URLs. */
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

function buildItemUrl(link: string, permalink: string, post: Post): string {
  const base = link.replace(/\/+$/, '')
  const d = post.date instanceof Date ? post.date : new Date(post.date)
  const path = permalink
    .replace(':year', String(d.getFullYear()))
    .replace(':month', String(d.getMonth() + 1).padStart(2, '0'))
    .replace(':day', String(d.getDate()).padStart(2, '0'))
    .replace(':slug', post.slug || 'untitled')
    .replace(':title', post.slug || 'untitled')
  return `${base}/${path.replace(/^\//, '')}`
}

function toRfc822(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date)
  return d.toUTCString()
}

export function generateRss(posts: Post[], config: Required<Config>): string {
  const items = posts
    .filter(p => p.published !== false && p.status === 'published')
    .sort((a, b) => {
      const da = a.date instanceof Date ? a.date.getTime() : new Date(a.date).getTime()
      const db = b.date instanceof Date ? b.date.getTime() : new Date(b.date).getTime()
      return db - da
    })
    .slice(0, config.limit)

  const itemsXml = items.map(post => {
    const url = buildItemUrl(config.link, config.permalink, post)
    const description = post.excerpt || post.html || escapeXml(post.content).slice(0, 200)
    return `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid>${escapeXml(url)}</guid>
      <pubDate>${toRfc822(post.date)}</pubDate>
      <description><![CDATA[${description}]]></description>${
        post.categories?.length
          ? post.categories.map(c => `\n      <category>${escapeXml(c)}</category>`).join('')
          : ''
      }
    </item>`
  }).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(config.title)}</title>
    <link>${escapeXml(config.link)}</link>
    <description>${escapeXml(config.description)}</description>
    <language>${config.language}</language>
    <lastBuildDate>${toRfc822(new Date())}</lastBuildDate>
    <atom:link href="${escapeXml(config.link)}/${config.output}" rel="self" type="application/rss+xml"/>
${itemsXml}
  </channel>
</rss>
`
}

export function apply(ctx: Context, config: Config = {}) {
  const resolvedConfig: Required<Config> = {
    title: config.title ?? 'Akari Blog',
    description: config.description ?? '',
    link: config.link ?? 'https://example.com',
    language: config.language ?? 'en',
    limit: config.limit ?? 20,
    output: config.output ?? 'rss.xml',
    permalink: config.permalink ?? ':year/:month/:day/:slug/',
  }

  ctx.router.register('rss', {
    collections: ['posts'],
    async generate(ctx) {
      const posts = await ctx.datasource.collection('posts').list({
        sort: [{ field: 'date', order: 'desc' }],
      })
      return [{
        path: `/${resolvedConfig.output}`,
        type: 'application/xml',
        render: () => Promise.resolve(generateRss(posts, resolvedConfig)),
      }]
    },
  })
}
