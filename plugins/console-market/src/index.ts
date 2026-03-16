import { Context, Service } from 'cordis'
import { DataService } from '@akari/plugin-console'
import { fileURLToPath } from 'node:url'

export const name = 'console-market'

declare module '@akari/plugin-console' {
  namespace ConsoleService {
    interface Services {
      market: Market
    }
  }
}

export interface MarketPackage {
  name: string
  version: string
  description?: string
  author?: string
  keywords?: string[]
  date?: string
  installed?: boolean
}

class Market extends DataService<MarketPackage[]> {
  static inject = ['console']
  static [Service.provide] = 'console-market' as const

  private registry: string
  private keyword: string

  constructor(ctx: Context, config: Market.Config = {}) {
    super(ctx, 'market', { immediate: true })
    this.registry = config.registry || 'https://registry.npmjs.org'
    this.keyword = config.keyword || 'akari-plugin'

    // UI Routing & Entries
    ctx.console.addRoute({ path: 'market', title: '插件市场' })

    const entryFile = fileURLToPath(new URL('../src/web/index.ts', import.meta.url))
    const bundleFile = fileURLToPath(new URL('../dist/web/index.js', import.meta.url))
    ctx.console.addEntry(
      { dev: entryFile, prod: bundleFile },
      () => ({ label: '插件市场', order: 30 })
    )

    // Listeners
    ctx.console.addListener('market/search', async (query?: string) => {
      if (!query) return this.get()
      const packages = await this.get()
      const q = query.toLowerCase()
      return packages.filter(
        (pkg) =>
          pkg.name.toLowerCase().includes(q) ||
          pkg.description?.toLowerCase().includes(q),
      )
    })

    ctx.console.addListener('market/refresh', async () => {
      await this.refresh()
      return { success: true }
    })
  }

  async get(): Promise<MarketPackage[]> {
    return this.searchPackages()
  }

  private async searchPackages(): Promise<MarketPackage[]> {
    try {
      const url = `${this.registry}/-/v1/search?text=keywords:${encodeURIComponent(this.keyword)}&size=50`
      const response = await fetch(url)
      if (!response.ok) return []
      const body = await response.json() as any
      return (body.objects || []).map((obj: any) => ({
        name: obj.package.name,
        version: obj.package.version,
        description: obj.package.description,
        author: obj.package.author?.name,
        keywords: obj.package.keywords,
        date: obj.package.date,
        installed: false,
      }))
    } catch {
      return []
    }
  }
}

namespace Market {
  export interface Config {
    registry?: string
    keyword?: string
  }
}

export default Market
