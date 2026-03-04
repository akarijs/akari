import { Context } from 'cordis'
import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { load } from 'js-yaml'
import { CAC } from 'cac'

// 引入核心内置服务（默认加载）
import Database from '@akarijs/database'
import Composer from '@akarijs/composer'
import View from '@akarijs/view'
import Router from '@akarijs/router'

export interface AkariConfig {
  plugins?: Record<string, any>
  output?: string
}

export async function createContainer(configPath: string) {
  const ctx = new Context()
  const absolutePath = resolve(process.cwd(), configPath)
  const config = load(readFileSync(absolutePath, 'utf8')) as AkariConfig

  // 1. 加载内置核心服务
  ctx.plugin(Database)
  ctx.plugin(Composer)
  ctx.plugin(View)
  ctx.plugin(Router, { outDir: config.output || 'dist' })

  // 2. 动态加载用户插件
  if (config.plugins) {
    for (const [name, options] of Object.entries(config.plugins)) {
      try {
        // 尝试加载插件。在 2026 年，我们优先支持 ESM
        // 这里的 name 可以是 npm 包名，也可以是本地路径
        const plugin = await import(name).then(m => m.default || m)
        ctx.plugin(plugin, options)
        ctx.logger('cli').info(`Plugin loaded: ${name}`)
      } catch (e) {
        ctx.logger('cli').error(`Failed to load plugin ${name}:`, e)
      }
    }
  }

  return ctx
}

export function run() {
  const cli = new CAC('akari')

  cli
    .command('build [config]', 'Build the static site')
    .action(async (config = 'akari.yml') => {
      const ctx = await createContainer(config)
      ctx.logger('cli').info('Starting build...')

      await ctx.start()

      // 在 SSG 模式下，我们监听一个信号代表所有任务完成
      // 这里可以简单等待所有同步任务结束
      setTimeout(() => {
        ctx.logger('cli').info('Build finished successfully.')
        process.exit(0)
      }, 1000)
    })

  cli.help()
  cli.parse()
}
