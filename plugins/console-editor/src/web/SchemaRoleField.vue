<template>
  <component
    :is="renderer.component"
    :schema="schema"
    :node="node"
    :title="title"
    :model-value="modelValue"
    :readonly="readonly"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { resolveRoleRenderer } from './schema-role-registry'
import type { SerializedSchema, SerializedSchemaNode } from './schema'

const props = defineProps<{
  schema: SerializedSchema | null
  node: SerializedSchemaNode | null
  title: string
  modelValue: any
  readonly?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: any]
}>()

const renderer = computed(() => {
  const resolved = resolveRoleRenderer(props.schema, props.node)
  if (!resolved) throw new Error('SchemaRoleField requires a matching role renderer.')
  return resolved
})
</script>