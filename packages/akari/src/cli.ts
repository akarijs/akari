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
import { resolve } from 'node:path'
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
    loader.readConfig()
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

    const { posts, pages, tags, categories } = await ctx.content.getSiteData()
    console.log(`📦 Content: ${posts.length} posts, ${pages.length} pages, ${tags.length} tags, ${categories.length} categories`)

    console.log(`🔨 Generating to: ${outputDir}`)
    await (ctx as any).parallel('akari/generate', outputDir)

    console.log('✅ Site generated successfully!')
    await ctx.stop()
  })

async function startDev(options: { config?: string; port?: string }) {
  const loader = loadLoader(options.config)
  if (options.port) {
    loader.config.server = { ...loader.config.server, port: parseInt(options.port, 10) }
  }
  const outputDir = resolve(loader.baseDir, loader.config.build?.outputDir ?? './public')
  loader.config.server = { ...loader.config.server, staticDir: outputDir }
  const ctx = await loader.createApp('dev')

  console.log('🌸 Akari — Starting development server...')

  const { posts, pages } = await ctx.content.getSiteData()
  console.log(`📦 Content: ${posts.length} posts, ${pages.length} pages`)

  // Generate initial site
  await (ctx as any).parallel('akari/generate', outputDir)
  console.log('✅ Site generated successfully!')

  loader.watchConfig({
    onReload: async () => {
      const nextOutput = resolve(loader.baseDir, loader.config.build?.outputDir ?? './public')
      await (ctx as any).parallel('akari/generate', nextOutput)
      console.log('♻️  Config reloaded and site regenerated.')
    },
  })

  const port = loader.config.server?.port ?? 4000
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
