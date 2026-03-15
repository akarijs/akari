import { resolve } from 'node:path'
import { stat } from 'node:fs/promises'
import { Context, Service } from 'cordis'

declare module 'cordis' {
  interface Context {
    template: TemplateService
  }
}

export interface TemplateEngine {
  renderFile(path: string, locals: Record<string, any>): Promise<string>
  renderString?(template: string, locals: Record<string, any>): Promise<string>
}

export class TemplateService extends Service {
  static [Service.provide] = 'template'
  static [Service.immediate] = true

  private engines = new Map<string, TemplateEngine>()
  private dirs: string[] = []
  private helpers = new Map<string, Function>()

  constructor(ctx: Context) {
    super(ctx)
  }

  engine(ext: string, engine: TemplateEngine): () => void {
    const key = ext.startsWith('.') ? ext : `.${ext}`
    this.engines.set(key, engine)
    return this[Context.current].effect(() => {
      return () => { this.engines.delete(key) }
    })
  }

  addDir(dir: string): () => void {
    this.dirs.push(dir)
    return this[Context.current].effect(() => {
      return () => {
        const idx = this.dirs.indexOf(dir)
        if (idx !== -1) this.dirs.splice(idx, 1)
      }
    })
  }

  helper(name: string, fn: Function): () => void {
    this.helpers.set(name, fn)
    return this[Context.current].effect(() => {
      return () => { this.helpers.delete(name) }
    })
  }

  getHelpers(): Record<string, Function> {
    return Object.fromEntries(this.helpers)
  }

  getDirs(): string[] {
    return [...this.dirs]
  }

  async render(layout: string, locals: Record<string, any> = {}): Promise<string> {
    const helpers = this.getHelpers()
    const mergedLocals = { ...locals, ...helpers }

    for (const dir of this.dirs) {
      for (const [ext, engine] of this.engines) {
        const filePath = resolve(dir, `${layout}${ext}`)
        try {
          const fileStat = await stat(filePath)
          if (fileStat.isFile()) {
            return engine.renderFile(filePath, mergedLocals)
          }
        } catch {
          // file doesn't exist, try next
        }
      }
    }
    throw new Error(`Template not found: ${layout}`)
  }
}
