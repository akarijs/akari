<script setup lang="ts">
import { inject, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { connected } from './data'
import type { RouterService, NavItem } from '../client/index'

const routerService = inject<RouterService>('routerService')!
const route = useRoute()
const router = useRouter()

const navItems = computed<NavItem[]>(() => routerService.pages as NavItem[])

function navigate(path: string) {
  router.push(path)
}
</script>

<template>
  <div class="layout">
    <!-- Sidebar -->
    <aside class="side">
      <h1 class="brand">Akari Console</h1>
      <div class="sub">插件化管理面板基座</div>
      <nav class="nav">
        <button
          v-for="item in navItems"
          :key="item.name"
          class="nav-btn"
          :class="{ active: route.path.startsWith(item.path) }"
          @click="navigate(item.path)"
        >
          <span v-if="item.icon" class="icon">{{ item.icon }}</span>
          {{ item.label }}
        </button>
      </nav>
    </aside>

    <!-- Main content -->
    <main class="main">
      <header class="topbar">
        <h2 class="route-title">{{ (route.meta?.label as string) || '' }}</h2>
        <div class="status">
          <span class="dot" :class="{ ok: connected }" />
          <span>{{ connected ? '已连接' : '连接中...' }}</span>
        </div>
      </header>

      <router-view />
    </main>
  </div>
</template>

<style>
:root {
  --bg: #f6f1e8;
  --paper: #fffdf8;
  --ink: #1c2326;
  --muted: #5f676c;
  --line: #e4d9c9;
  --brand: #e96f38;
  --brand-soft: rgba(233, 111, 56, 0.12);
  --good: #2b7c4f;
  --danger: #c41e3a;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: 'Avenir Next', 'Noto Sans', 'Segoe UI', sans-serif;
  color: var(--ink);
  background:
    radial-gradient(circle at 0 0, rgba(233, 111, 56, 0.1), transparent 30%),
    radial-gradient(circle at 100% 0, rgba(43, 124, 79, 0.08), transparent 35%),
    var(--bg);
  min-height: 100vh;
}
</style>

<style scoped>
.layout {
  max-width: 1320px;
  margin: 0 auto;
  padding: 18px;
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 14px;
}

.side,
.main {
  border: 1px solid var(--line);
  background: var(--paper);
  border-radius: 12px;
}

.side {
  padding: 14px;
  position: sticky;
  top: 14px;
  height: fit-content;
}

.brand {
  margin: 0 0 4px;
  font-size: 20px;
  letter-spacing: 0.3px;
}

.sub {
  color: var(--muted);
  font-size: 12px;
  margin-bottom: 14px;
}

.nav {
  display: grid;
  gap: 6px;
}

.nav-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid transparent;
  background: transparent;
  border-radius: 8px;
  text-align: left;
  padding: 10px 12px;
  font-weight: 600;
  font-size: 14px;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s ease;
  width: 100%;
}

.nav-btn:hover {
  background: #fff;
  color: var(--ink);
  border-color: var(--line);
}

.nav-btn.active {
  color: var(--brand);
  background: var(--brand-soft);
  border-color: rgba(233, 111, 56, 0.35);
}

.icon {
  font-size: 16px;
}

.main {
  padding: 20px;
  min-height: 80vh;
}

.topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--line);
}

.route-title {
  margin: 0;
  font-size: 24px;
}

.status {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 4px 12px;
  font-size: 12px;
  color: var(--muted);
  background: #fff;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #b8b8b8;
  flex-shrink: 0;
}

.dot.ok {
  background: var(--good);
}

@media (max-width: 900px) {
  .layout {
    grid-template-columns: 1fr;
  }

  .side {
    position: static;
  }
}
</style>
