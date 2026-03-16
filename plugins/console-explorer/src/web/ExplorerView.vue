<template>
  <div class="explorer-container">
    <div class="tree-panel">
        <div class="panel-header">
          <div class="panel-title">
            <h3>文件树</h3>
            <div class="subtitle">管理博客文件与草稿</div>
          </div>
          <div class="panel-actions">
            <button class="btn btn-ghost btn-sm" @click="refresh">刷新</button>
          </div>
        </div>
        <div class="file-tree">
          <div v-if="tree.length === 0" class="empty">点击刷新加载文件列表</div>

          <TreeItem
            v-for="node in tree"
            :key="node.path || node.name"
            :node="node"
            :level="0"
            :openFile="openFile"
            :toggleDir="toggleDir"
          />
        </div>
    </div>

    <div class="editor-panel">
      <div class="panel-header editor-header">
        <div>
          <h3>{{ currentFile.name || '文件编辑器' }}</h3>
          <div class="subtitle">编辑并保存你的文章草稿</div>
        </div>
      </div>
      <div v-if="currentFile.content !== null" class="editor">
        <textarea v-model="currentFile.content" class="textarea" placeholder="在这里编辑文件内容..."></textarea>
        <div class="editor-actions">
          <button class="btn btn-primary" @click="saveFile">保存</button>
        </div>
      </div>
      <div v-else class="empty">选择文件进行编辑</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, defineComponent, h, PropType } from 'vue'
import { send } from '@akari/console-client/data'

interface FileEntry {
  name: string
  path: string
  type: 'file' | 'directory'
}

type TreeNode = FileEntry & {
  children?: TreeNode[]
  expanded?: boolean
  loading?: boolean
  loaded?: boolean
}

const tree = ref<TreeNode[]>([])
const currentFile = ref<{ name: string; content: string | null; path: string }>({
  name: '',
  content: null,
  path: '',
})

function toNode(file: FileEntry): TreeNode {
  return { ...file, children: [], expanded: false, loading: false, loaded: false }
}

async function refresh() {
  try {
    const files = await send('explorer/list')
    tree.value = (Array.isArray(files) ? files : []).map(toNode)
  } catch (error) {
    console.error('Failed to load file tree:', error)
    tree.value = []
  }
}

async function toggleDir(node: TreeNode) {
  if (node.expanded) {
    node.expanded = false
    return
  }
  if (node.loaded) {
    node.expanded = true
    return
  }
  node.loading = true
  try {
    const children = await send('explorer/list', node.path)
    node.children = (Array.isArray(children) ? children : []).map(toNode)
    node.loaded = true
    node.expanded = true
  } catch (err) {
    console.error('Failed to load directory:', err)
  } finally {
    node.loading = false
  }
}

async function openFile(file: TreeNode) {
  if (file.type !== 'file') return
  try {
    const result = await send('explorer/read', file.path)
    currentFile.value = {
      name: file.name,
      path: file.path,
      content: result?.content ?? '',
    }
  } catch (error) {
    console.error('Failed to read file:', error)
  }
}

async function saveFile() {
  if (!currentFile.value.path) return
  try {
    await send('explorer/write', currentFile.value.path, currentFile.value.content ?? '')
    await refresh()
  } catch (error) {
    console.error('Failed to save file:', error)
  }
}

const TreeItem = defineComponent({
  name: 'TreeItem',
  props: {
    node: { type: Object as PropType<TreeNode>, required: true },
    level: { type: Number as PropType<number>, required: true },
    openFile: { type: Function as PropType<(n: TreeNode) => void>, required: true },
    toggleDir: { type: Function as PropType<(n: TreeNode) => void>, required: true },
  },
  setup(props) {
    return () =>
      h('div', { class: 'tree-row' }, [
        h(
          'div',
          { class: 'tree-item', style: { paddingLeft: `${props.level * 14}px` } },
          [
            props.node.type === 'directory'
              ? h(
                  'span',
                  {
                    class: 'caret',
                    onClick: (e: Event) => {
                      e.stopPropagation()
                      props.toggleDir(props.node)
                    },
                  },
                  props.node.loading ? '…' : props.node.expanded ? '▾' : '▸'
                )
              : null,
            h(
              'span',
              {
                class: 'filename',
                onClick: (e: Event) => {
                  e.stopPropagation()
                  props.node.type === 'file' ? props.openFile(props.node) : props.toggleDir(props.node)
                },
              },
              props.node.name
            ),
          ]
        ),
        props.node.expanded && props.node.children && props.node.children.length
          ? h(
              'div',
              { class: 'tree-children' },
              props.node.children.map((c) => h(TreeItem, { node: c, level: props.level + 1, openFile: props.openFile, toggleDir: props.toggleDir }))
            )
          : null,
      ])
  },
})

onMounted(refresh)
</script>

<style scoped>
.explorer-container {
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: 14px;
  height: 80vh;
}

.tree-panel,
.editor-panel {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border-bottom: 1px solid var(--line);
}

.panel-header h3 {
  margin: 0;
  font-size: 14px;
}

.panel-title h3 {
  font-family: 'Playfair Display', Georgia, 'Times New Roman', serif;
  font-weight: 600;
  font-size: 15px;
  margin-bottom: 2px;
}

.subtitle {
  font-size: 11px;
  color: var(--muted);
  margin-top: 2px;
}

.panel-actions {
  display: flex;
  gap: 8px;
}

.file-tree {
  flex: 1;
  overflow: auto;
  font-size: 13px;
}

.tree-item {
  padding: 6px 12px;
  cursor: pointer;
  border-bottom: 1px solid #f0f0f0;
}

.tree-item:hover {
  background: #f9f9f9;
}

.filename {
  user-select: none;
}

.caret {
  display: inline-block;
  width: 16px;
  text-align: center;
  margin-right: 6px;
  color: var(--muted);
}

.tree-children {
  /* children use their own padding via tree-item */
}

.tree-row .tree-item {
  border-bottom: none;
}

/* Visual polish: refined card, accents, and transitions */
.tree-panel {
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.04);
  border-left: 4px solid color-mix(in srgb, var(--brand) 14%, transparent);
}

.editor-panel {
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06);
}

.btn-ghost {
  background: transparent;
  border: 1px solid transparent;
  color: var(--muted);
}

.btn-primary {
  background: color-mix(in srgb, #0f766e 72%, white);
  color: #fff;
  border-color: transparent;
  padding: 8px 14px;
  border-radius: 10px;
  transition: transform 120ms ease, box-shadow 120ms ease;
}

.btn-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(15,118,110,0.12); }

.tree-item { transition: background 120ms ease, color 120ms ease; }
.tree-item:hover { background: color-mix(in srgb, var(--brand) 6%, #fff); }

.tree-children { transition: opacity 180ms ease, transform 180ms ease; }
.tree-children[style] { will-change: opacity, transform; }

.editor .textarea {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, 'Roboto Mono', monospace;
  font-size: 13px;
  line-height: 1.6;
}

.editor-header .subtitle { color: #6b7280; }

.editor {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 12px;
}

.textarea {
  flex: 1;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 12px;
  font-family: monospace;
  font-size: 13px;
  resize: none;
  margin-bottom: 12px;
}

.editor-actions {
  display: flex;
  gap: 8px;
}

.btn {
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 8px;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 12px;
}

.btn-primary {
  background: var(--brand);
  color: #fff;
  border-color: var(--brand);
}

.btn-sm {
  padding: 4px 8px;
  font-size: 11px;
}

.empty {
  padding: 20px;
  text-align: center;
  color: var(--muted);
  font-size: 12px;
}
</style>
