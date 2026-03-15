import { Context } from 'cordis'
import type { ChangeEvent, CollectionDriver, Query, ResolvedDomainDefinition, SingletonDriver } from './types.js'

export class UnsupportedOperationError extends Error {
  constructor(public collection: string, public operation: string) {
    super(`Collection \"${collection}\" does not support ${operation}().`)
  }
}

function emitChange<T>(ctx: Context, name: string, event: ChangeEvent<T>) {
  ctx.emit('datasource/change', name, event)
}

export class Collection<T> {
  constructor(
    protected ctx: Context,
    public readonly name: string,
    protected driver: CollectionDriver<T>,
    public readonly definition: ResolvedDomainDefinition,
  ) {}

  get readable() {
    return true
  }

  get writable() {
    return this.definition.writable
  }

  async list(query?: Query<T>): Promise<T[]> {
    return this.driver.list(query)
  }

  async get(id: PropertyKey): Promise<T | null> {
    if (this.driver.get) return this.driver.get(id)
    const records = await this.driver.list()
    return records.find((record) => (record as any)?.id === id) ?? null
  }

  async create(data: Partial<T>): Promise<T> {
    if (!this.driver.create) throw new UnsupportedOperationError(this.name, 'create')
    const value = await this.driver.create(data)
    emitChange(this.ctx, this.name, { type: 'create', id: (value as any)?.id, data: value })
    return value
  }

  async update(id: PropertyKey, patch: Partial<T>): Promise<T> {
    if (!this.driver.update) throw new UnsupportedOperationError(this.name, 'update')
    const value = await this.driver.update(id, patch)
    emitChange(this.ctx, this.name, { type: 'update', id, data: value })
    return value
  }

  async delete(id: PropertyKey): Promise<void> {
    if (!this.driver.delete) throw new UnsupportedOperationError(this.name, 'delete')
    await this.driver.delete(id)
    emitChange(this.ctx, this.name, { type: 'delete', id })
  }
}

export class Singleton<T> {
  constructor(
    protected ctx: Context,
    public readonly name: string,
    protected driver: SingletonDriver<T>,
    public readonly definition: ResolvedDomainDefinition,
  ) {}

  get writable() {
    return this.definition.writable
  }

  async get(): Promise<T | null> {
    return this.driver.get()
  }

  async set(value: T | Partial<T>): Promise<T> {
    if (!this.driver.set) throw new UnsupportedOperationError(this.name, 'set')
    const result = await this.driver.set(value)
    emitChange(this.ctx, this.name, { type: 'update', data: result })
    return result
  }
}
