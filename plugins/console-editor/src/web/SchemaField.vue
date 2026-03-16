<template>
  <div v-if="node && !node.meta?.hidden" class="field">
    <div class="field-head">
      <label class="field-label">
        {{ title }}
        <span v-if="required" class="field-required">*</span>
      </label>
      <p v-if="description" class="field-description">{{ description }}</p>
    </div>

    <div v-if="isObject" class="field-group">
      <SchemaField
        v-for="[childKey, childNode] in objectEntries"
        :key="childKey"
        :schema="schema"
        :node="childNode"
        :title="fieldLabel(childKey, childNode)"
        :model-value="objectValue[childKey]"
        :readonly="readonly"
        @update:model-value="updateObjectField(childKey, $event)"
      />
    </div>

    <div v-else-if="isOptional" class="field-stack">
      <label class="toggle">
        <input type="checkbox" :checked="optionalEnabled" @change="toggleOptional(($event.target as HTMLInputElement).checked)" />
        <span>{{ optionalEnabled ? '已启用' : '未设置' }}</span>
      </label>
      <div v-if="optionalEnabled" class="field-group">
        <SchemaField
          :schema="schema"
          :node="optionalInner"
          :title="title"
          :model-value="modelValue"
          :readonly="readonly"
          @update:model-value="emitValue($event)"
        />
      </div>
    </div>

    <div v-else-if="variantOptions.length" class="field-stack">
      <div class="variant-switcher">
        <select class="input" :value="String(activeBranchIndex)" :disabled="readonly" @change="selectBranch(($event.target as HTMLSelectElement).value)">
          <option v-for="option in variantOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
        <div class="variant-summary">{{ activeBranchSummary }}</div>
      </div>
      <div class="field-group field-variant-card">
        <div class="variant-heading">{{ variantLabel }}</div>
        <SchemaField
          :schema="schema"
          :node="activeBranch"
          :title="variantLabel"
          :model-value="modelValue"
          :readonly="readonly"
          @update:model-value="emitValue($event)"
        />
      </div>
    </div>

    <pre v-else-if="readonly && isStructured" class="field-preview field-preview-block">{{ preview }}</pre>
    <div v-else-if="readonly" class="field-preview">{{ preview }}</div>

    <div v-else-if="isConst" class="field-preview">{{ preview }}</div>

    <SchemaRoleField
      v-else-if="roleRenderer"
      :schema="schema"
      :node="rawNode"
      :title="title"
      :model-value="modelValue"
      :readonly="readonly"
      @update:model-value="emitValue($event)"
    />

    <select v-else-if="options" class="input" :value="selectValue" @change="emitValue(parseSelectValue(($event.target as HTMLSelectElement).value))">
      <option v-for="option in options" :key="String(option)" :value="option">{{ option }}</option>
    </select>

    <label v-else-if="isBoolean" class="toggle">
      <input type="checkbox" :checked="!!modelValue" @change="emitValue(($event.target as HTMLInputElement).checked)" />
      <span>{{ modelValue ? '是' : '否' }}</span>
    </label>

    <div v-else-if="isArray" class="field-stack">
      <div v-if="!arrayItems.length" class="field-empty">暂无项目</div>
      <div
        v-for="(item, index) in arrayItems"
        :key="index"
        class="collection-item"
        :class="{ dragging: dragIndex === index }"
        :draggable="!readonly"
        @dragstart="startDrag(index)"
        @dragover.prevent
        @drop="dropItem(index)"
        @dragend="endDrag()"
      >
        <div class="collection-item-head">
          <button type="button" class="ghost-btn" @click="toggleArrayItem(index)">
            {{ isArrayItemCollapsed(index) ? '展开' : '折叠' }}
          </button>
          <div class="collection-item-meta">
            <div class="collection-item-title">{{ arrayItemTitle(index) }}</div>
            <div class="collection-item-summary">{{ arrayItemSummary(item) }}</div>
          </div>
          <div v-if="!readonly" class="collection-item-actions">
            <button type="button" class="ghost-btn" :disabled="index === 0" @click="moveArrayItem(index, -1)">上移</button>
            <button type="button" class="ghost-btn" :disabled="index === arrayItems.length - 1" @click="moveArrayItem(index, 1)">下移</button>
            <button type="button" class="ghost-btn danger" @click="removeArrayItem(index)">移除</button>
          </div>
        </div>
        <div v-if="!isArrayItemCollapsed(index)" class="collection-item-body">
          <SchemaField
            :schema="schema"
            :node="itemNode"
            :title="arrayItemTitle(index)"
            :model-value="item"
            :readonly="readonly"
            @update:model-value="updateArrayItem(index, $event)"
          />
        </div>
      </div>
      <button v-if="!readonly" type="button" class="btn btn-sm" @click="appendArrayItem()">添加项目</button>
    </div>

    <div v-else-if="isDictTable" class="field-stack">
      <div v-if="!dictEntries.length" class="field-empty">暂无字段</div>
      <div v-for="(entry, index) in dictEntries" :key="entry.key || index" class="dict-row">
        <input class="input dict-key" type="text" :value="entry.key" :readonly="readonly" placeholder="字段名" @input="updateDictEntry(index, 'key', ($event.target as HTMLInputElement).value)" />
        <SchemaField
          class="dict-value"
          :schema="schema"
          :node="dictNode"
          :title="entry.key || `值 ${index + 1}`"
          :model-value="entry.value"
          :readonly="readonly"
          @update:model-value="updateDictEntry(index, 'value', $event)"
        />
        <button v-if="!readonly" type="button" class="btn btn-sm btn-danger" @click="removeDictEntry(index)">删除</button>
      </div>
      <button v-if="!readonly" type="button" class="btn btn-sm" @click="appendDictEntry()">添加字段</button>
    </div>

    <textarea v-else-if="isJson" class="textarea" :value="jsonText" @input="updateJson(($event.target as HTMLTextAreaElement).value)"></textarea>
    <p v-if="jsonError" class="field-error">{{ jsonError }}</p>

    <label v-else-if="isNumber" class="input-wrap">
      <input class="input" type="number" :step="numberStep" :min="numberMin" :value="modelValue ?? 0" @input="updateNumber(($event.target as HTMLInputElement).value)" />
      <span v-if="numberSuffix" class="input-suffix">{{ numberSuffix }}</span>
    </label>

    <input v-else-if="isDate" class="input" type="datetime-local" :value="modelValue ?? ''" @input="emitValue(($event.target as HTMLInputElement).value)" />

    <input v-else class="input" :type="textInputType" :value="modelValue ?? ''" @input="emitValue(($event.target as HTMLInputElement).value)" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import SchemaRoleField from './SchemaRoleField.vue'
