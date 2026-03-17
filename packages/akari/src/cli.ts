#!/usr/bin/env node
/**
 * akari CLI — Read a config file and run build, dev, or start commands.
 *
 * Usage:
 *   akari build          Generate static site
 *   akari dev            Start development server
 *   akari start          Start production server (forked worker process)
 */

import { cac } from 'cac'
import { resolve, dirname } from 'node:path'
import { mkdir, writeFile, cp, access } from 'node:fs/promises'
import { fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { Loader } from './loader.js'

if (typeof globalThis.CustomEvent === 'undefined') {
  class NodeCustomEvent<T = unknown> extends Event {
    detail: T

    constructor(type: string, params?: { detail?: T }) {
      super(type)
      this.detail = params?.detail as T
    }
  }

  ;(globalThis as any).CustomEvent = NodeCustomEvent
}

interface WorkerMessage {
  type: 'start' | 'exit' | 'reload'
}

async function writeOutput(outputDir: string, path: string, content: string): Promise<void> {
  const normalizedPath = path.replace(/^\/+/, '')
  const fullPath = normalizedPath === '' || normalizedPath.endsWith('/') || !normalizedPath.includes('.')
    ? resolve(outputDir, normalizedPath, 'index.html')
    : resolve(outputDir, normalizedPath)
  await mkdir(dirname(fullPath), { recursive: true })
  await writeFile(fullPath, content, 'utf-8')
}

const cli = cac('akari')

/**
 * Create and initialize a loader instance.
 */
function loadLoader(configPath?: string): Loader {
  const loader = new Loader()
  try {
    loader.init(configPath)
  } catch (err: any) {
    console.error(`❌ ${err.message}`)
    console.error('   Create an akari.config.yml file or specify one with --config')
    process.exit(1)
  }
  try {
    loader.readConfig(true)
    return loader
  } catch (err: any) {
    console.error(`❌ ${err.message}`)
    process.exit(1)
  }
}

cli.command('build', 'Generate static site')
  .option('-c, --config <path>', 'Config file path')
  .option('-o, --output <dir>', 'Output directory')
  .action(async (options: { config?: string; output?: string }) => {
    const loader = loadLoader(options.config)
    if (options.output) {
      loader.config.build = { ...loader.config.build, outputDir: options.output }
    }
    const ctx = await loader.createApp('build')
    const outputDir = resolve(loader.baseDir, loader.config.build?.outputDir ?? './public')

    console.log('🌸 Akari — Building site...')

    // Enumerate all routes (no rendering yet)
    await ctx.router.refresh()
    const routePaths = ctx.router.paths()
    console.log(`📦 Routes: ${routePaths.length} pages registered`)

    console.log(`🔨 Generating to: ${outputDir}`)
    let count = 0
    for await (const { path, content } of ctx.router.build()) {
      await writeOutput(outputDir, path, content)
      count++
    }

    // Copy theme static assets if available
    const themeSourceDir = ctx.get('theme.sourceDir' as any)
    if (themeSourceDir) {
      try {
        await access(themeSourceDir)
        await cp(themeSourceDir, outputDir, { recursive: true })
      } catch {
        // source dir may not exist
      }
    }

    console.log(`✅ Site generated successfully! (${count} files)`)
    await ctx.stop()
  })

async function startDev(options: { config?: string; port?: string }) {
  const loader = loadLoader(options.config)
  if (options.port) {
    loader.config.server = { ...loader.config.server, port: parseInt(options.port, 10) }
  }
  // In dev mode, use theme's static source dir for static file serving
  const themeSourceDir = loader.config.build?.themeSourceDir
  if (themeSourceDir) {
    loader.config.server = { ...loader.config.server, staticDir: resolve(loader.baseDir, themeSourceDir) }
  }
  const ctx = await loader.createApp('dev')

  console.log('🌸 Akari — Starting development server...')

  // Enumerate routes (lazy — no rendering until request)
  await ctx.router.refresh()
  const routePaths = ctx.router.paths()
  console.log(`📦 Routes: ${routePaths.length} pages registered (on-demand rendering)`)

  loader.watchConfig({
    onReload: async () => {
      ctx.router.clearCache()
      await ctx.router.refresh()
      console.log('♻️  Config reloaded, routes refreshed.')
    },
  })

  const port = loader.config.plugins?.server?.port ?? 4000
  console.log(`🚀 Development server running at http://localhost:${port}`)
  console.log('   Watching config file changes...')
  console.log('   Press Ctrl+C to stop.')
}

cli.command('dev', 'Start development server')
  .option('-c, --config <path>', 'Config file path')
  .option('-p, --port <port>', 'Server port')
  .action(startDev)

cli.command('start', 'Start blog preview')
  .option('-c, --config <path>', 'Config file path')
  .option('-p, --port <port>', 'Server port')
  .action((options: { config?: string; port?: string }) => {
    if (options.config) {
      process.env.AKARI_CONFIG_FILE = options.config
    }
    if (options.port) {
      process.env.AKARI_PORT = options.port
    }

    const workerPath = fileURLToPath(new URL('./worker.js', import.meta.url))
    let child: any // ChildProcess with message, kill, on methods

    function createWorker() {
      child = fork(workerPath, [], {
        execArgv: [],
      })

      child.on('message', (message: WorkerMessage) => {
        if (message.type === 'start') {
          // worker started successfully
        } else if (message.type === 'exit') {
          // worker is shutting down gracefully
        } else if (message.type === 'reload') {
          // worker requested full reload
        }
      })

      child.on('exit', (code: number | null) => {
        if (code === Loader.exitCode) {
          createWorker()
          return
        }
        process.exit(code ?? 0)
      })
    }

    createWorker()

    process.on('SIGINT', () => child?.kill('SIGINT'))
    process.on('SIGTERM', () => child?.kill('SIGTERM'))
  })

cli.help()
cli.version('0.0.1')

cli.parse()
