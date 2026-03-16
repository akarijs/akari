<template>
  <div class="editor-shell">
    <aside class="sidebar">
      <div class="sidebar-title">Datasource</div>
      <button
        v-for="domain in domains"
        :key="domain.name"
        class="domain-tab"
        :class="{ active: activeName === domain.name }"
        @click="activate(domain.name)"
      >
        <span class="domain-label">{{ domain.display.label || domain.name }}</span>
        <span class="domain-kind">{{ domain.kind === 'collection' ? 'collection' : 'singleton' }}</span>
      </button>
    </aside>

    <section class="content-panel">
      <header v-if="activeDomain" class="panel-header">
        <div>
          <h2>{{ activeDomain.display.label || activeDomain.name }}</h2>
          <p>{{ activeDomain.display.description || '按 datasource 注册定义自动生成。' }}</p>
        </div>
        <div class="header-actions">
          <button
            v-if="activeDomain.kind === 'collection' && activeDomain.operations.create"
            class="btn btn-primary"
            @click="openCreate()"
          >
            新建{{ activeDomain.display.singular || activeDomain.display.label || activeDomain.name }}
          </button>
          <button
            v-if="activeDomain.kind === 'singleton'"
            class="btn"
            @click="openSingleton(activeDomain.writable ? 'edit' : 'view')"
          >
            {{ activeDomain.writable ? '编辑' : '预览' }}
          </button>
        </div>
      </header>

      <div v-if="loading" class="state-card">正在加载数据域…</div>
      <div v-else-if="errorMessage" class="state-card state-error">{{ errorMessage }}</div>
      <div v-else-if="!activeDomain" class="state-card">当前没有可展示的数据域。</div>

      <div v-else-if="activeDomain.kind === 'collection'" class="table-card">
        <table class="table">
          <thead>
            <tr>
              <th v-for="column in columns" :key="column">{{ column }}</th>
              <th class="table-actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!activeRecords.length">
              <td :colspan="columns.length + 1" class="empty-cell">暂无数据</td>
            </tr>
            <tr v-for="(record, index) in activeRecords" :key="rowKey(record, index)">
              <td v-for="column in columns" :key="column">{{ cellValue(record, column) }}</td>
              <td class="actions-cell">
                <button class="btn btn-sm" @click="openRecord('view', record)">预览</button>
                <button v-if="activeDomain.operations.update" class="btn btn-sm" @click="openRecord('edit', record)">编辑</button>
                <button v-if="activeDomain.operations.delete" class="btn btn-sm btn-danger" @click="removeRecord(record)">删除</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else class="singleton-card">
        <div v-if="activeSingleton && summaryLines.length" class="summary-grid">
          <div v-for="[key, value] in summaryLines" :key="key" class="summary-item">
            <div class="summary-key">{{ key }}</div>
            <div class="summary-value">{{ value }}</div>
          </div>
        </div>
        <pre v-else class="singleton-preview">{{ singletonJson }}</pre>
      </div>
    </section>

    <div v-if="showModal && activeDomain && modalRootNode" class="modal-overlay" @click="closeModal()">
      <form class="modal" @click.stop @submit.prevent="submitModal()">
        <div class="modal-header">
          <div>
            <h3>{{ modalTitle }}</h3>
            <p>{{ activeDomain.display.description || activeDomain.name }}</p>
          </div>
          <button type="button" class="btn btn-sm" @click="closeModal()">关闭</button>
        </div>

        <div class="modal-body">
          <SchemaField
            :schema="activeDomain.schema"
            :node="modalRootNode"
            :title="activeDomain.display.label || activeDomain.name"
            :model-value="formState"
            :readonly="modalMode === 'view'"
            @update:model-value="formState = $event"
          />
          <p v-if="modalError" class="modal-error">{{ modalError }}</p>
        </div>

        <div class="modal-actions">
          <button v-if="modalMode !== 'view'" type="submit" class="btn btn-primary" :disabled="submitting">
            {{ submitting ? '保存中…' : '保存' }}
          </button>
          <button type="button" class="btn" @click="closeModal()">取消</button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { send } from '@akari/console-client/data'
import SchemaField from './SchemaField.vue'
import { formValue, previewValue, rootNode, visibleObjectEntries, type SerializedSchemaNode } from './schema'
import type { ConsoleDomain } from '../index'

type ModalMode = 'create' | 'edit' | 'view'

const domains = ref<ConsoleDomain[]>([])
const activeName = ref('')
const loading = ref(false)
const errorMessage = ref('')
const recordMap = ref<Record<string, any[]>>({})
const singletonMap = ref<Record<string, any>>({})
const showModal = ref(false)
const modalMode = ref<ModalMode>('view')
const editingKey = ref<PropertyKey | null>(null)
const formState = ref<any>({})
const modalError = ref('')
const submitting = ref(false)