import { resolveRoleRenderer } from './schema-role-registry'
import {
  arrayItemNode,
  branchLabel,
  defaultValue,
  dictValueNode,
  enumOptions,
  fieldLabel,
  formValue,
  inputType,
  isDateNode,
  isOptionalNode,
  isReadonlyNode,
  matchBranchIndex,
  optionalNode,
  previewValue,
  summarizeValue,
  type SerializedSchema,
  type SerializedSchemaNode,
  unwrapNode,
  variantBranches,
  visibleObjectEntries,
} from './schema'

defineOptions({ name: 'SchemaField' })

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

const rawNode = computed(() => unwrapNode(props.schema, props.node))
const description = computed(() => rawNode.value?.meta?.description as string | undefined)
const required = computed(() => !!rawNode.value?.meta?.required)
const isObject = computed(() => rawNode.value?.type === 'object' || rawNode.value?.type === 'intersect')
const isBoolean = computed(() => rawNode.value?.type === 'boolean')
const isNumber = computed(() => rawNode.value?.type === 'number')
const isDate = computed(() => isDateNode(props.schema, rawNode.value))
const enumEntries = computed(() => enumOptions(props.schema, rawNode.value))
const options = computed(() => enumEntries.value?.map(item => item.label) || null)
const optionValues = computed(() => enumEntries.value?.map(item => item.value) || [])
const itemNode = computed(() => arrayItemNode(props.schema, rawNode.value))
const dictNode = computed(() => dictValueNode(props.schema, rawNode.value))
const isArray = computed(() => rawNode.value?.type === 'array')
const isDictTable = computed(() => rawNode.value?.type === 'dict' && !!dictNode.value && dictNode.value.type !== 'any' && dictNode.value.type !== 'function')
const isJson = computed(() => rawNode.value?.type === 'dict' || rawNode.value?.type === 'any' || rawNode.value?.type === 'function')
const isStructured = computed(() => isObject.value || isJson.value)
const isConst = computed(() => rawNode.value?.type === 'const' || isReadonlyNode(props.schema, props.node))
const objectEntries = computed(() => visibleObjectEntries(props.schema, rawNode.value))
const isOptional = computed(() => isOptionalNode(props.schema, rawNode.value))
const optionalInner = computed(() => optionalNode(props.schema, rawNode.value))
const branchNodes = computed(() => variantBranches(props.schema, rawNode.value))
const variantOptions = computed(() => branchNodes.value.map((branch, index) => ({ value: String(index), label: branchLabel(props.schema, branch, index) })))
const roleRenderer = computed(() => resolveRoleRenderer(props.schema, rawNode.value))
const objectValue = computed<Record<string, any>>(() => {
  return props.modelValue && typeof props.modelValue === 'object' && !Array.isArray(props.modelValue)
    ? props.modelValue
    : {}
})
const arrayItems = computed<any[]>(() => Array.isArray(props.modelValue) ? props.modelValue : [])
const dictEntries = computed(() => {
  if (!props.modelValue || typeof props.modelValue !== 'object' || Array.isArray(props.modelValue)) return [] as Array<{ key: string, value: any }>
  return Object.entries(props.modelValue).map(([key, value]) => ({ key, value }))
})
const jsonText = computed(() => props.modelValue == null ? '' : JSON.stringify(props.modelValue, null, 2))
const preview = computed(() => previewValue(props.schema, rawNode.value, props.modelValue))
const textInputType = computed(() => inputType(props.schema, rawNode.value))
const numberSuffix = computed(() => {
  const role = rawNode.value?.meta?.role
  if (role === 'ms' || role === 'time') return 'ms'
  return ''
})
const numberStep = computed(() => rawNode.value?.meta?.step ?? 1)
const numberMin = computed(() => rawNode.value?.meta?.min ?? (rawNode.value?.meta?.role === 'natural' ? 0 : undefined))
const selectValue = computed(() => {
  const index = optionValues.value.findIndex(option => Object.is(option, props.modelValue))
  return index >= 0 ? options.value?.[index] ?? '' : ''
})
const optionalEnabled = computed(() => props.modelValue !== undefined && props.modelValue !== null)
const activeBranchIndex = computed(() => matchBranchIndex(props.schema, branchNodes.value, props.modelValue))
const activeBranch = computed(() => branchNodes.value[activeBranchIndex.value] || null)
const variantLabel = computed(() => branchLabel(props.schema, activeBranch.value, activeBranchIndex.value))
const activeBranchSummary = computed(() => summarizeValue(props.schema, activeBranch.value, props.modelValue))
const jsonError = ref('')
const collapsedItems = ref<Record<number, boolean>>({})
const dragIndex = ref<number | null>(null)

