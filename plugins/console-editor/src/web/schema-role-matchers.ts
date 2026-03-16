import { arrayItemNode, dictValueNode, isPrimitiveNode, nodeRole, type SerializedSchema, type SerializedSchemaNode } from './schema'

export type SchemaRoleRendererName = 'textarea' | 'table' | 'duration' | 'textual'

export function matchRoleRenderer(schema: SerializedSchema | null, node: SerializedSchemaNode | null): SchemaRoleRendererName | null {
  const role = nodeRole(schema, node)
  if (role === 'textarea') return 'textarea'
  if ((role === 'ms' || role === 'time')) return 'duration'
  if (['secret', 'link', 'url', 'path', 'theme', 'email'].includes(role || '')) return 'textual'
  if (role === 'table' && node) {
    if (node.type === 'array' && isPrimitiveNode(schema, arrayItemNode(schema, node))) return 'table'
    if (node.type === 'dict' && isPrimitiveNode(schema, dictValueNode(schema, node))) return 'table'
  }
  return null
}