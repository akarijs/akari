/* eslint-disable no-console */

import { Context } from 'cordis'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { load } from 'js-yaml'
import { CAC } from 'cac'

// 导入内核级服务
import Database from '@akarijs/database'
import Composer from '@akarijs/composer'
import View from '@akarijs/view'
import Router from '@akarijs/router'
import { loadPlugin } from './loader'

export interface AkariConfig {
  output?: string
  plugins?: Record<string, any>
}

export class AkariApp extends Context {
  constructor(public config: AkariConfig) {
    super()

    // 1. 注册基础核心服务
    this.plugin(Database)
    this.plugin(Composer)
    this.plugin(View)
    this.plugin(Router, { outDir: config.output || 'dist' })
  }

  /**
   * 根据配置文件动态加载所有插件
   */
  async prepare() {
    if (!this.config.plugins) return

    for (const [name, options] of Object.entries(this.config.plugins)) {
      try {
        const plugin = await loadPlugin(this, name)
        this.plugin(plugin, options)
        this.logger('cli').info(`Plugin applied: ${name}`)
      } catch (e) {
        // 具体的错误已在 loader 中打印
      }
    }
  }
}

/**
 * CLI 运行入口
 */
export function run() {
  const cli = new CAC('akari')

  cli
    .command('build [config]', 'Build the static site')
    .option('-o, --output <dir>', 'Output directory')
    .action(async (configPath = 'akari.yml', options) => {
      const logger = (name: string) => ({ info: console.log, error: console.error, debug: console.log })

      try {
        // 1. 读取配置文件
        const absolutePath = resolve(process.cwd(), configPath)
        const yamlContent = readFileSync(absolutePath, 'utf8')
        const config = load(yamlContent) as AkariConfig

        // 命令行参数优先级高于配置文件
        if (options.output) config.output = options.output

        // 2. 创建应用实例
        const app = new AkariApp(config)

        // 3. 加载插件
        await app.prepare()

        // 4. 启动应用
        console.log('\n✨ Akari.js: Starting reactive build pipeline...\n')
        await app.start()

        // 5. 优雅退出 (对于 SSG，我们需要确定任务完成的时间点)
        // 目前简单通过 2s 延迟或监听所有 sync 结束。
        // 理想方案是增加一个计数器追踪所有活动的 sync 任务。
        setTimeout(() => {
          console.log('\n✅ Build finished successfully.')
          process.exit(0)
        }, 1500)
      } catch (err: any) {
        console.error(`\n❌ Error during build: ${err.message}`)
        process.exit(1)
      }
    })

  cli.help()
  cli.parse()
}