watch(() => props.modelValue, () => {
  jsonError.value = ''
})

function emitValue(value: any) {
  emit('update:modelValue', value)
}

function updateObjectField(key: string, value: any) {
  emitValue({
    ...objectValue.value,
    [key]: value,
  })
}

function toggleOptional(enabled: boolean) {
  if (!optionalInner.value) return
  emitValue(enabled ? formValue(props.schema, optionalInner.value, props.modelValue) ?? defaultValue(props.schema, optionalInner.value) : undefined)
}

function selectBranch(index: string) {
  const branch = branchNodes.value[Number(index)]
  if (!branch) return
  emitValue(defaultValue(props.schema, branch))
}

function parseSelectValue(label: string) {
  const index = options.value?.indexOf(label) ?? -1
  return index >= 0 ? optionValues.value[index] : label
}

function arrayItemTitle(index: number) {
  return `项目 ${index + 1}`
}

function arrayItemSummary(item: any) {
  return summarizeValue(props.schema, itemNode.value, item)
}

function appendArrayItem() {
  emitValue([...arrayItems.value, defaultValue(props.schema, itemNode.value)])
}

function updateArrayItem(index: number, value: any) {
  const next = [...arrayItems.value]
  next[index] = value
  emitValue(next)
}

function removeArrayItem(index: number) {
  emitValue(arrayItems.value.filter((_, current) => current !== index))
}

function moveArrayItem(index: number, delta: number) {
  const target = index + delta
  if (target < 0 || target >= arrayItems.value.length) return
  const next = [...arrayItems.value]
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item)
  emitValue(next)
}

function isArrayItemCollapsed(index: number) {
  return !!collapsedItems.value[index]
}

function toggleArrayItem(index: number) {
  collapsedItems.value = { ...collapsedItems.value, [index]: !collapsedItems.value[index] }
}

function startDrag(index: number) {
  if (props.readonly) return
  dragIndex.value = index
}

function dropItem(index: number) {
  if (dragIndex.value == null || dragIndex.value === index) return
  const next = [...arrayItems.value]
  const [item] = next.splice(dragIndex.value, 1)
  next.splice(index, 0, item)
  dragIndex.value = null
  emitValue(next)
}

