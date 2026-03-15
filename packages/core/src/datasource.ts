import { Context, Service } from 'cordis'
import { Collection, Singleton } from './datasource/collection.js'
import type {
  ChangeEvent,
  CollectionDefinition,
  CollectionDriver,
  DomainDefinitionBase,
  DomainDisplay,
  DomainOperations,
  ResolvedDomainDefinition,
  SingletonDefinition,
  SingletonDriver,
} from './datasource/types.js'

export interface ListCollections {}

export interface SingletonCollections {}

export interface DomainDescriptor extends ResolvedDomainDefinition {
  name: string
}

function resolveOperations(kind: 'collection' | 'singleton', capabilities: DomainOperations, writable: boolean): Required<DomainOperations> {
  return {
    create: kind === 'collection' ? !!capabilities.create && writable : false,
    update: kind === 'collection' ? !!capabilities.update && writable : false,
    delete: kind === 'collection' ? !!capabilities.delete && writable : false,
    set: kind === 'singleton' ? !!capabilities.set && writable : false,
  }
}

function resolveDefinition(
  kind: 'collection' | 'singleton',
  definition: DomainDefinitionBase | undefined,
  capabilities: DomainOperations,
): ResolvedDomainDefinition {
  const writable = definition?.writable ?? Object.values(capabilities).some(Boolean)
  return {
    kind,
    schema: definition?.schema,
    writable,
    operations: resolveOperations(kind, capabilities, writable),
    display: definition?.display ?? {} satisfies DomainDisplay,
  }
}

declare module 'cordis' {
  interface Context {
    datasource: DataSource
  }

  interface Events {
    'datasource/registered'(name: string, kind: 'collection' | 'singleton'): void
    'datasource/unregistered'(name: string, kind: 'collection' | 'singleton'): void
    'datasource/change'(name: string, event: ChangeEvent<any>): void
  }
}

export class DataSource extends Service {
  static [Service.provide] = 'datasource'
  static [Service.immediate] = true

  protected collections = new Map<string, Collection<any>>()
  protected singletons = new Map<string, Singleton<any>>()

  constructor(ctx: Context) {
    super(ctx)
  }

  defineCollection<K extends keyof ListCollections & string>(
    name: K,
    driver: CollectionDriver<ListCollections[K]>,
    definition?: CollectionDefinition,
  ) {
    if (this.collections.has(name) || this.singletons.has(name)) {
      throw new Error(`Datasource name already registered: ${name}`)
    }

    const collection = new Collection(this.ctx, name, driver, resolveDefinition('collection', definition, {
      create: !!driver.create,
      update: !!driver.update,
      delete: !!driver.delete,
    }))
    this.collections.set(name, collection)
    this.ctx.emit('datasource/registered', name, 'collection')

    let disposeWatch: undefined | (() => void)
    this[Context.current].effect(() => {
      const cleanup = driver.watch?.((event) => {
        this.ctx.emit('datasource/change', name, event)
      })
      Promise.resolve(cleanup).then((result) => {
        disposeWatch = result
      })
      return () => {
        disposeWatch?.()
        this.collections.delete(name)
        this.ctx.emit('datasource/unregistered', name, 'collection')
      }
    })

    return collection
  }

  defineSingleton<K extends keyof SingletonCollections & string>(
    name: K,
    driver: SingletonDriver<SingletonCollections[K]>,
    definition?: SingletonDefinition,
  ) {
    if (this.collections.has(name) || this.singletons.has(name)) {
      throw new Error(`Datasource name already registered: ${name}`)
    }

    const singleton = new Singleton(this.ctx, name, driver, resolveDefinition('singleton', definition, {
      set: !!driver.set,
    }))
    this.singletons.set(name, singleton)
    this.ctx.emit('datasource/registered', name, 'singleton')

    let disposeWatch: undefined | (() => void)
    this[Context.current].effect(() => {
      const cleanup = driver.watch?.((value) => {
        this.ctx.emit('datasource/change', name, { type: 'update', data: value as any })
      })
      Promise.resolve(cleanup).then((result) => {
        disposeWatch = result
      })
      return () => {
        disposeWatch?.()
        this.singletons.delete(name)
        this.ctx.emit('datasource/unregistered', name, 'singleton')
      }
    })

    return singleton
  }

  collection<K extends keyof ListCollections & string>(name: K): Collection<ListCollections[K]>
  collection<T = unknown>(name: string): Collection<T>
  collection(name: string) {
    const collection = this.collections.get(name)
    if (!collection) throw new Error(`Datasource collection not found: ${name}`)
    return collection
  }

  singleton<K extends keyof SingletonCollections & string>(name: K): Singleton<SingletonCollections[K]>
  singleton<T = unknown>(name: string): Singleton<T>
  singleton(name: string) {
    const singleton = this.singletons.get(name)
    if (!singleton) throw new Error(`Datasource singleton not found: ${name}`)
    return singleton
  }

  hasCollection(name: string) {
    return this.collections.has(name)
  }

  hasSingleton(name: string) {
    return this.singletons.has(name)
  }

  listCollections() {
    return [...this.collections.keys()]
  }

  listSingletons() {
    return [...this.singletons.keys()]
  }

  describeCollection(name: string): DomainDescriptor | null {
    const collection = this.collections.get(name)
    if (!collection) return null
    return { name, ...collection.definition }
  }

  describeSingleton(name: string): DomainDescriptor | null {
    const singleton = this.singletons.get(name)
    if (!singleton) return null
    return { name, ...singleton.definition }
  }

  describeAll(): DomainDescriptor[] {
    return [
      ...[...this.collections.entries()].map(([name, collection]) => ({ name, ...collection.definition })),
      ...[...this.singletons.entries()].map(([name, singleton]) => ({ name, ...singleton.definition })),
    ].sort((left, right) => {
      const order = (left.display.order ?? 0) - (right.display.order ?? 0)
      return order || left.name.localeCompare(right.name)
    })
  }
}

export type {
  ChangeEvent,
  CollectionDefinition,
  CollectionDriver,
  DomainDefinitionBase,
  DomainDisplay,
  DomainOperations,
  Query,
  ResolvedDomainDefinition,
  SingletonDefinition,
  SingletonDriver,
} from './datasource/types.js'
export { Collection, Singleton, UnsupportedOperationError } from './datasource/collection.js'
export { MemoryDriver, MemorySingleton } from './datasource/memory.js'
export { CachedDriver, MinatoDriver } from './datasource/minato.js'
