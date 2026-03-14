/**
 * bootstrap — Create and configure a Cordis context from a config object.
 *
 * Reads plugin configuration from the YAML config and loads each plugin
 * with its options. Core services (Database, TransformerService,
 * TemplateService, ContentService) are always loaded.
 */

import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from 'cordis'
import { Database } from 'minato'
import MemoryDriver from '@minatojs/driver-memory'
import { TransformerService, TemplateService } from '@akari/core'
import { ContentService } from '@akari/plugin-content'

/** Map of known plugin short names to their import specifiers. */
const BUILTIN_PLUGINS: Record<string, string> = {
  'transformer-markdown': '@akari/plugin-transformer-markdown',
  'engine-nunjucks': '@akari/plugin-engine-nunjucks',
  'source-fs': '@akari/plugin-source-fs',
  'theme-default': '@akari/plugin-theme-default',
  'rss': '@akari/plugin-rss',
  'sitemap': '@akari/plugin-sitemap',
  'server': '@akari/plugin-server',
  'console': '@akari/plugin-console',
  'console-editor': '@akari/plugin-console-editor',
  'console-explorer': '@akari/plugin-console-explorer',
  'console-market': '@akari/plugin-console-market',
  'hmr': '@akari/plugin-hmr',
}

/** Non-plugin top-level config keys. */
const RESERVED_KEYS = new Set(['build', '_mode'])

export interface AkariConfig {
  build?: {
    outputDir?: string
  }
  server?: {
    port?: number
    host?: string
    staticDir?: string
  }
  _mode?: 'dev' | 'build'
  [pluginName: string]: any
}

/**
 * Bootstrap a Cordis context with all plugins specified in the config.
 *
 * @param config - Parsed YAML config object
 * @param baseDir - Working directory (for resolving relative paths)
 */
export async function bootstrap(config: AkariConfig, baseDir: string): Promise<Context> {
  const ctx = new Context()
  const runtimeDir = dirname(fileURLToPath(import.meta.url))

  // In start/dev mode, ensure the minimum runtime stack is available.
  if (config._mode === 'dev') {
    config.server ??= {}
    config.console ??= {}
    config['console-editor'] ??= {}
    config['console-explorer'] ??= { rootDir: baseDir }
    config['console-market'] ??= {}
  }

  // Core infrastructure — always loaded
  ctx.plugin(Database as any)
  ctx.plugin(MemoryDriver)
  ctx.plugin(TransformerService)
  ctx.plugin(TemplateService)
  ctx.plugin(ContentService)

  // Load plugins from config
  for (const [key, value] of Object.entries(config)) {
    if (RESERVED_KEYS.has(key)) continue

    const pluginConfig = value && typeof value === 'object' ? value : {}
    const specifier = BUILTIN_PLUGINS[key]
    if (!specifier) {
      // Try to import as-is (e.g. third-party plugins by package name)
      try {
        const mod = await import(key)
        ctx.plugin(mod.default ?? mod, pluginConfig)
      } catch {
        console.warn(`⚠️  Unknown plugin: ${key} (skipped)`)
      }
      continue
    }

    // Resolve source-fs paths relative to baseDir
    if (key === 'source-fs' && pluginConfig.sourceDir) {
      pluginConfig.sourceDir = resolve(baseDir, pluginConfig.sourceDir)
    }

    let mod: any
    try {
      mod = await import(specifier)
    } catch (error) {
      if (specifier.startsWith('@akari/plugin-')) {
        const pluginName = specifier.slice('@akari/plugin-'.length)
        const localEntry = resolve(runtimeDir, `../../../plugins/${pluginName}/dist/index.js`)
        mod = await import(pathToFileURL(localEntry).href)
      } else {
        throw error
      }
    }
    ctx.plugin(mod.default ?? mod, pluginConfig)
  }

  // Start the context (triggers plugin initialization)
  await ctx.start()

  // Wait for core services to be ready
  await new Promise<void>(r => {
    ctx.inject(['content', 'transformer', 'template'], () => r())
  })

  // Allow source-fs initial sync to complete.
  // TODO: replace with a ready event from source-fs once available.
  await new Promise(r => setTimeout(r, 200))

  return ctx
}
