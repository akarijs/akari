/**
 * Console Vue app entry point — mirrors Koishi's app/index.ts pattern.
 *
 * 1. Creates Vue app + router
 * 2. Mounts in-shell services (dashboard page)
 * 3. Connects to the server WebSocket
 * 4. Watches store.entry and dynamically imports plugin entry modules
 */

import { createApp, watch, shallowReactive, ref, Ref } from 'vue'
import { createRouter, createWebHashHistory, RouterView } from 'vue-router'
import { ConsoleContext, RouterService } from '../client/index'
import { store, connect } from './data'
import App from './App.vue'
import Dashboard from './views/Dashboard.vue'

// ---------------------------------------------------------------------------
// Setup root Cordis context
// ---------------------------------------------------------------------------
const root = new ConsoleContext()

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      redirect: '/dashboard',
    },
    {
      // Named parent route — all plugin pages are added as children
      path: '/',
      name: 'console',
      component: RouterView,
      children: [],
    },
  ],
})

root.plugin(RouterService, router)

// Seed registry with the built-in dashboard entry
root.page({ path: '/dashboard', name: 'dashboard', label: '仪表板', component: Dashboard, icon: '📊', order: -100 })

// ---------------------------------------------------------------------------
// Vue app
// ---------------------------------------------------------------------------
const app = createApp(App)
app.use(router)

// Provide the router service globally so App.vue can read navigation items
app.provide('routerService', root.$router)

app.mount('#app')

// ---------------------------------------------------------------------------
// Server connection
// ---------------------------------------------------------------------------
declare const __AKARI_CONFIG__: { endpoint: string; devMode: boolean }
connect(__AKARI_CONFIG__.endpoint)

// ---------------------------------------------------------------------------
// Plugin entry loader — mirrors Koishi's LoaderService
// ---------------------------------------------------------------------------
/** Map of entry-id → { scope, cssLinks } already loaded */
const loaded: Record<string, { scope: import('cordis').EffectScope; cssLinks: HTMLLinkElement[] }> = {}

watch(
  () => store['entry'] as Record<string, { files: string[]; data?: any }> | undefined,
  async (entries) => {
    if (!entries) return

    // Dispose removed entries
    for (const id of Object.keys(loaded)) {
      if (!entries[id]) {
        loaded[id].scope.dispose()
        for (const link of loaded[id].cssLinks) link.remove()
        delete loaded[id]
      }
    }

    // Load new entries
    await Promise.all(
      Object.entries(entries).map(async ([id, { files, data }]) => {
        if (loaded[id]) return

        const scope = root.isolate('extension').plugin(() => {})
        const cssLinks: HTMLLinkElement[] = []
        loaded[id] = { scope, cssLinks }

        for (const url of files) {
          if (url.endsWith('.css')) {
            const link = document.createElement('link')
            link.rel = 'stylesheet'
            link.href = url
            document.head.appendChild(link)
            cssLinks.push(link)
          } else {
            try {
              // @vite-ignore — dynamic URL unknown at build time
              const mod = await import(/* @vite-ignore */ url)
              const install = mod.default ?? mod.install
              if (typeof install === 'function') {
                scope.ctx.plugin(install, data)
              }
            } catch (err) {
              console.error(`[akari:console] failed to load entry ${id} (${url}):`, err)
            }
          }
        }
      }),
    )
  },
  { deep: true, immediate: true },
)
