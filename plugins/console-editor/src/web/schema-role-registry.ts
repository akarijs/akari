import type { Component } from 'vue'
import RoleNumberField from './roles/RoleNumberField.vue'
import RoleTableField from './roles/RoleTableField.vue'
import RoleTextField from './roles/RoleTextField.vue'
import RoleTextareaField from './roles/RoleTextareaField.vue'
import { matchRoleRenderer, type SchemaRoleRendererName } from './schema-role-matchers'
import { type SerializedSchema, type SerializedSchemaNode } from './schema'

export interface SchemaRoleRenderer {
  name: string
  component: Component
  match: (schema: SerializedSchema | null, node: SerializedSchemaNode | null) => boolean
}

const roleRegistry: SchemaRoleRenderer[] = []
const componentMap: Record<SchemaRoleRendererName, Component> = {
  textarea: RoleTextareaField,
  table: RoleTableField,
  duration: RoleNumberField,
  textual: RoleTextField,
}

export function registerRoleRenderer(renderer: SchemaRoleRenderer) {
  roleRegistry.unshift(renderer)
}

export function listRoleRenderers() {
  return [...roleRegistry]
}

export function resolveRoleRenderer(schema: SerializedSchema | null, node: SerializedSchemaNode | null) {
  return roleRegistry.find(renderer => renderer.match(schema, node)) || null
}

for (const name of Object.keys(componentMap) as SchemaRoleRendererName[]) {
  registerRoleRenderer({
    name,
    component: componentMap[name],
    match(schema, node) {
      return matchRoleRenderer(schema, node) === name
    },
  })
}