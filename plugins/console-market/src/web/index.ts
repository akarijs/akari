/**
 * @akari/console-market — frontend entry point (Vue 3)
 */

import type { Context } from '@akari/console-client'
// @ts-ignore
import MarketView from './MarketView.vue'

export default async function install(ctx: Context) {
  ctx.page({
    path: '/market',
    name: 'market',
    label: '插件市场',
    icon: '🛍️',
    order: 30,
    component: MarketView,
  })
}
