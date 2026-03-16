import { Context, Service } from 'cordis'
import type { Client } from './client.js'
import type { ConsoleService } from './index.js'

export namespace DataService {
  export interface Options {
    immediate?: boolean
    authority?: number
  }
}

export abstract class DataService<T = never> extends Service {
  static filter = false
  static inject = ['console']

  public async get(_forced?: boolean, _client?: Client): Promise<T> {
    return null as T
  }

  constructor(protected ctx: Context, protected key: keyof ConsoleService.Services, public options: DataService.Options = {}) {
    super(ctx, `console.services.${String(key)}` as any, options.immediate)
    
    ctx.on('ready', () => {
      const consoleNode = ctx.get('console')
      if (consoleNode) consoleNode.services[String(key)] = this as any
    })
  }

  start() {
    this.refresh()
  }

  async refresh(forced = true) {
    this.ctx.get('console')?.broadcast('data', async (client: Client) => ({
      key: this.key,
      value: await this.get(forced, client),
    }), this.options)
  }

  patch(value: T) {
    this.ctx.get('console')?.broadcast('patch', {
      key: this.key,
      value,
    }, this.options)
  }
}
