/**
 * @akari/core — Core services and datasource abstractions.
 *
 * Business data models are owned by plugins and registered into datasource.
 */

// Re-export cordis for consumer convenience
export { Context, Service, Schema } from 'cordis'
export type { Plugin } from 'cordis'

// Services
export * from './transformer.js'
export * from './template.js'
export * from './datasource.js'
export * from './renderer.js'
export * from './layout.js'
export * from './router.js'

// ---------------------------------------------------------------------------
// Legacy domain types (kept for backward compatibility)
// ---------------------------------------------------------------------------

export interface SourceFile {
  /** Relative path from the source directory. */
  path: string
  /** Raw file content. */
  raw: string
  /** Parsed front-matter fields. */
  frontMatter: Record<string, unknown>
  /** Body content after front-matter is stripped. */
  content: string
  createdAt: Date
  updatedAt: Date
}

export interface RenderContext {
  source: SourceFile
  /** Rendered HTML output. */
  html: string
  layout: string
  data: Record<string, unknown>
}

export interface SiteData {
  config: SiteConfig
  posts: SourceFile[]
  pages: SourceFile[]
  tags: Map<string, SourceFile[]>
  categories: Map<string, SourceFile[]>
}

export interface SiteConfig {
  title: string
  subtitle?: string
  description?: string
  author?: string
  url?: string
  /** URL root path, defaults to "/". */
  root?: string
  /** Permalink pattern, e.g. ":year/:month/:day/:title/". */
  permalink?: string
  /** Directory to read source files from. */
  sourceDir?: string
  /** Directory to write generated files to. */
  publicDir?: string
}
