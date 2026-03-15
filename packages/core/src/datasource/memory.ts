import type { CollectionDriver, Query, SingletonDriver } from './types.js'

function matches<T>(value: T, filter?: Partial<T>) {
  if (!filter) return true
  return Object.entries(filter).every(([key, expected]) => {
    return (value as any)[key] === expected
  })
}

function compareValues(left: unknown, right: unknown) {
  if (left == null && right == null) return 0
  if (left == null) return -1
  if (right == null) return 1
  if (left instanceof Date && right instanceof Date) return left.getTime() - right.getTime()
  if (typeof left === 'number' && typeof right === 'number') return left - right
  return String(left).localeCompare(String(right))
}

function applyQuery<T>(records: T[], query?: Query<T>) {
  let result = query?.filter ? records.filter(record => matches(record, query.filter)) : [...records]
  if (query?.sort?.length) {
    result.sort((a, b) => {
      for (const item of query.sort!) {
        const direction = item.order === 'desc' ? -1 : 1
        const value = compareValues((a as any)[item.field], (b as any)[item.field])
        if (value !== 0) return value * direction
      }
      return 0
    })
  }
  if (query?.offset) result = result.slice(query.offset)
  if (query?.limit != null) result = result.slice(0, query.limit)
  return result
}

export class MemoryDriver<T extends { id?: PropertyKey }> implements CollectionDriver<T> {
  protected records = new Map<PropertyKey, T>()
  protected nextId = 1

  constructor(initial: T[] = []) {
    for (const item of initial) {
      const id = item.id ?? this.nextId++
      this.records.set(id, { ...item, id } as T)
      if (typeof id === 'number') this.nextId = Math.max(this.nextId, id + 1)
    }
  }

  async list(query?: Query<T>): Promise<T[]> {
    return applyQuery(Array.from(this.records.values()), query)
  }

  async get(id: PropertyKey): Promise<T | null> {
    return this.records.get(id) ?? null
  }

  async create(data: Partial<T>): Promise<T> {
    const id = (data as any).id ?? this.nextId++
    const value = { ...data, id } as T
    this.records.set(id, value)
    return value
  }

  async update(id: PropertyKey, patch: Partial<T>): Promise<T> {
    const current = this.records.get(id)
    if (!current) throw new Error(`Record not found: ${String(id)}`)
    const next = { ...current, ...patch, id } as T
    this.records.set(id, next)
    return next
  }

  async delete(id: PropertyKey): Promise<void> {
    this.records.delete(id)
  }

  async replaceAll(records: T[]): Promise<void> {
    this.records.clear()
    this.nextId = 1
    for (const item of records) {
      const id = item.id ?? this.nextId++
      this.records.set(id, { ...item, id } as T)
      if (typeof id === 'number') this.nextId = Math.max(this.nextId, id + 1)
    }
  }
}

export class MemorySingleton<T> implements SingletonDriver<T> {
  constructor(protected value: T | null = null) {}

  async get(): Promise<T | null> {
    return this.value
  }

  async set(value: T | Partial<T>): Promise<T> {
    if (this.value && typeof this.value === 'object' && value && typeof value === 'object' && !Array.isArray(value)) {
      this.value = { ...(this.value as any), ...(value as any) }
    } else {
      this.value = value as T
    }
    return this.value as T
  }
}
