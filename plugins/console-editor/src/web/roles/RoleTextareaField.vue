<template>
  <div class="role-textarea">
    <pre v-if="readonly" class="role-textarea-preview">{{ preview }}</pre>
    <textarea v-else class="role-textarea-input" :rows="rows" :value="modelValue ?? ''" @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"></textarea>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { previewValue, type SerializedSchema, type SerializedSchemaNode } from '../schema'

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

const rows = computed(() => Number(props.node?.meta?.extra?.rows || props.node?.meta?.rows || 10))
const preview = computed(() => previewValue(props.schema, props.node, props.modelValue))
</script>

<style scoped>
.role-textarea {
  display: grid;
}

.role-textarea-input,
.role-textarea-preview {
  width: 100%;
  min-height: 160px;
  border: 1px solid #cbd5e1;
  border-radius: 14px;
  padding: 12px 14px;
  font: inherit;
  line-height: 1.6;
  color: #0f172a;
  background: linear-gradient(180deg, #ffffff, #fffaf5);
}

.role-textarea-input {
  resize: vertical;
}

.role-textarea-preview {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>