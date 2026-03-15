import type {} from 'minato'
import { Context } from 'cordis'
import type { CollectionDriver, Query } from './types.js'

export class MinatoDriver<T extends { id?: PropertyKey }> implements CollectionDriver<T> {
  constructor(protected ctx: Context, protected table: string) {}

  async list(query?: Query<T>): Promise<T[]> {
    const filter = query?.filter ?? {}
    const records = await this.ctx.database.get(this.table as never, filter as never)
    if (!query?.sort?.length && query?.offset == null && query?.limit == null) return records as T[]

    const result = [...records] as T[]
    if (query.sort?.length) {
      result.sort((left, right) => {
        for (const item of query.sort!) {
          const l = (left as any)[item.field]
          const r = (right as any)[item.field]
          const dir = item.order === 'desc' ? -1 : 1
          const cmp = l instanceof Date && r instanceof Date
            ? l.getTime() - r.getTime()
            : typeof l === 'number' && typeof r === 'number'
              ? l - r
              : String(l ?? '').localeCompare(String(r ?? ''))
          if (cmp !== 0) return cmp * dir
        }
        return 0
      })
    }
    const offset = query.offset ?? 0
    const limit = query.limit == null ? undefined : offset + query.limit
    return result.slice(offset, limit)
  }

  async get(id: PropertyKey): Promise<T | null> {
    const [record] = await this.ctx.database.get(this.table as never, { id } as never)
    return (record as T) ?? null
  }

  async create(data: Partial<T>): Promise<T> {
    return this.ctx.database.create(this.table as never, data as never) as Promise<T>
  }

  async update(id: PropertyKey, patch: Partial<T>): Promise<T> {
    await this.ctx.database.set(this.table as never, { id } as never, patch as never)
    const value = await this.get(id)
    if (!value) throw new Error(`Record not found: ${String(id)}`)
    return value
  }

  async delete(id: PropertyKey): Promise<void> {
    await this.ctx.database.remove(this.table as never, { id } as never)
  }
}

export interface CachedDriverOptions {
  ttl?: number
}

export class CachedDriver<T extends { id?: PropertyKey }> implements CollectionDriver<T> {
  protected expiresAt = 0

  constructor(
    protected source: CollectionDriver<T>,
    protected cache: CollectionDriver<T>,
    protected options: CachedDriverOptions = {},
  ) {}

  protected isFresh() {
    const ttl = this.options.ttl ?? 60_000
    return Date.now() < this.expiresAt && ttl > 0
  }

  protected async refill() {
    const records = await this.source.list()
    if (this.cache.delete && this.cache.get) {
      const current = await this.cache.list()
      for (const record of current) {
        if ((record as any)?.id != null) {
          await this.cache.delete((record as any).id)
        }
      }
    }
    if (this.cache.create) {
      for (const record of records) {
        await this.cache.create(record)
      }
    }
    this.expiresAt = Date.now() + (this.options.ttl ?? 60_000)
  }

  protected async ensureFresh() {
    if (!this.isFresh()) await this.refill()
  }

  async list(query?: Query<T>): Promise<T[]> {
    await this.ensureFresh()
    return this.cache.list(query)
  }

  async get(id: PropertyKey): Promise<T | null> {
    await this.ensureFresh()
    if (this.cache.get) return this.cache.get(id)
    const records = await this.cache.list()
    return records.find(record => (record as any)?.id === id) ?? null
  }

  async create(data: Partial<T>): Promise<T> {
    if (!this.source.create) throw new Error('Source driver does not support create().')
    const value = await this.source.create(data)
    this.expiresAt = 0
    return value
  }

  async update(id: PropertyKey, patch: Partial<T>): Promise<T> {
    if (!this.source.update) throw new Error('Source driver does not support update().')
    const value = await this.source.update(id, patch)
    this.expiresAt = 0
    return value
  }

  async delete(id: PropertyKey): Promise<void> {
    if (!this.source.delete) throw new Error('Source driver does not support delete().')
    await this.source.delete(id)
    this.expiresAt = 0
  }

  watch(handler: (event: any) => void) {
    if (!this.source.watch) {
      return () => {}
    }
    return this.source.watch((event) => {
      this.expiresAt = 0
      handler(event)
    })
  }
}
