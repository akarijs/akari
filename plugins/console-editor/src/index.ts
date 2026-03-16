import { Context } from 'cordis'
import type { DomainDescriptor } from '@akari/core'
import { fileURLToPath } from 'node:url'

export const name = 'console-editor'
export const inject = ['console', 'datasource']

interface SerializedSchema {
  uid: number
  refs: Record<string, Record<string, any>>
}

export interface ConsoleDomain {
  name: string
  kind: 'collection' | 'singleton'
  writable: boolean
  operations: {
    create: boolean
    update: boolean
    delete: boolean
    set: boolean
  }
  display: {
    label?: string
    singular?: string
    description?: string
    icon?: string
    order?: number
    primaryKey?: string
    titleKey?: string
    summaryKeys?: string[]
  }
  schema: SerializedSchema | null
}

function serializeSchema(schema: unknown): SerializedSchema | null {
  if (!schema) return null
  return JSON.parse(JSON.stringify(schema, (_key, value) => {
    if (typeof value === 'function') return value.name || String(value)
    return value
  }))
}

function normalizeDomain(domain: DomainDescriptor): ConsoleDomain {
  return {
    name: domain.name,
    kind: domain.kind,
    writable: domain.writable,
    operations: domain.operations,
    display: domain.display,
    schema: serializeSchema(domain.schema),
  }
}

function getDomain(ctx: Context, name: string): DomainDescriptor {
  return ctx.datasource.describeCollection(name)
    ?? ctx.datasource.describeSingleton(name)
    ?? (() => { throw new Error(`Datasource domain not found: ${name}`) })()
}

function parseBySchema(schema: unknown, value: any) {
  if (!schema) return value
  return (schema as any)(value)
}

function mergeRecord(base: any, patch: any) {
  if (!base || typeof base !== 'object') return patch
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch
  return { ...base, ...patch }
}

export function apply(ctx: Context) {
  ctx.console.addRoute({ path: 'content', title: '内容管理' })

  const entryFile = fileURLToPath(new URL('../src/web/index.ts', import.meta.url))
  const bundleFile = fileURLToPath(new URL('../dist/web/index.js', import.meta.url))
  ctx.console.addEntry(
    { dev: entryFile, prod: bundleFile },
    () => ({ label: '内容管理', order: 10 }),
  )

  ctx.console.addListener('datasource/definitions', async () => {
    return ctx.datasource.describeAll().map(normalizeDomain)
  })

  ctx.console.addListener('datasource/read', async (name: string) => {
    const domain = getDomain(ctx, name)
    if (domain.kind === 'collection') {
      return ctx.datasource.collection(name).list()
    }
    return ctx.datasource.singleton(name).get()
  })

  ctx.console.addListener('datasource/create', async (name: string, payload: any) => {
    const domain = getDomain(ctx, name)
    if (domain.kind !== 'collection') throw new Error(`Datasource domain ${name} is not a collection.`)
    if (!domain.operations.create) throw new Error(`Datasource domain ${name} does not support create.`)
    const data = parseBySchema(domain.schema, payload)
    return ctx.datasource.collection(name).create(data)
  })

  ctx.console.addListener('datasource/update', async (name: string, id: PropertyKey, payload: any) => {
    const domain = getDomain(ctx, name)
    if (domain.kind !== 'collection') throw new Error(`Datasource domain ${name} is not a collection.`)
    if (!domain.operations.update) throw new Error(`Datasource domain ${name} does not support update.`)
    const current = await ctx.datasource.collection(name).get(id)
    if (!current) throw new Error(`Datasource record not found: ${name}:${String(id)}`)
    const data = parseBySchema(domain.schema, payload)
    return ctx.datasource.collection(name).update(id, mergeRecord(current, data))
  })

  ctx.console.addListener('datasource/delete', async (name: string, id: PropertyKey) => {
    const domain = getDomain(ctx, name)
    if (domain.kind !== 'collection') throw new Error(`Datasource domain ${name} is not a collection.`)
    if (!domain.operations.delete) throw new Error(`Datasource domain ${name} does not support delete.`)
    await ctx.datasource.collection(name).delete(id)
    return true
  })

  ctx.console.addListener('datasource/set', async (name: string, payload: any) => {
    const domain = getDomain(ctx, name)
    if (domain.kind !== 'singleton') throw new Error(`Datasource domain ${name} is not a singleton.`)
    if (!domain.operations.set) throw new Error(`Datasource domain ${name} does not support set.`)
    const current = await ctx.datasource.singleton(name).get()
    const data = parseBySchema(domain.schema, payload)
    return ctx.datasource.singleton(name).set(mergeRecord(current, data))
  })
}
