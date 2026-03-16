/**
 * @akari/console-explorer — frontend entry point (Vue 3)
 */

import type { Context } from '@akari/console-client'
// @ts-ignore
import { store } from '@akari/console-client/data'
import ExplorerView from './ExplorerView.vue'

export default async function install(ctx: Context) {
  ctx.page({
    path: '/explorer',
    name: 'explorer',
    label: '文件浏览器',
    icon: '📁',
    order: 20,
    component: ExplorerView,
  })
}