const activeDomain = computed(() => domains.value.find(domain => domain.name === activeName.value) || null)
const activeRecords = computed(() => activeDomain.value?.kind === 'collection' ? (recordMap.value[activeDomain.value.name] || []) : [])
const activeSingleton = computed(() => activeDomain.value?.kind === 'singleton' ? singletonMap.value[activeDomain.value.name] : null)
const modalRootNode = computed<SerializedSchemaNode | null>(() => rootNode(activeDomain.value?.schema))
const activeFieldNodes = computed<Record<string, SerializedSchemaNode>>(() => {
  if (!activeDomain.value?.schema || !modalRootNode.value) return {}
  return Object.fromEntries(visibleObjectEntries(activeDomain.value.schema, modalRootNode.value))
})
const columns = computed(() => {
  if (!activeDomain.value) return [] as string[]
  return activeDomain.value.display.summaryKeys?.length
    ? activeDomain.value.display.summaryKeys
    : Object.keys(activeRecords.value[0] || {}).slice(0, 4)
})
const modalTitle = computed(() => {
  const label = activeDomain.value?.display.singular || activeDomain.value?.display.label || activeDomain.value?.name || '数据'
  if (modalMode.value === 'create') return `新建${label}`
  if (modalMode.value === 'edit') return `编辑${label}`
  return `预览${label}`
})
const summaryLines = computed(() => {
  if (!activeDomain.value || activeDomain.value.kind !== 'singleton' || !activeSingleton.value) return [] as Array<[string, string]>
  const keys = activeDomain.value.display.summaryKeys?.length
    ? activeDomain.value.display.summaryKeys
    : Object.keys(activeSingleton.value).slice(0, 6)
  return keys.map(key => [key, cellValue(activeSingleton.value, key)] as [string, string])
})
const singletonJson = computed(() => JSON.stringify(activeSingleton.value ?? {}, null, 2))

watch(activeName, async (name) => {
  if (!name) return
  await loadDomain(name)
})

onMounted(async () => {
  await loadDefinitions()
})

async function loadDefinitions() {
  loading.value = true
  errorMessage.value = ''
  try {
    domains.value = await send('datasource/definitions')
    if (!activeName.value && domains.value.length) {
      activeName.value = domains.value[0].name
    } else if (activeName.value) {
      await loadDomain(activeName.value)
    }
  } catch (error: any) {
    errorMessage.value = error?.message || '加载数据域失败。'
  } finally {
    loading.value = false
  }
}

async function loadDomain(name: string) {
  const domain = domains.value.find(item => item.name === name)
  if (!domain) return
  loading.value = true
  errorMessage.value = ''
  try {
    const data = await send('datasource/read', name)
    if (domain.kind === 'collection') {
      recordMap.value = { ...recordMap.value, [name]: Array.isArray(data) ? data : [] }
    } else {
      singletonMap.value = { ...singletonMap.value, [name]: data }
    }
  } catch (error: any) {
    errorMessage.value = error?.message || `加载 ${name} 失败。`
  } finally {
    loading.value = false
  }
}

function activate(name: string) {
  activeName.value = name
}

function rowKey(record: any, index: number) {
  const key = activeDomain.value?.display.primaryKey || 'id'
  return record?.[key] ?? index
}

function cellValue(record: any, key: string) {
  return previewValue(activeDomain.value?.schema || null, activeFieldNodes.value[key] || null, record?.[key])
}

function openCreate() {
  if (!activeDomain.value || !modalRootNode.value) return
  modalMode.value = 'create'
  editingKey.value = null
  formState.value = formValue(activeDomain.value.schema, modalRootNode.value)
  modalError.value = ''
  showModal.value = true
}

function openRecord(mode: ModalMode, record: any) {
  if (!activeDomain.value || !modalRootNode.value) return
  modalMode.value = mode
  editingKey.value = record?.[activeDomain.value.display.primaryKey || 'id'] ?? null
  formState.value = formValue(activeDomain.value.schema, modalRootNode.value, record)
  modalError.value = ''
  showModal.value = true
}

function openSingleton(mode: ModalMode) {
  if (!activeDomain.value || !modalRootNode.value) return
  modalMode.value = mode
  editingKey.value = null
  formState.value = formValue(activeDomain.value.schema, modalRootNode.value, activeSingleton.value || {})
  modalError.value = ''
  showModal.value = true
}

async function removeRecord(record: any) {
  if (!activeDomain.value) return
  const key = record?.[activeDomain.value.display.primaryKey || 'id']
  if (key == null || !confirm('确认删除这条记录？')) return
  await send('datasource/delete', activeDomain.value.name, key)
  await loadDomain(activeDomain.value.name)
}

