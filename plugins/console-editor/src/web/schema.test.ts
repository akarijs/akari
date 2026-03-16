import { describe, expect, it } from 'vitest'
import {
  defaultValue,
  formValue,
  isOptionalNode,
  matchBranchIndex,
  optionalNode,
  previewValue,
  rootNode,
  type SerializedSchema,
  variantBranches,
  visibleObjectEntries,
} from './schema.js'

describe('schema helpers', () => {
  const schema: SerializedSchema = {
    uid: 1,
    refs: {
      '1': { type: 'intersect', list: [2, 6] },
      '2': { type: 'object', dict: { name: 3, enabled: 4 } },
      '3': { type: 'string', meta: { label: '名称' } },
      '4': { type: 'union', list: [5, 8] },
      '5': { type: 'const', value: undefined },
      '6': { type: 'object', dict: { advanced: 7, secret: 9 } },
      '7': { type: 'number', meta: { default: 12 } },
      '8': { type: 'boolean' },
      '9': { type: 'string', meta: { role: 'secret' } },
      '10': { type: 'union', list: [11, 12] },
      '11': { type: 'object', dict: { slug: 13 } },
      '12': { type: 'array', inner: 14 },
      '13': { type: 'string' },
      '14': { type: 'string' },
    },
  }

  it('merges intersect object entries', () => {
    const entries = visibleObjectEntries(schema, rootNode(schema))
    expect(entries.map(([key]) => key)).toEqual(['name', 'enabled', 'advanced', 'secret'])
  })

  it('treats union with undefined as optional wrapper', () => {
    const enabledNode = schema.refs['4']
    expect(isOptionalNode(schema, enabledNode)).toBe(true)
    expect(optionalNode(schema, enabledNode)?.type).toBe('boolean')
    expect(defaultValue(schema, enabledNode)).toBeUndefined()
  })

  it('merges intersect defaults and source values', () => {
    const value = formValue(schema, rootNode(schema), { name: 'akari', enabled: true })
    expect(value).toEqual({
      name: 'akari',
      enabled: true,
      advanced: 12,
      secret: '',
    })
  })

  it('matches non-const union variants by runtime value', () => {
    const variants = variantBranches(schema, schema.refs['10'])
    expect(matchBranchIndex(schema, variants, { slug: 'post' })).toBe(0)
    expect(matchBranchIndex(schema, variants, ['a', 'b'])).toBe(1)
  })

  it('masks secret preview values', () => {
    expect(previewValue(schema, schema.refs['9'], 'top-secret')).toBe('••••••••')
  })
})