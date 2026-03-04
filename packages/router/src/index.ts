import { Context } from 'cordis'
import { AkariService } from '@akarijs/core'
import { } from '@akarijs/composer'
import { } from '@akarijs/view'

import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

declare module 'cordis' {
  interface Context {
    router: RouterService
  }
}

export interface RouterConfig {
  /** 输出目录，默认为 dist */
  outDir?: string
  /** 是否开启物理写入，开发模式下通常为 false */
  writeToDisk?: boolean
}

export class RouterService extends AkariService {
  /** 记录 pageId 到最终物理路径的映射，用于清理 */
  private _pathMap = new Map<string, string>()

  constructor(ctx: Context, public config: RouterConfig = {}) {
    super(ctx, 'router', true)
    this.config.outDir ||= 'dist'
    this.config.writeToDisk ??= true
  }

  static inject = ['view']

  protected init() {
    // 监听 View 层渲染完成的信号
    this.ctx.on('view/render-complete', async (pageId, content, path) => {
      await this.emit(pageId, content, path)
    })

    // 监听 Composer 页面删除信号 (假设已定义)
    // this.ctx.on('composer/page-removed', async (pageId) => {
    //   await this.remove(pageId)
    // })

    this.ctx.logger('akari').info('Router service (Refactored) initialized.')
  }

  /**
   * 核心输出逻辑
   */
  private async emit(pageId: string, content: string, relativePath: string) {
    // 1. 标准化路径：将 / 转换为 index.html
    const normalizedPath = relativePath.endsWith('/')
      ? join(relativePath, 'index.html')
      : relativePath

    const fullPath = join(this.config.outDir!, normalizedPath)

    // 2. 缓存路径映射
    this._pathMap.set(pageId, fullPath)

    // 3. 物理写入
    if (this.config.writeToDisk) {
      try {
        await mkdir(dirname(fullPath), { recursive: true })
        await writeFile(fullPath, content, 'utf-8')
        this.ctx.logger('akari').debug(`File written: ${normalizedPath}`)
      } catch (err) {
        this.ctx.logger('akari').error(`Write failed: ${fullPath}`, err)
      }
    }

    // 4. 发送最终路由就绪信号（可用于后续集成搜索索引或部署插件）
    // this.ctx.emit('router/ready', pageId, fullPath)
  }

  /**
   * 清理过期文件
   */
  private async remove(pageId: string) {
    const fullPath = this._pathMap.get(pageId)
    if (fullPath && this.config.writeToDisk) {
      try {
        await rm(fullPath, { force: true })
        this._pathMap.delete(pageId)
        this.ctx.logger('akari').info(`Orphaned file removed: ${fullPath}`)
      } catch (err) {
        this.ctx.logger('akari').warn(`Cleanup failed: ${fullPath}`)
      }
    }
  }

  /**
   * 开发模式助手：通过路径反查内容
   * 未来可集成进 Vite 的 Middlewares
   */
  public resolve(path: string): string | undefined {
    // 这里可以实现一个快速索引，用于开发服务器实时拦截请求
    return undefined
  }
}

export default RouterService
