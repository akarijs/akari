/**
 * Loader — Find, read and parse Akari configuration files.
 *
 * Inspired by @koishijs/loader. Supports YAML (.yml, .yaml) and JSON (.json)
 * config formats. Searches for `akari.config.*` in the working directory.
 */

import { readFileSync, readdirSync, existsSync, watch, type FSWatcher } from 'node:fs'
import { resolve, extname, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { load as yamlLoad } from 'js-yaml'
import * as dotenv from 'dotenv'
import { Context } from 'cordis'
import { Database } from 'minato'
import MemoryDriver from '@minatojs/driver-memory'
import { TemplateService, TransformerService } from '@akari/core'
import { ContentService } from '@akari/plugin-content'

/** MIME types for supported writable config formats. */
const writable: Record<string, string> = {
  '.json': 'application/json',
  '.yaml': 'application/yaml',
  '.yml': 'application/yaml',
}

const supportedExtensions = new Set(Object.keys(writable))

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

const RESERVED_KEYS = new Set(['build', '_mode', 'plugins', 'name'])

type Dict = Record<string, any>

function separate(source: any, isGroup = false): [Dict, Dict] {
  const config: Dict = {}
  const meta: Dict = {}
  for (const [key, value] of Object.entries(source || {})) {
    if (key.startsWith('$')) {
      meta[key] = value
    } else {
      config[key] = value
    }
  }
  return [isGroup ? (source || {}) : config, meta]
}

export class Loader {
  static readonly exitCode = 51

  /** Resolved absolute path of the config file. */
  public filename!: string
  /** Base directory (dirname of the config file). */
  public baseDir!: string
  /** MIME type of the config file. */
  public mime!: string
  /** Parsed config object. */
  public config!: Record<string, any>
  /** Created Cordis app context. */
  public app?: Context

  /** Environment files loaded before readConfig(). */
  public envFiles: string[] = []
  /** Environment keys injected by this loader. */
  public localKeys: string[] = []

  private forks: Record<string, any> = Object.create(null)
  private cache: Dict = Object.create(null)
  private initialEnvKeys = new Set(Object.getOwnPropertyNames(process.env))
  private currentMode?: 'dev' | 'build'
  private watchers: FSWatcher[] = []
  private watchTimer?: NodeJS.Timeout

  /**
   * Initialize the loader.
   *
   * @param filename - Optional explicit path to a config file.
   *                   When omitted the loader searches the base directory
   *                   for `akari.config.{yml,yaml,json}`.
   * @param baseDir  - Working directory for config discovery (defaults to
   *                   `process.cwd()`).
   */
  init(filename?: string, baseDir?: string): void {
    if (filename) {
      const resolved = resolve(filename)
      if (!existsSync(resolved)) {
        throw new Error(`config file not found: ${resolved}`)
      }
      const ext = extname(resolved)
      if (!supportedExtensions.has(ext)) {
        throw new Error(`extension "${ext}" not supported`)
      }
      this.filename = resolved
      this.baseDir = dirname(resolved)
      this.mime = writable[ext]
    } else {
      this.baseDir = baseDir ?? process.cwd()
      this.findConfig()
    }

    this.envFiles = [
      resolve(this.baseDir, '.env'),
      resolve(this.baseDir, '.env.local'),
    ]
  }

  /**
   * Search the base directory for a known config file name.
   */
  private findConfig(): void {
    let files: string[]
    try {
      files = readdirSync(this.baseDir)
    } catch {
      throw new Error(`cannot read directory: ${this.baseDir}`)
    }

    for (const basename of ['akari.config']) {
      for (const ext of supportedExtensions) {
        if (files.includes(basename + ext)) {
          this.mime = writable[ext]
          this.filename = resolve(this.baseDir, basename + ext)
          return
        }
      }
    }

    throw new Error('config file not found')
  }

  /**
   * Read and parse the configuration file.
   *
   * @returns The parsed config object.
   */
  readConfig(): Record<string, any> {
    this.loadEnv()
    const raw = readFileSync(this.filename, 'utf-8')

    if (this.mime === 'application/yaml') {
      this.config = yamlLoad(raw) as Record<string, any>
    } else if (this.mime === 'application/json') {
      this.config = JSON.parse(raw) as Record<string, any>
    } else {
      throw new Error(`unsupported mime type: ${this.mime}`)
    }

    if (!this.config || typeof this.config !== 'object' || Array.isArray(this.config)) {
      throw new Error(`invalid config file: ${this.filename}`)
    }

    this.config = this.normalizeConfig(this.config)

    return this.config
  }

  private loadEnv() {
    for (const key of this.localKeys) {
      delete process.env[key]
    }

    const parsed: Dict = {}
    for (const filename of this.envFiles) {
      if (!existsSync(filename)) continue
      const raw = readFileSync(filename, 'utf8')
      Object.assign(parsed, dotenv.parse(raw))
    }

    this.localKeys = []
    for (const [key, value] of Object.entries(parsed)) {
      if (this.initialEnvKeys.has(key)) continue
      process.env[key] = value
      this.localKeys.push(key)
    }
  }

  private normalizeConfig(config: Dict): Dict {
    if (config.plugins && typeof config.plugins === 'object' && !Array.isArray(config.plugins)) {
      return config
    }

    const plugins: Dict = {}
    for (const [key, value] of Object.entries(config)) {
      if (RESERVED_KEYS.has(key) || key.startsWith('$')) continue
      plugins[key] = value
    }
    return {
      ...config,
      plugins,
    }
  }

  private prepareConfig(mode: 'dev' | 'build' | undefined): Dict {
    const config = structuredClone(this.config)

    if (mode === 'dev') {
      config.server ??= {}
      config.console ??= {}
      config['console-editor'] ??= {}
      config['console-explorer'] ??= { rootDir: this.baseDir }
      config['console-market'] ??= {}
      config.plugins = {
        ...config.plugins,
        server: config.server,
        console: config.console,
        'console-editor': config['console-editor'],
        'console-explorer': config['console-explorer'],
        'console-market': config['console-market'],
      }
    }

    return this.normalizeConfig(config)
  }

  async createApp(mode?: 'dev' | 'build'): Promise<Context> {
    if (!this.config) this.readConfig()

    this.currentMode = mode
    const config = this.prepareConfig(mode)
    const app = this.app = new Context(config)
    app.provide('loader', this, true)
    app.provide('baseDir', this.baseDir, true)

    app.plugin(Database as any)
    app.plugin(MemoryDriver)
    app.plugin(TransformerService)
    app.plugin(TemplateService)
    app.plugin(ContentService)

    await this.reloadGroup(app, config.plugins)

    app.accept(['plugins'], (newConfig) => {
      void this.reloadGroup(app, this.normalizeConfig(newConfig).plugins)
    }, { passive: true })

    await app.start()

    await new Promise<void>((resolveReady) => {
      app.inject(['content', 'transformer', 'template'], () => resolveReady())
    })

    return app
  }

  async reloadConfig() {
    this.readConfig()
    if (!this.app) return this.config

    const config = this.prepareConfig(this.currentMode)
    await this.reloadGroup(this.app, config.plugins)
    this.app.scope.update(config, false)
    return this.config
  }

  watchConfig(options: {
    debounce?: number
    fullReload?: boolean
    onReload?: () => void | Promise<void>
  } = {}) {
    this.stopWatchingConfig()

    const debounce = options.debounce ?? 300
    const files = [this.filename, ...this.envFiles]
      .filter(file => existsSync(file))

    const trigger = () => {
      if (this.watchTimer) clearTimeout(this.watchTimer)
      this.watchTimer = setTimeout(async () => {
        this.watchTimer = undefined
        try {
          if (options.fullReload) {
            this.fullReload()
            return
          }
          await this.reloadConfig()
          await options.onReload?.()
        } catch (error) {
          console.error('❌ failed to reload config')
          console.error(error)
        }
      }, debounce)
    }

    for (const file of files) {
      const watcher = watch(file, { persistent: true }, trigger)
      this.watchers.push(watcher)
    }

    return () => this.stopWatchingConfig()
  }

  stopWatchingConfig() {
    if (this.watchTimer) {
      clearTimeout(this.watchTimer)
      this.watchTimer = undefined
    }
    for (const watcher of this.watchers) {
      watcher.close()
    }
    this.watchers = []
  }

  fullReload(code = Loader.exitCode) {
    process.send?.({ type: 'reload' })
    process.exit(code)
  }

  async reloadGroup(parent: Context, plugins: Dict = {}) {
    const keys = new Set<string>([
      ...Object.keys(this.forks),
      ...Object.keys(plugins),
    ])

    for (const key of keys) {
      if (key.startsWith('$')) continue

      if (!(key in plugins) || key.startsWith('~')) {
        this.unload(key)
        continue
      }

      await this.reload(parent, key, plugins[key] ?? {})
    }
  }

  private isTruthyLike(expr: any): boolean {
    if (expr === null || expr === undefined) return true
    if (typeof expr === 'boolean') return expr
    if (typeof expr === 'number') return !!expr
    if (typeof expr !== 'string') return !!expr

    const source = expr.trim()
    if (!source) return true
    if (source === 'false' || source === '0') return false
    if (source.startsWith('env.')) {
      const key = source.slice(4)
      return !!process.env[key]
    }

    return true
  }

  private async importPlugin(name: string) {
    if (this.cache[name]) return this.cache[name]

    const specifier = BUILTIN_PLUGINS[name] || name
    let mod: any

    try {
      mod = await import(specifier)
    } catch (error) {
      if (!specifier.startsWith('@akari/plugin-')) {
        throw error
      }

      const runtimeDir = dirname(fileURLToPath(import.meta.url))
      const pluginName = specifier.slice('@akari/plugin-'.length)
      const localEntry = resolve(runtimeDir, `../../../plugins/${pluginName}/dist/index.js`)
      mod = await import(pathToFileURL(localEntry).href)
    }

    const plugin = mod.default ?? mod
    this.cache[name] = plugin
    return plugin
  }

  async reload(parent: Context, key: string, source: any) {
    const normalizedKey = key.replace(/^~/, '')
    const name = normalizedKey.split(':', 1)[0]
    const [config, meta] = separate(source, name === 'group')

    if (!this.isTruthyLike(meta.$if)) {
      this.unload(normalizedKey)
      return
    }

    if (name === 'group') {
      await this.reloadGroup(parent, config)
      return
    }

    const current = this.forks[normalizedKey]
    const finalConfig = this.interpolateConfig(name, config)

    if (current) {
      current.update(finalConfig)
      return
    }

    const plugin = await this.importPlugin(name)
    const fork = parent.plugin(plugin, finalConfig)
    this.forks[normalizedKey] = fork
  }

  unload(key: string) {
    const normalizedKey = key.replace(/^~/, '')
    const fork = this.forks[normalizedKey]
    if (fork) {
      fork.dispose()
      delete this.forks[normalizedKey]
    }
  }

  private interpolateConfig(name: string, config: Dict): Dict {
    if (name !== 'source-fs') return config
    if (!config.sourceDir) return config
    return {
      ...config,
      sourceDir: resolve(this.baseDir, config.sourceDir),
    }
  }
}
