import { Context } from 'cordis'
import type { Client } from './client.js'

export namespace Entry {
  export type Files = string | string[] | EntryOptions

  export interface EntryOptions {
    dev: string
    prod: string | string[]
  }
}

export class Entry<T = any> {
  public id = Math.random().toString(36).slice(2)
  public dispose: () => void

  constructor(public ctx: Context, public files: Entry.Files, public data?: (client: Client) => T) {
    const consoleNode = ctx.get('console')
    if (consoleNode) {
      consoleNode.entries[this.id] = this
      consoleNode.refresh('entry')
    }
    
    this.dispose = ctx.effect(() => {
      // Setup
      return () => {
        // Teardown
        const consoleNode = this.ctx.get('console')
        if (consoleNode) {
          delete consoleNode.entries[this.id]
          consoleNode.refresh('entry')
        }
      }
    })
  }

  refresh() {
    this.ctx.get('console')?.broadcast('entry-data', async (client: Client) => ({
      id: this.id,
      data: await this.data?.(client),
    }))
  }
}
