<template>
  <div class="role-number">
    <div v-if="readonly" class="role-number-preview">{{ preview }}</div>
    <label v-else class="role-number-input">
      <input class="input" type="number" :step="step" :min="min" :value="modelValue ?? 0" @input="emitValue(($event.target as HTMLInputElement).value)" />
      <span class="role-number-unit">{{ unit }}</span>
      <span v-if="hint" class="role-number-hint">{{ hint }}</span>
    </label>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { nodeRole, type SerializedSchema, type SerializedSchemaNode } from '../schema'

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

const role = computed(() => nodeRole(props.schema, props.node) || 'ms')
const unit = computed(() => role.value === 'time' ? 'ms' : 'ms')
const step = computed(() => props.node?.meta?.step ?? 1)
const min = computed(() => props.node?.meta?.min ?? 0)
const preview = computed(() => humanizeDuration(Number(props.modelValue ?? 0)))
const hint = computed(() => {
  const value = Number(props.modelValue ?? 0)
  return Number.isFinite(value) && value >= 1000 ? humanizeDuration(value) : ''
})

function emitValue(value: string) {
  emit('update:modelValue', value === '' ? undefined : Number(value))
}

function humanizeDuration(value: number) {
  if (!Number.isFinite(value)) return '—'
  if (value < 1000) return `${value} ms`
  const seconds = Math.floor(value / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}
</script>

<style scoped>
.role-number {
  display: grid;
}

.role-number-input,
.role-number-preview {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  background: white;
}

.role-number-preview {
  background: linear-gradient(135deg, #eff6ff, #f8fafc);
  color: #0f172a;
}

.input {
  min-width: 0;
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  font: inherit;
  color: inherit;
}

.role-number-unit {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: #2563eb;
}

.role-number-hint {
  grid-column: 1 / -1;
  font-size: 12px;
  color: #64748b;
}
</style>