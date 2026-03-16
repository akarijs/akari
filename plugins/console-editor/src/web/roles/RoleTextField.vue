<template>
  <div class="role-field">
    <div v-if="readonly" class="role-preview" :class="previewClass">{{ preview }}</div>
    <label v-else class="role-input-wrap" :class="previewClass">
      <span v-if="badge" class="role-badge">{{ badge }}</span>
      <input class="role-input" :type="inputKind" :placeholder="placeholder" :value="modelValue ?? ''" @input="emitValue(($event.target as HTMLInputElement).value)" />
    </label>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { inputType, nodeRole, previewValue, type SerializedSchema, type SerializedSchemaNode } from '../schema'

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

const role = computed(() => nodeRole(props.schema, props.node) || '')
const inputKind = computed(() => inputType(props.schema, props.node))
const preview = computed(() => previewValue(props.schema, props.node, props.modelValue))
const badge = computed(() => {
  if (role.value === 'path') return 'PATH'
  if (role.value === 'theme') return 'THEME'
  if (role.value === 'link' || role.value === 'url') return 'URL'
  if (role.value === 'secret') return 'SECRET'
  return ''
})
const placeholder = computed(() => {
  if (role.value === 'path') return '输入路径'
  if (role.value === 'theme') return '输入主题标识'
  if (role.value === 'link' || role.value === 'url') return 'https://example.com'
  if (role.value === 'secret') return '输入密钥'
  return ''
})
const previewClass = computed(() => `is-${role.value || 'text'}`)

function emitValue(value: string) {
  emit('update:modelValue', value)
}
</script>

<style scoped>
.role-field {
  display: grid;
}

.role-input-wrap,
.role-preview {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  background: white;
  color: #0f172a;
}

.role-preview {
  background: #f8fafc;
  white-space: pre-wrap;
  word-break: break-word;
}

.role-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 56px;
  padding: 5px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: #9a3412;
  background: #fff7ed;
}

.role-input {
  min-width: 0;
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  font: inherit;
  color: inherit;
}

.is-secret {
  background: linear-gradient(135deg, #fff7ed, #fffbeb);
}

.is-path,
.is-theme {
  background: linear-gradient(135deg, #f8fafc, #fefce8);
}

.is-link,
.is-url {
  background: linear-gradient(135deg, #f0fdf4, #ecfeff);
}
</style>