import { Context } from 'cordis'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

/**
 * 插件加载器：支持本地路径与工作区包名
 */
export async function loadPlugin(ctx: Context, name: string) {
  try {
    let importPath = name

    // 1. 处理本地相对路径 (以 . 或 / 开头)
    if (name.startsWith('.') || name.startsWith('/')) {
      importPath = pathToFileURL(resolve(process.cwd(), name)).href
    }

    // 2. 动态导入
    // 在 pnpm/npm workspace 下，包名会自动解析到本地 packages 目录
    const module = await import(importPath)

    // 兼容 export default 和 直接导出 apply 的情况
    return module.default || module
  } catch (err: any) {
    ctx.logger('cli').error(`Failed to load plugin "${name}":`, err.message)
    throw err
  }
}
