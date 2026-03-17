import { Context, Service } from 'cordis'

declare module 'cordis' {
  interface Context {
    renderer: RendererService
  }
}

export interface Renderer {
  renderFile(path: string, data: Record<string, any>): Promise<string>
  renderString?(template: string, data: Record<string, any>): Promise<string>
}

export class RendererService extends Service {
  static [Service.provide] = 'renderer'
  static [Service.immediate] = true

  private renderers = new Map<string, Renderer>()

  constructor(ctx: Context) {
    super(ctx)
  }

  register(name: string, renderer: Renderer): () => void {
    if (this.renderers.has(name)) {
      throw new Error(`Renderer already registered: ${name}`)
    }
    this.renderers.set(name, renderer)
    return this[Context.current].effect(() => {
      return () => { this.renderers.delete(name) }
    })
  }

  get(name: string): Renderer {
    const renderer = this.renderers.get(name)
    if (!renderer) {
      throw new Error(`Renderer not found: ${name}`)
    }
    return renderer
  }

  has(name: string): boolean {
    return this.renderers.has(name)
  }
}
