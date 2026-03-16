/**
 * @akari/console-editor — frontend entry point (Vue 3)
 *
 * Registers the Content Management page and all associated handlers.
 */

import type { Context } from '@akari/console-client'
import ContentView from './ContentView.vue'

export default async function install(ctx: Context) {
  ctx.page({
    path: '/content',
    name: 'content',
    label: '内容管理',
    icon: '📝',
    order: 10,
    component: ContentView,
  })
}
