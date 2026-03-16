<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { send, store, connected } from '../data'

const stats = ref({ clients: 0, entries: 0 })

async function refresh() {
  try {
    const result = await send('console/get-stats')
    stats.value = result ?? stats.value
  } catch {
    // not yet connected
  }
}

onMounted(refresh)
</script>

<template>
  <section>
    <div class="grid">
      <article class="card">
        <div class="label">连接客户端</div>
        <div class="value">{{ stats.clients }}</div>
      </article>
      <article class="card">
        <div class="label">已加载插件入口</div>
        <div class="value">{{ stats.entries }}</div>
      </article>
      <article class="card">
        <div class="label">WebSocket 状态</div>
        <div class="value" :style="{ color: connected ? 'var(--good)' : 'var(--danger)' }">
          {{ connected ? '已连接' : '断开' }}
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 14px;
}

.card {
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 16px;
  background: #fff;
}

.label {
  color: var(--muted);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 8px;
}

.value {
  font-size: 32px;
  font-weight: 700;
  color: var(--brand);
}
</style>
