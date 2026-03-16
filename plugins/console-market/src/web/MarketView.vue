<template>
  <div class="market-container">
    <div class="search-bar">
      <input v-model="searchQuery" type="text" placeholder="搜索插件..." class="search-input" />
      <button class="btn btn-primary" @click="refresh">刷新</button>
    </div>

    <div class="plugins-list">
      <div v-if="packages.length === 0" class="empty">暂无插件</div>
      <div v-for="pkg in packages" :key="pkg.name" class="package-card">
        <div class="card-header">
          <h4>{{ pkg.name }}</h4>
          <span class="version">v{{ pkg.version }}</span>
        </div>
        <p class="description">{{ pkg.description }}</p>
        <div class="card-actions">
          <button class="btn btn-sm" @click="install(pkg.name)">安装</button>
          <button class="btn btn-sm" @click="viewDetails(pkg)">详情</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from  'vue'
import { send } from '@akari/console-client/data'

interface Package {
  name: string
  version: string
  description: string
}

const searchQuery = ref('')
const allPackages = ref<Package[]>([])

const packages = computed(() => {
  if (!searchQuery.value) return allPackages.value
  const query = searchQuery.value.toLowerCase()
  return allPackages.value.filter(
    (p) => p.name.includes(query) || p.description.includes(query),
  )
})

async function refresh() {
  try {
    const result = await send('market/refresh')
    allPackages.value = result?.packages ?? await send('market/search', [''])
  } catch (err) {
    console.error('Failed to refresh market:', err)
  }
}

async function install(name: string) {
  try {
    await send('market/install', [name])
    alert('插件安装成功！')
    await refresh()
  } catch (err) {
    alert(`安装失败: ${err}`)
  }
}

function viewDetails(pkg: Package) {
  alert(`${pkg.name}@${pkg.version}\n\n${pkg.description}`)
}

onMounted(refresh)
</script>

<style scoped>
.market-container {
  padding: 0;
}

.search-bar {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.search-input {
  flex: 1;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 14px;
}

.search-input:focus {
  outline: none;
  border-color: var(--brand);
}

.plugins-list {
  display: grid;
  gap: 12px;
}

.package-card {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 14px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.card-header h4 {
  margin: 0;
  font-size: 16px;
}

.version {
  color: var(--muted);
  font-size: 12px;
}

.description {
  margin: 0 0 10px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.4;
}

.card-actions {
  display: flex;
  gap: 6px;
}

.btn {
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 6px;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 12px;
}

.btn:hover {
  background: #f9f9f9;
}

.btn-primary {
  background: var(--brand);
  color: #fff;
  border-color: var(--brand);
}

.btn-primary:hover {
  background: #d96030;
}

.btn-sm {
  padding: 4px 8px;
}

.empty {
  text-align: center;
  padding: 40px 20px;
  color: var(--muted);
  font-size: 14px;
}
</style>
