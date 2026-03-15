import type { Schema } from 'cordis'

export interface QuerySort<T> {
  field: keyof T
  order?: 'asc' | 'desc'
}

export interface Query<T> {
  filter?: Partial<T>
  limit?: number
  offset?: number
  sort?: QuerySort<T>[]
}

export interface ChangeEvent<T> {
  type: 'create' | 'update' | 'delete' | 'refresh'
  id?: PropertyKey
  data?: T
}

export interface DomainDisplay {
  label?: string
  singular?: string
  description?: string
  icon?: string
  order?: number
  primaryKey?: string
  titleKey?: string
  summaryKeys?: string[]
}

export interface DomainOperations {
  create?: boolean
  update?: boolean
  delete?: boolean
  set?: boolean
}

export interface DomainDefinitionBase {
  schema?: Schema
  writable?: boolean
  display?: DomainDisplay
  operations?: DomainOperations
}

export interface CollectionDefinition extends DomainDefinitionBase {
  kind?: 'collection'
}

export interface SingletonDefinition extends DomainDefinitionBase {
  kind?: 'singleton'
}

export interface ResolvedDomainDefinition {
  kind: 'collection' | 'singleton'
  schema?: Schema
  writable: boolean
  operations: Required<DomainOperations>
  display: DomainDisplay
}

export type WatchHandler<T> = (event: ChangeEvent<T>) => void

export interface CollectionDriver<T> {
  list(query?: Query<T>): Promise<T[]>
  get?(id: PropertyKey): Promise<T | null>
  create?(data: Partial<T>): Promise<T>
  update?(id: PropertyKey, patch: Partial<T>): Promise<T>
  delete?(id: PropertyKey): Promise<void>
  watch?(handler: WatchHandler<T>): (() => void) | Promise<() => void>
}

export interface SingletonDriver<T> {
  get(): Promise<T | null>
  set?(value: T | Partial<T>): Promise<T>
  watch?(handler: (value: T | null) => void): (() => void) | Promise<() => void>
}
