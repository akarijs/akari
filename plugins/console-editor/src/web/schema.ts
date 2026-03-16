export interface SerializedSchemaNode {
  type: string
  meta?: Record<string, any>
  inner?: number
  list?: number[]
  dict?: Record<string, number>
  value?: any
  constructor?: string
}

export interface SerializedSchema {
  uid: number
  refs: Record<string, SerializedSchemaNode>
}

export interface EnumOption {
  label: string
  value: any
}

export function nodeRole(schema: SerializedSchema | null | undefined, node?: SerializedSchemaNode | null) {
  return unwrapNode(schema, node)?.meta?.role as string | undefined
}

export function isPrimitiveNode(schema: SerializedSchema | null | undefined, node?: SerializedSchemaNode | null) {
  const target = unwrapNode(schema, node)
  if (!target) return false
  if (target.type === 'const' || target.type === 'string' || target.type === 'number' || target.type === 'boolean') return true
  if (isDateNode(schema, target)) return true
  const optional = optionalNode(schema, target)
  return !!optional && isPrimitiveNode(schema, optional)
}

function cloneValue<T>(value: T): T {
  if (value === undefined || value === null) return value
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value)) as T
}

export function resolveNode(schema: SerializedSchema | null | undefined, ref?: number | SerializedSchemaNode | null) {
  if (!schema || ref == null) return null
  if (typeof ref === 'object') return ref
  return schema.refs[String(ref)] ?? null
}

export function unwrapNode(schema: SerializedSchema | null | undefined, node?: SerializedSchemaNode | null): SerializedSchemaNode | null {
  if (!schema || !node) return null
  if (node.type === 'transform' || node.type === 'computed') {
    return unwrapNode(schema, resolveNode(schema, node.inner))
  }
  return node
}

export function rootNode(schema: SerializedSchema | null | undefined) {
  if (!schema) return null
  return unwrapNode(schema, resolveNode(schema, schema.uid))
}

export function visibleObjectEntries(schema: SerializedSchema | null | undefined, node?: SerializedSchemaNode | null) {
  const target = unwrapNode(schema, node)
  if (!schema || !target) return [] as Array<[string, SerializedSchemaNode]>
  if (target.type === 'intersect' && target.list?.length) {
    const entries = new Map<string, SerializedSchemaNode>()
    for (const ref of target.list) {
      for (const [key, child] of visibleObjectEntries(schema, resolveNode(schema, ref))) {
        entries.set(key, child)
      }
    }
    return [...entries.entries()]
  }
  if (target.type !== 'object' || !target.dict) return [] as Array<[string, SerializedSchemaNode]>
  return Object.entries(target.dict)
    .map(([key, ref]) => [key, unwrapNode(schema, resolveNode(schema, ref))] as const)
    .filter((entry): entry is [string, SerializedSchemaNode] => !!entry[1] && !entry[1].meta?.hidden)
}

export function isDateNode(schema: SerializedSchema | null | undefined, node?: SerializedSchemaNode | null): boolean {
  const target = unwrapNode(schema, node)
  if (!schema || !target) return false
  if (target.type === 'string') return target.meta?.role === 'datetime'
  if (target.type === 'is') return target.constructor === 'Date'
  if (target.type === 'union') return (target.list || []).some(ref => isDateNode(schema, resolveNode(schema, ref)))
  return false
}

export function enumOptions(schema: SerializedSchema | null | undefined, node?: SerializedSchemaNode | null) {
  const target = unwrapNode(schema, node)
  if (!schema || !target) return null as EnumOption[] | null
  if (target.type === 'const') {
    return [{
      value: target.value,
      label: constantLabel(target),
    }]
  }
  if (target.type !== 'union' || !target.list?.length) return null as EnumOption[] | null
  const values = target.list.map(ref => unwrapNode(schema, resolveNode(schema, ref))).filter(Boolean)
  if (!values.every(item => item!.type === 'const')) return null as EnumOption[] | null
  return values.map(item => ({
    value: item!.value,
    label: constantLabel(item!),
  }))
}

export function arrayItemNode(schema: SerializedSchema | null | undefined, node?: SerializedSchemaNode | null) {
  const target = unwrapNode(schema, node)
  if (!schema || !target || target.type !== 'array') return null
  return unwrapNode(schema, resolveNode(schema, target.inner))
}

export function dictValueNode(schema: SerializedSchema | null | undefined, node?: SerializedSchemaNode | null) {
  const target = unwrapNode(schema, node)
  if (!schema || !target || target.type !== 'dict') return null
  return unwrapNode(schema, resolveNode(schema, target.inner))
}