async function submitModal() {
  if (!activeDomain.value) return
  submitting.value = true
  modalError.value = ''
  try {
    if (activeDomain.value.kind === 'collection') {
      if (modalMode.value === 'create') {
        await send('datasource/create', activeDomain.value.name, formState.value)
      } else if (modalMode.value === 'edit' && editingKey.value != null) {
        await send('datasource/update', activeDomain.value.name, editingKey.value, formState.value)
      }
    } else if (modalMode.value !== 'view') {
      await send('datasource/set', activeDomain.value.name, formState.value)
    }
    closeModal()
    await loadDomain(activeDomain.value.name)
  } catch (error: any) {
    modalError.value = error?.message || '保存失败，请检查输入后重试。'
  } finally {
    submitting.value = false
  }
}

function closeModal() {
  showModal.value = false
  modalError.value = ''
}
</script>

<style scoped>
.editor-shell {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  gap: 24px;
  min-height: 100%;
}

.sidebar {
  display: grid;
  align-content: start;
  gap: 10px;
  padding: 20px;
  border: 1px solid #e2e8f0;
  border-radius: 20px;
  background: linear-gradient(180deg, #fffaf5 0%, #ffffff 100%);
}

.sidebar-title {
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #9a3412;
}

.domain-tab {
  display: grid;
  gap: 4px;
  padding: 14px 16px;
  border: 1px solid #fed7aa;
  border-radius: 16px;
  background: rgba(255, 247, 237, 0.9);
  color: #7c2d12;
  text-align: left;
  cursor: pointer;
}

.domain-tab.active {
  border-color: #ea580c;
  background: linear-gradient(135deg, #ea580c, #c2410c);
  color: white;
}

.domain-label {
  font-size: 15px;
  font-weight: 700;
}

.domain-kind {
  font-size: 12px;
  opacity: 0.8;
  text-transform: uppercase;
}

.content-panel {
  display: grid;
  align-content: start;
  gap: 18px;
}

.panel-header,
.table-card,
.singleton-card,
.state-card {
  border: 1px solid #e2e8f0;
  border-radius: 20px;
  background: white;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.05);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 16px;
  padding: 24px;
}

.panel-header h2 {
  margin: 0 0 6px;
  font-size: 28px;
  color: #0f172a;
}

.panel-header p {
  margin: 0;
  color: #64748b;
}

.header-actions {
  display: flex;
  gap: 10px;
}

.table-card,
.singleton-card,
.state-card {
  padding: 22px;
}

.state-error {
  color: #b91c1c;
}

.table {
  width: 100%;
  border-collapse: collapse;
}

.table th,
.table td {
  padding: 14px 12px;
  border-bottom: 1px solid #f1f5f9;
  text-align: left;
  vertical-align: top;
}

.table th {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #64748b;
}

.table-actions,
.actions-cell {
  width: 180px;
}

.actions-cell {
  display: flex;
  gap: 8px;
}

.empty-cell {
  text-align: center;
  color: #64748b;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
}

.summary-item {
  padding: 16px;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  background: #f8fafc;
}

.summary-key {
  margin-bottom: 6px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #64748b;
}

.summary-value,
.singleton-preview {
  color: #0f172a;
  white-space: pre-wrap;
  word-break: break-word;
}

.singleton-preview {
  margin: 0;
  font-family: 'Cascadia Code', 'Fira Code', monospace;
  font-size: 12px;
}

.btn {
  border: 1px solid #cbd5e1;
  background: white;
  color: #0f172a;
  border-radius: 12px;
  padding: 10px 14px;
  font: inherit;
  cursor: pointer;
}

.btn-sm {
  padding: 8px 10px;
  font-size: 13px;
}

.btn-primary {
  border-color: #ea580c;
  background: linear-gradient(135deg, #ea580c, #c2410c);
  color: white;
}

.btn-danger {
  color: #b91c1c;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.45);
  z-index: 1000;
}

.modal {
  width: min(860px, 100%);
  max-height: min(88vh, 920px);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  border: 1px solid #e2e8f0;
  border-radius: 24px;
  background: white;
  overflow: hidden;
}

.modal-header,
.modal-actions {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 24px;
  border-bottom: 1px solid #f1f5f9;
}

.modal-header p {
  margin: 6px 0 0;
  color: #64748b;
}

.modal-body {
  overflow: auto;
  padding: 24px;
}

.modal-error {
  margin: 16px 0 0;
  font-size: 13px;
  color: #b91c1c;
}

.modal-actions {
  justify-content: flex-end;
  border-top: 1px solid #f1f5f9;
  border-bottom: none;
}

@media (max-width: 900px) {
  .editor-shell {
    grid-template-columns: 1fr;
  }

  .sidebar {
    grid-auto-flow: column;
    grid-auto-columns: minmax(200px, 1fr);
    overflow: auto;
  }

  .panel-header {
    flex-direction: column;
  }

  .actions-cell {
    flex-wrap: wrap;
  }
}
</style>