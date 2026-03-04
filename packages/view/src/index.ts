import { Context } from 'cordis'
import { AkariService } from '@akarijs/core'
import { AkariElement } from '@akarijs/protocol'
import { } from '@akarijs/composer'

declare module 'cordis' {
  interface Context {
    view: ViewService
  }

  interface Events {
    /** 渲染开始 */
    'view/render-start'(pageId: string): void
    /** 渲染完成，交由 Router 或 DevServer 处理 */
    'view/render-complete'(pageId: string, content: string, path: string): void
  }
}

/**
 * 渲染引擎契约
 * 例如：(context) => ReactDomServer.renderToString(<MyComponent {...context} />)
 */
export type RenderEngine = (context: any) => Promise<string> | string

export class ViewService extends AkariService {
  // 注册的渲染引擎集合：engineName -> RenderEngine
  private _engines = new Map<string, RenderEngine>()

  constructor(ctx: Context) {
    super(ctx, 'view', true)
  }

  // 显式声明依赖：必须有 Composer 才能开始渲染
  static inject = ['composer']

  protected init() {
    // 1. 核心响应逻辑：监听 Composer 的页面变脏信号
    this.ctx.on('composer/page-dirty', async (pageId) => {
      await this.refresh(pageId)
    })

    this.ctx.logger('akari').info('View service (Refactored) initialized.')
  }

  /**
   * 注册一个新的渲染引擎（由插件调用，如 @akari/plugin-react）
   */
  public register(name: string, engine: RenderEngine) {
    this._engines.set(name, engine)
    this.ctx.logger('akari').debug(`Render engine registered: ${name}`)
  }

  /**
   * 刷新并重绘特定页面
   */
  private async refresh(pageId: string) {
    this.ctx.emit('view/render-start', pageId)

    try {
      // 1. 从 Composer 拉取该页面的最新数据快照
      const { context, path, component } = await this.ctx.composer.fetch(pageId)

      // 2. 寻找匹配的渲染引擎
      const engine = this._engines.get(component)
      if (!engine) {
        throw new Error(`No render engine found for component: ${component}`)
      }

      // 3. 执行渲染逻辑
      // 这里的 context 中可能包含 @akarijs/protocol 定义的 AE 节点
      const output = await engine(context)

      // 4. 广播渲染完成事件，带上最终路径，供 Router 写入磁盘
      this.ctx.emit('view/render-complete', pageId, output, path)

      this.ctx.logger('akari').info(`Page rendered: ${pageId} -> ${path}`)
    } catch (err) {
      this.ctx.logger('akari').error(`Failed to render page ${pageId}:`, err)
    }
  }

  /**
   * 辅助工具：将 AE 协议树转换为简单的 HTML (用于默认渲染或测试)
   */
  public simpleRender(element: AkariElement | string): string {
    if (typeof element === 'string') return element

    const { type, attrs, children } = element
    const attrStr = Object.entries(attrs)
      .map(([k, v]) => ` ${k}="${v}"`)
      .join('')

    const childStr = children.map(c => this.simpleRender(c as AkariElement)).join('')

    return `<${type}${attrStr}>${childStr}</${type}>`
  }
}

export default ViewService