export function unionBranches(schema: SerializedSchema | null | undefined, node?: SerializedSchemaNode | null) {
  const target = unwrapNode(schema, node)
  if (!schema || !target || target.type !== 'union' || !target.list?.length) return [] as SerializedSchemaNode[]
  return target.list
    .map(ref => unwrapNode(schema, resolveNode(schema, ref)))
    .filter((item): item is SerializedSchemaNode => !!item)
}

export function isOptionalNode(schema: SerializedSchema | null | undefined, node?: SerializedSchemaNode | null) {
  const branches = unionBranches(schema, node)
  if (!branches.length) return false
  const requiredBranches = branches.filter(branch => !isEmptyConst(branch))
  return branches.length !== requiredBranches.length && requiredBranches.length === 1
}

export function optionalNode(schema: SerializedSchema | null | undefined, node?: SerializedSchemaNode | null) {
  const branches = unionBranches(schema, node)
  if (!branches.length) return null
  const requiredBranches = branches.filter(branch => !isEmptyConst(branch))
  return requiredBranches.length === 1 && requiredBranches.length !== branches.length ? requiredBranches[0] : null
}

export function variantBranches(schema: SerializedSchema | null | undefined, node?: SerializedSchemaNode | null) {
  const branches = unionBranches(schema, node)
  if (branches.length <= 1) return [] as SerializedSchemaNode[]
  if (branches.every(branch => branch.type === 'const')) return [] as SerializedSchemaNode[]
  const filtered = branches.filter(branch => !isEmptyConst(branch))
  return filtered.length > 1 ? filtered : []
}

export function branchLabel(schema: SerializedSchema | null | undefined, node?: SerializedSchemaNode | null, index = 0) {
  const target = unwrapNode(schema, node)
  if (!target) return `选项 ${index + 1}`
  if (target.meta?.description) return String(target.meta.description)
  if (target.meta?.label) return String(target.meta.label)
  if (target.type === 'const') return constantLabel(target)
  if (target.type === 'object') return `对象 ${index + 1}`
  if (target.type === 'array') return `列表 ${index + 1}`
  if (target.type === 'dict') return `字典 ${index + 1}`
  if (target.type === 'boolean') return '布尔值'
  if (target.type === 'number') return '数字'
  if (isDateNode(schema, target)) return '日期时间'
  return target.type
}

export function matchBranchIndex(schema: SerializedSchema | null | undefined, branches: SerializedSchemaNode[], value: any) {
  if (!branches.length) return 0
  const index = branches.findIndex(branch => matchesNode(schema, branch, value))
  return index >= 0 ? index : 0
}

export function isSecretNode(schema: SerializedSchema | null | undefined, node?: SerializedSchemaNode | null) {
  return unwrapNode(schema, node)?.meta?.role === 'secret'
}

export function inputType(schema: SerializedSchema | null | undefined, node?: SerializedSchemaNode | null) {
  const target = unwrapNode(schema, node)
  if (!target) return 'text'
  if (isSecretNode(schema, target)) return 'password'
  const role = nodeRole(schema, target)
  if (role === 'link' || role === 'url') return 'url'
  if (role === 'email') return 'email'
  return 'text'
}

export function isReadonlyNode(schema: SerializedSchema | null | undefined, node?: SerializedSchemaNode | null) {
  const target = unwrapNode(schema, node)
  return !!target && (target.type === 'const' || target.type === 'function' || target.type === 'computed')
}

export function fieldLabel(key: string, node?: SerializedSchemaNode | null) {
  return node?.meta?.label || key
}

export function defaultValue(schema: SerializedSchema | null | undefined, node?: SerializedSchemaNode | null): any {
  const target = unwrapNode(schema, node)
  if (!target) return null
  if (target.meta && 'default' in target.meta) return cloneValue(target.meta.default)
  if (target.type === 'intersect') {
    return target.list?.reduce((result, ref) => {
      const child = resolveNode(schema, ref)
      const value = defaultValue(schema, child)
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return { ...result, ...value }
      }
      return Object.keys(result).length ? result : value
    }, {} as Record<string, any>) ?? {}
  }
  if (target.type === 'union') {
    const optional = optionalNode(schema, target)
    if (optional) return undefined
    const variants = variantBranches(schema, target)
    if (variants.length) return defaultValue(schema, variants[0])
  }
  if (target.type === 'object') {
    const result: Record<string, any> = {}
    for (const [key, child] of visibleObjectEntries(schema, target)) {
      const value = defaultValue(schema, child)
      if (value !== undefined) result[key] = value
    }
    return result
  }
  if (target.type === 'array' || target.type === 'tuple') return []
  if (target.type === 'dict') return {}
  if (target.type === 'boolean') return false
  if (target.type === 'number') return 0
  if (isDateNode(schema, target)) return ''
  if (target.type === 'const') return cloneValue(target.value)
  const options = enumOptions(schema, target)
  if (options?.length) return cloneValue(options[0].value)
  return ''
}

