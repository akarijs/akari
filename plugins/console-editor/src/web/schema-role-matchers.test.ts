import { describe, expect, it } from 'vitest'
import { matchRoleRenderer } from './schema-role-matchers.js'
import type { SerializedSchema } from './schema.js'

describe('schema role matchers', () => {
  it('matches table renderer for primitive arrays', () => {
    const schema: SerializedSchema = {
      uid: 1,
      refs: {
        '1': { type: 'array', inner: 2, meta: { role: 'table' } },
        '2': { type: 'string' },
      },
    }
    expect(matchRoleRenderer(schema, schema.refs['1'])).toBe('table')
  })

  it('matches text renderer for secret fields', () => {
    const schema: SerializedSchema = {
      uid: 1,
      refs: {
        '1': { type: 'string', meta: { role: 'secret' } },
      },
    }
    expect(matchRoleRenderer(schema, schema.refs['1'])).toBe('textual')
  })

  it('does not hijack complex arrays without supported primitive table item', () => {
    const schema: SerializedSchema = {
      uid: 1,
      refs: {
        '1': { type: 'array', inner: 2, meta: { role: 'table' } },
        '2': { type: 'object', dict: { title: 3 } },
        '3': { type: 'string' },
      },
    }
    expect(matchRoleRenderer(schema, schema.refs['1'])).toBeNull()
  })
})