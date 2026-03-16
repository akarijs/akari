<template>
  <div class="role-table">
    <template v-if="isArray">
      <div class="chip-list">
        <span v-if="!items.length" class="chip-empty">暂无项目</span>
        <span v-for="(item, index) in items" :key="`${String(item)}-${index}`" class="chip">
          <span class="chip-text">{{ itemPreview(item) }}</span>
          <button v-if="!readonly" type="button" class="chip-remove" @click="removeArrayItem(index)">×</button>
        </span>
      </div>
      <label v-if="!readonly" class="table-input-row">
        <input class="table-input" :type="inputKind" :value="draft" @input="draft = ($event.target as HTMLInputElement).value" @keydown.enter.prevent="appendArrayItem()" />
        <button type="button" class="table-btn" @click="appendArrayItem()">添加</button>
      </label>
    </template>

    <template v-else>
      <div v-if="!dictEntries.length" class="chip-empty">暂无字段</div>
      <div v-for="(entry, index) in dictEntries" :key="entry.key || index" class="dict-row">
        <input class="table-input" type="text" :readonly="readonly" :value="entry.key" placeholder="字段名" @input="updateEntry(index, 'key', ($event.target as HTMLInputElement).value)" />
        <input class="table-input" :type="inputKind" :readonly="readonly" :value="String(entry.value ?? '')" placeholder="字段值" @input="updateEntry(index, 'value', parsePrimitive(($event.target as HTMLInputElement).value))" />
        <button v-if="!readonly" type="button" class="table-btn table-btn-danger" @click="removeEntry(index)">删除</button>
      </div>
      <button v-if="!readonly" type="button" class="table-btn" @click="appendEntry()">添加字段</button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { arrayItemNode, dictValueNode, inputType, previewValue, type SerializedSchema, type SerializedSchemaNode } from '../schema'

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

const draft = ref('')
const isArray = computed(() => props.node?.type === 'array')
const itemNode = computed(() => arrayItemNode(props.schema, props.node))
const valueNode = computed(() => dictValueNode(props.schema, props.node))
const items = computed(() => Array.isArray(props.modelValue) ? props.modelValue : [])
const dictEntries = computed(() => {
  if (!props.modelValue || typeof props.modelValue !== 'object' || Array.isArray(props.modelValue)) return [] as Array<{ key: string, value: any }>
  return Object.entries(props.modelValue).map(([key, value]) => ({ key, value }))
})
const inputKind = computed(() => inputType(props.schema, isArray.value ? itemNode.value : valueNode.value))

function itemPreview(value: any) {
  return previewValue(props.schema, itemNode.value, value)
}

function parsePrimitive(value: string) {
  const node = isArray.value ? itemNode.value : valueNode.value
  if (!node) return value
  if (node.type === 'number') return value === '' ? undefined : Number(value)
  if (node.type === 'boolean') return value === 'true'
  return value
}

function appendArrayItem() {
  if (!draft.value.trim()) return
  emit('update:modelValue', [...items.value, parsePrimitive(draft.value)])
  draft.value = ''
}

function removeArrayItem(index: number) {
  emit('update:modelValue', items.value.filter((_, current) => current !== index))
}

function appendEntry() {
  const base = dictEntries.value.length + 1
  emit('update:modelValue', {
    ...(props.modelValue && typeof props.modelValue === 'object' && !Array.isArray(props.modelValue) ? props.modelValue : {}),
    [`field_${base}`]: '',
  })
}

function updateEntry(index: number, field: 'key' | 'value', value: any) {
  const next = [...dictEntries.value]
  const current = next[index]
  if (!current) return
  next[index] = field === 'key' ? { ...current, key: value } : { ...current, value }
  emit('update:modelValue', Object.fromEntries(next.filter(entry => entry.key).map(entry => [entry.key, entry.value])))
}

function removeEntry(index: number) {
  emit('update:modelValue', Object.fromEntries(dictEntries.value.filter((_, current) => current !== index).map(entry => [entry.key, entry.value])))
}
</script>

<style scoped>
.role-table {
  display: grid;
  gap: 12px;
}

.chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 999px;
  background: #fff7ed;
  color: #9a3412;
  border: 1px solid #fed7aa;
}

.chip-text {
  max-width: min(36vw, 260px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chip-remove,
.table-btn {
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
}

.table-btn {
  padding: 10px 14px;
  border-radius: 12px;
  background: #0f172a;
  color: white;
}

.table-btn-danger {
  background: #991b1b;
}

.table-input-row,
.dict-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
}

.dict-row {
  grid-template-columns: minmax(0, 180px) minmax(0, 1fr) auto;
}

.table-input,
.chip-empty {
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  background: white;
  color: #0f172a;
  font: inherit;
}

.chip-empty {
  color: #64748b;
  background: #f8fafc;
}

@media (max-width: 720px) {
  .dict-row,
  .table-input-row {
    grid-template-columns: 1fr;
  }
}
</style>