export function formValue(schema: SerializedSchema | null | undefined, node: SerializedSchemaNode | null, source?: any): any {
  const target = unwrapNode(schema, node)
  if (!target) return source ?? null
  if (source !== undefined && source !== null) {
    if (target.type === 'intersect') {
      const result: Record<string, any> = {}
      for (const [key, child] of visibleObjectEntries(schema, target)) {
        result[key] = formValue(schema, child, source[key])
      }
      return result
    }
    if (target.type === 'union') {
      const optional = optionalNode(schema, target)
      if (optional && (source === undefined || source === null)) return undefined
      const variants = variantBranches(schema, target)
      if (variants.length) {
        const active = variants[matchBranchIndex(schema, variants, source)]
        return formValue(schema, active, source)
      }
    }
    if (target.type === 'object') {
      const result: Record<string, any> = {}
      for (const [key, child] of visibleObjectEntries(schema, target)) {
        result[key] = formValue(schema, child, source[key])
      }
      return result
    }
    if (isDateNode(schema, target)) {
      const date = source instanceof Date ? source : new Date(source)
      if (Number.isNaN(date.getTime())) return ''
      return date.toISOString().slice(0, 16)
    }
    if (target.type === 'array') {
      const item = arrayItemNode(schema, target)
      return Array.isArray(source) ? source.map(value => formValue(schema, item, value)) : []
    }
    if (target.type === 'dict') {
      const item = dictValueNode(schema, target)
      if (!source || typeof source !== 'object' || Array.isArray(source)) return {}
      return Object.fromEntries(Object.entries(source).map(([key, value]) => [key, formValue(schema, item, value)]))
    }
    return cloneValue(source)
  }
  return defaultValue(schema, target)
}

export function previewValue(schema: SerializedSchema | null | undefined, node: SerializedSchemaNode | null, value: any): string {
  const target = unwrapNode(schema, node)
  const role = nodeRole(schema, target)
  if (value === undefined || value === null || value === '') return '—'
  if (isDateNode(schema, target)) {
    const date = value instanceof Date ? value : new Date(value)
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString()
  }
  if (target?.type === 'boolean') return value ? '是' : '否'
  if (isSecretNode(schema, target)) return '••••••••'
  if ((role === 'ms' || role === 'time') && typeof value === 'number') return `${value} ms`
  if (target?.type === 'union') {
    const variants = variantBranches(schema, target)
    if (variants.length) {
      return previewValue(schema, variants[matchBranchIndex(schema, variants, value)], value)
    }
  }
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
}

export function summarizeValue(schema: SerializedSchema | null | undefined, node: SerializedSchemaNode | null, value: any, maxParts = 2): string {
  const target = unwrapNode(schema, node)
  if (value === undefined || value === null || value === '') return '未设置'
  if (!target) return previewValue(schema, target, value)
  if (target.type === 'object' || target.type === 'intersect') {
    const parts = visibleObjectEntries(schema, target)
      .map(([key, child]) => {
        const text = previewValue(schema, child, value?.[key])
        return text === '—' ? null : `${fieldLabel(key, child)}: ${text}`
      })
      .filter(Boolean)
      .slice(0, maxParts) as string[]
    return parts.length ? parts.join(' · ') : '空对象'
  }
  if (target.type === 'array') {
    const item = arrayItemNode(schema, target)
    const list = Array.isArray(value) ? value : []
    if (!list.length) return '空列表'
    const parts = list.slice(0, maxParts).map(itemValue => previewValue(schema, item, itemValue))
    return list.length > maxParts ? `${parts.join(' · ')} · +${list.length - maxParts}` : parts.join(' · ')
  }
  return previewValue(schema, target, value)
}

function isEmptyConst(node?: SerializedSchemaNode | null) {
  return !!node && node.type === 'const' && (node.value === undefined || node.value === null)
}

function constantLabel(node: SerializedSchemaNode) {
  if (node.meta?.description) return String(node.meta.description)
  if (node.value === undefined) return '未设置'
  if (node.value === null) return '空值'
  return String(node.value)
}

function matchesNode(schema: SerializedSchema | null | undefined, node: SerializedSchemaNode | null, value: any): boolean {
  const target = unwrapNode(schema, node)
  if (!target) return value == null
  if (target.type === 'const') return Object.is(target.value, value)
  if (target.type === 'object' || target.type === 'intersect') return !!value && typeof value === 'object' && !Array.isArray(value)
  if (target.type === 'array' || target.type === 'tuple') return Array.isArray(value)
  if (target.type === 'dict') return !!value && typeof value === 'object' && !Array.isArray(value)
  if (target.type === 'boolean') return typeof value === 'boolean'
  if (target.type === 'number') return typeof value === 'number'
  if (isDateNode(schema, target)) return value instanceof Date || typeof value === 'string' || typeof value === 'number'
  return typeof value === 'string'
}