import { Context, Service } from 'cordis'

declare module 'cordis' {
  interface Context {
    layout: LayoutService
  }
}

export interface LayoutDefinition {
  /** Which registered renderer to use, e.g. 'nunjucks'. */
  renderer: string
  /** Absolute path to the template file. */
  template: string
  /** Datasource collections to auto-fetch and inject into template data. */
  collections?: string[]
}

export class LayoutService extends Service {
  static [Service.provide] = 'layout'
  static [Service.immediate] = true
  static inject = ['renderer', 'datasource']

  private layouts = new Map<string, LayoutDefinition>()
  private helpers = new Map<string, Function>()

  constructor(ctx: Context) {
    super(ctx)
  }

  register(id: string, definition: LayoutDefinition): () => void {
    if (this.layouts.has(id)) {
      throw new Error(`Layout already registered: ${id}`)
    }
    this.layouts.set(id, definition)
    return this[Context.current].effect(() => {
      return () => { this.layouts.delete(id) }
    })
  }

  helper(name: string, fn: Function): () => void {
    this.helpers.set(name, fn)
    return this[Context.current].effect(() => {
      return () => { this.helpers.delete(name) }
    })
  }

  has(id: string): boolean {
    return this.layouts.has(id)
  }

  get(id: string): LayoutDefinition {
    const layout = this.layouts.get(id)
    if (!layout) {
      throw new Error(`Layout not found: ${id}`)
    }
    return layout
  }

  getHelpers(): Record<string, Function> {
    return Object.fromEntries(this.helpers)
  }

  async render(id: string, extraData: Record<string, any> = {}): Promise<string> {
    const layout = this.get(id)
    const renderer = this.ctx.renderer.get(layout.renderer)

    // Auto-fetch declared collections from datasource
    const collectionData: Record<string, any> = {}
    if (layout.collections) {
      for (const name of layout.collections) {
        if (this.ctx.datasource.hasCollection(name)) {
          collectionData[name] = await this.ctx.datasource.collection(name).list()
        }
      }
    }

    // Merge: collection data + extra data + helpers
    const helpers = this.getHelpers()
    const mergedData = { ...collectionData, ...extraData, ...helpers }

    return renderer.renderFile(layout.template, mergedData)
  }
}
