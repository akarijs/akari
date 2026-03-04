import { Context } from 'cordis'
import { AkariService } from '@akarijs/core'

declare module 'cordis' {
  interface Context {
    composer: ComposerService
  }

  interface Events {
    /** 页面节点变脏，通知渲染器重绘 */
    'composer/page-dirty'(pageId: string): void
  }
}

export interface PageOptions<T = any> {
  /** 路由路径，支持占位符如 /posts/:slug */
  path: string
  /** 渲染该页面所需的组件/模板名称 */
  component: string
  /** 数据编排逻辑：从数据库中提取该页面所需的所有数据 */
  wire: (db: Context['database']) => Promise<T> | T
}

export interface PageNode extends PageOptions {
  id: string
  /** 追踪该页面依赖了哪些数据库表 */
  deps: Set<string>
}

export class ComposerService extends AkariService {
  // 存储所有定义的虚拟页面
  private _pages = new Map<string, PageNode>()
  // 逆向索引：table -> Set<pageId>，用于快速查找变更影响范围
  private _tableToPages = new Map<string, Set<string>>()

  constructor(ctx: Context) {
    // 确保 database 先于 composer 加载
    super(ctx, 'composer', true)
  }

  static inject = ['database']

  protected init() {
    // 监听数据库变更，触发依赖失效
    this.ctx.on('database/change', (table) => this.invalidate(table))
    this.ctx.on('database/remove', (table) => this.invalidate(table))

    this.ctx.logger('akari').info('Composer service initialized.')
  }

  /**
   * 定义一个虚拟页面
   * @param id 页面唯一标识
   * @param options 页面配置
   */
  public async define<T>(id: string, options: PageOptions<T>) {
    const node: PageNode = {
      ...options,
      id,
      deps: new Set(),
    }

    // 第一次“空运行” wire 函数，用于自动收集依赖
    // 在复杂的实现中，我们会通过 Proxy 代理 ctx.database 来自动捕获
    // MVP 版本我们通过显式声明或简单的逻辑推断
    this._pages.set(id, node)

    // 假设我们在 wire 中通过某种方式标记了依赖的表
    // 这里我们先手动触发一次初始渲染信号
    this.ctx.emit('composer/page-dirty', id)
  }

  /**
   * 手动关联依赖（暂时的显式方案，后续可进化为自动追踪）
   */
  public link(pageId: string, tables: string[]) {
    const page = this._pages.get(pageId)
    if (!page) return

    tables.forEach(table => {
      page.deps.add(table)
      if (!this._tableToPages.has(table)) {
        this._tableToPages.set(table, new Set())
      }
      this._tableToPages.get(table)!.add(pageId)
    })
  }

  /**
   * 失效处理：当表数据变化，找到所有关联页面并标记为脏
   */
  private invalidate(table: string) {
    const affectedPages = this._tableToPages.get(table)
    if (affectedPages) {
      for (const pageId of affectedPages) {
        this.ctx.logger('akari').debug(`Page ${pageId} invalidated due to change in table: ${table}`)
        this.ctx.emit('composer/page-dirty', pageId)
      }
    }
  }

  /**
   * 获取页面快照数据
   */
  public async fetch(pageId: string) {
    const page = this._pages.get(pageId)
    if (!page) throw new Error(`Page ${pageId} not found.`)

    return {
      context: await page.wire(this.ctx.database),
      path: page.path,
      component: page.component,
    }
  }

  public list() {
    return Array.from(this._pages.keys())
  }
}

export default ComposerService
