import { Context, Service } from 'cordis'

declare module 'cordis' {
  interface Context {
    router: RouterService
  }

  interface Events {
    'router/refresh'(): void
    'router/invalidate'(paths: string[]): void
  }
}

export interface RouteDefinition {
  /** URL path, e.g. '/2024/06/15/hello/' */
  path: string
  /** MIME type, defaults to 'text/html' */
  type?: string
  /** Layout ID registered with LayoutService */
  layout?: string
  /** Lazy data function — called at render time, not at route registration */
  data?: () => Promise<Record<string, any>> | Record<string, any>
  /** Custom render function — takes priority over layout+data */
  render?: () => Promise<string> | string
}

export interface RouteGeneratorOptions {
  /** Datasource collections this generator depends on (for invalidation) */
  collections?: string[]
  /** Generate route definitions. Called during refresh(). */
  generate(ctx: Context): AsyncIterable<RouteDefinition> | Iterable<RouteDefinition> | Promise<RouteDefinition[]>
}

interface ResolvedRoute {
  definition: RouteDefinition
  /** Name of the generator that produced this route */
  generator: string
}

interface RegisteredGenerator {
  name: string
  options: RouteGeneratorOptions
}

export class RouterService extends Service {
  static [Service.provide] = 'router'
  static [Service.immediate] = true
  static inject = ['layout', 'datasource', 'transformer']

  private generators = new Map<string, RegisteredGenerator>()
  private staticRoutes = new Map<string, RouteDefinition>()
  private routes = new Map<string, ResolvedRoute>()
  private cache = new Map<string, { content: string, type: string }>()
  private _refreshing = false

  constructor(ctx: Context) {
    super(ctx)

    // Listen for datasource changes and invalidate affected generators
    ctx.on('datasource/change', (collectionName) => {
      const affectedGenerators: string[] = []
      for (const [name, gen] of this.generators) {
        if (gen.options.collections?.includes(collectionName)) {
          affectedGenerators.push(name)
        }
      }
      if (affectedGenerators.length > 0) {
        // Collect paths that will be invalidated
        const invalidatedPaths: string[] = []
        for (const [path, route] of this.routes) {
          if (affectedGenerators.includes(route.generator)) {
            invalidatedPaths.push(path)
            this.cache.delete(path)
          }
        }
        if (invalidatedPaths.length > 0) {
          this.ctx.emit('router/invalidate', invalidatedPaths)
        }
        // Schedule a refresh for affected generators
        void this.refreshGenerators(affectedGenerators)
      }
    })
  }

  register(name: string, options: RouteGeneratorOptions): () => void {
    if (this.generators.has(name)) {
      throw new Error(`Route generator already registered: ${name}`)
    }
    this.generators.set(name, { name, options })
    return this[Context.current].effect(() => {
      return () => {
        this.generators.delete(name)
        // Remove routes produced by this generator
        for (const [path, route] of this.routes) {
          if (route.generator === name) {
            this.routes.delete(path)
            this.cache.delete(path)
          }
        }
      }
    })
  }

  route(definition: RouteDefinition): () => void {
    const path = normalizePath(definition.path)
    this.staticRoutes.set(path, definition)
    this.routes.set(path, { definition, generator: '__static__' })
    return this[Context.current].effect(() => {
      return () => {
        this.staticRoutes.delete(path)
        this.routes.delete(path)
        this.cache.delete(path)
      }
    })
  }

  async refresh(): Promise<void> {
    if (this._refreshing) return
    this._refreshing = true
    try {
      this.routes.clear()
      this.cache.clear()

      // Re-add static routes
      for (const [path, definition] of this.staticRoutes) {
        this.routes.set(path, { definition, generator: '__static__' })
      }

      // Execute all generators
      for (const [name, gen] of this.generators) {
        await this.executeGenerator(name, gen.options)
      }

      this.ctx.emit('router/refresh')
    } finally {
      this._refreshing = false
    }
  }

  async render(path: string): Promise<{ content: string, type: string } | null> {
    const normalizedPath = normalizePath(path)
    const resolved = this.routes.get(normalizedPath)
    if (!resolved) return null

    // Check cache
    const cached = this.cache.get(normalizedPath)
    if (cached) return cached

    const { definition } = resolved
    const type = definition.type ?? 'text/html'

    let content: string

    if (definition.render) {
      // Custom render takes priority
      content = await definition.render()
    } else if (definition.layout) {
      // Use LayoutService: data() + layout render
      const data = definition.data ? await definition.data() : {}
      content = await this.ctx.layout.render(definition.layout, data)
    } else {
      return null
    }

    const result = { content, type }
    this.cache.set(normalizedPath, result)
    return result
  }

  async *build(): AsyncGenerator<{ path: string, content: string, type: string }> {
    for (const [path, resolved] of this.routes) {
      // Bypass cache for build — always render fresh
      const { definition } = resolved
      const type = definition.type ?? 'text/html'

      let content: string

      if (definition.render) {
        content = await definition.render()
      } else if (definition.layout) {
        const data = definition.data ? await definition.data() : {}
        content = await this.ctx.layout.render(definition.layout, data)
      } else {
        continue
      }

      yield { path, content, type }
    }
  }

  paths(): string[] {
    return [...this.routes.keys()]
  }

  /** Get all route paths with their types */
  entries(): Array<{ path: string, type: string }> {
    return [...this.routes.entries()].map(([path, r]) => ({
      path,
      type: r.definition.type ?? 'text/html',
    }))
  }

  clearCache(): void {
    this.cache.clear()
  }

  private async refreshGenerators(names: string[]): Promise<void> {
    // Remove routes from specified generators
    for (const [path, route] of this.routes) {
      if (names.includes(route.generator)) {
        this.routes.delete(path)
        this.cache.delete(path)
      }
    }

    // Re-execute specified generators
    for (const name of names) {
      const gen = this.generators.get(name)
      if (gen) {
        await this.executeGenerator(name, gen.options)
      }
    }
  }

  private async executeGenerator(name: string, options: RouteGeneratorOptions): Promise<void> {
    const result = options.generate(this.ctx)

    if (Symbol.asyncIterator in Object(result)) {
      for await (const definition of result as AsyncIterable<RouteDefinition>) {
        const path = normalizePath(definition.path)
        this.routes.set(path, { definition, generator: name })
      }
    } else if (Symbol.iterator in Object(result)) {
      for (const definition of result as Iterable<RouteDefinition>) {
        const path = normalizePath(definition.path)
        this.routes.set(path, { definition, generator: name })
      }
    } else {
      // Promise<RouteDefinition[]>
      const definitions = await (result as Promise<RouteDefinition[]>)
      for (const definition of definitions) {
        const path = normalizePath(definition.path)
        this.routes.set(path, { definition, generator: name })
      }
    }
  }
}

function normalizePath(path: string): string {
  // Ensure leading slash, collapse double slashes
  let normalized = '/' + path.replace(/^\/+/, '').replace(/\/+/g, '/')
  // For directory-like routes, ensure trailing slash
  if (normalized !== '/' && !normalized.includes('.') && !normalized.endsWith('/')) {
    normalized += '/'
  }
  return normalized
}
