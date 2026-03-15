import { Context, Service } from 'cordis'

declare module 'cordis' {
  interface Context {
    transformer: TransformerService
  }
}

export type Transformer = (content: string, options?: any) => Promise<TransformResult> | TransformResult

export interface TransformResult {
  content: string
  metadata?: Record<string, any>
}

export class TransformerService extends Service {
  static [Service.provide] = 'transformer'
  static [Service.immediate] = true

  private transformers = new Map<string, Transformer>()

  constructor(ctx: Context) {
    super(ctx)
  }

  register(format: string, transformer: Transformer): () => void {
    this.transformers.set(format, transformer)
    return this[Context.current].effect(() => {
      return () => { this.transformers.delete(format) }
    })
  }

  async transform(format: string, content: string, options?: any): Promise<TransformResult> {
    const transformer = this.transformers.get(format)
    if (!transformer) {
      throw new Error(`No transformer registered for format: ${format}`)
    }
    return transformer(content, options)
  }

  supports(format: string): boolean {
    return this.transformers.has(format)
  }
}