function endDrag() {
  dragIndex.value = null
}

function appendDictEntry() {
  const base = dictEntries.value.length + 1
  emitValue({
    ...(props.modelValue && typeof props.modelValue === 'object' && !Array.isArray(props.modelValue) ? props.modelValue : {}),
    [`field_${base}`]: defaultValue(props.schema, dictNode.value),
  })
}

function updateDictEntry(index: number, field: 'key' | 'value', value: any) {
  const next = [...dictEntries.value]
  const current = next[index]
  if (!current) return
  next[index] = field === 'key' ? { ...current, key: value } : { ...current, value }
  emitValue(Object.fromEntries(next.filter(entry => entry.key).map(entry => [entry.key, entry.value])))
}

function removeDictEntry(index: number) {
  emitValue(Object.fromEntries(dictEntries.value.filter((_, current) => current !== index).map(entry => [entry.key, entry.value])))
}

function updateNumber(source: string) {
  emitValue(source === '' ? undefined : Number(source))
}

function updateJson(source: string) {
  if (!source.trim()) {
    jsonError.value = ''
    emitValue(rawNode.value?.type === 'dict' ? {} : null)
    return
  }
  try {
    jsonError.value = ''
    emitValue(JSON.parse(source))
  } catch {
    jsonError.value = 'JSON 格式无效，暂未保存这次输入。'
  }
}
</script>

<style scoped>
.field {
  display: grid;
  gap: 8px;
}

.field-head {
  display: grid;
  gap: 4px;
}

.field-label {
  font-size: 13px;
  font-weight: 700;
  color: #1e293b;
}

.field-required {
  color: #dc2626;
}

.field-description {
  margin: 0;
  font-size: 12px;
  color: #64748b;
}

.field-stack {
  display: grid;
  gap: 12px;
}

.field-group {
  display: grid;
  gap: 14px;
  padding: 14px;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  background: #f8fafc;
}

.field-variant-card {
  background: linear-gradient(180deg, #fffaf5, #f8fafc);
}

.variant-switcher {
  display: grid;
  gap: 8px;
}

.variant-heading {
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #9a3412;
}

.variant-summary,
.collection-item-summary {
  color: #64748b;
  font-size: 12px;
  line-height: 1.5;
}

.input,
.textarea {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  padding: 10px 12px;
  font: inherit;
  background: white;
  color: #0f172a;
}

.textarea {
  min-height: 120px;
  resize: vertical;
}

.input-wrap {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
}

.input-suffix {
  font-size: 12px;
  font-weight: 700;
  color: #64748b;
}

.toggle {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  color: #334155;
}

.field-preview {
  min-height: 44px;
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #f8fafc;
  color: #334155;
  white-space: pre-wrap;
  word-break: break-word;
}

.field-preview-block {
  margin: 0;
  font-family: 'Cascadia Code', 'Fira Code', monospace;
  font-size: 12px;
}

.collection-item,
.dict-row {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  background: rgba(248, 250, 252, 0.9);
}

.collection-item.dragging {
  opacity: 0.55;
}

.collection-item-head {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 12px;
  align-items: start;
}

.collection-item-meta {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.collection-item-title {
  font-size: 13px;
  font-weight: 700;
  color: #0f172a;
}

.collection-item-actions {
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.collection-item-body {
  min-width: 0;
}

.ghost-btn,
.btn {
  border: 1px solid #cbd5e1;
  background: white;
  color: #0f172a;
  border-radius: 12px;
  padding: 10px 14px;
  font: inherit;
  cursor: pointer;
}

.ghost-btn {
  padding: 7px 10px;
  font-size: 12px;
}

.ghost-btn.danger,
.btn-danger {
  color: #b91c1c;
}

.btn-sm {
  padding: 8px 10px;
  font-size: 13px;
}

.dict-row {
  grid-template-columns: minmax(0, 180px) minmax(0, 1fr) auto;
  align-items: start;
}

.dict-key,
.dict-value {
  min-width: 0;
}

.field-empty {
  padding: 12px 14px;
  border: 1px dashed #cbd5e1;
  border-radius: 12px;
  color: #64748b;
  background: #f8fafc;
}

.field-error {
  margin: 0;
  font-size: 12px;
  color: #dc2626;
}

@media (max-width: 720px) {
  .dict-row,
  .collection-item-head {
    grid-template-columns: 1fr;
  }

  .collection-item-actions {
    justify-content: flex-start;
  }
}
</style>