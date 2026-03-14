/**
 * worker — Child process spawned by the `start` command.
 *
 * Reads configuration from environment variables, bootstraps the Cordis
 * context, generates the site, and keeps the process alive. Communicates
 * with the parent process via IPC messages.
 *
 * Inspired by @koishijs/koishi worker/daemon pattern.
 */

import { resolve } from 'node:path'
import { Loader } from './loader.js'

const configFile = process.env.AKARI_CONFIG_FILE || undefined
const port = process.env.AKARI_PORT ? parseInt(process.env.AKARI_PORT, 10) : undefined

// Load configuration
const loader = new Loader()
try {
  loader.init(configFile)
} catch (err: any) {
  console.error(`❌ ${err.message}`)
  process.exit(1)
}

let config: Record<string, any>
try {
  config = loader.readConfig()
} catch (err: any) {
  console.error(`❌ ${err.message}`)
  process.exit(1)
}

if (port) {
  config.server = { ...config.server, port }
}
const outputDir = resolve(loader.baseDir, config.build?.outputDir ?? './public')
config.server = { ...config.server, staticDir: outputDir }

const ctx = await loader.createApp('dev')

console.log('🌸 Akari — Starting...')

const { posts, pages } = await ctx.content.getSiteData()
console.log(`📦 Content: ${posts.length} posts, ${pages.length} pages`)

await (ctx as any).parallel('akari/generate', outputDir)
console.log('✅ Site generated successfully!')

const serverPort = config.server?.port ?? 4000
console.log(`🚀 Server running at http://localhost:${serverPort}`)

// Notify parent process that the worker is ready
process.send?.({ type: 'start' })

const stopWatching = loader.watchConfig({ fullReload: true })

// Handle graceful shutdown
function handleSignal(_signal: NodeJS.Signals) {
  stopWatching()
  process.send?.({ type: 'exit' })
  ctx.stop().finally(() => process.exit(0))
}

process.on('SIGINT', handleSignal)
process.on('SIGTERM', handleSignal)
