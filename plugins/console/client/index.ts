/**
 * @akari/console-client
 *
 * Client-side context API for Akari console plugins.
 * This module defines the ConsoleContext that plugins receive in their install() function.
 *
 * Used by plugins to register pages and interact with the console.
 * Import type only — the real instance is passed at runtime by the console shell.
 */

import * as cordis from 'cordis'
import { reactive, type Component } from 'vue'
import type { Router } from 'vue-router'

export interface PageOptions {
  /** URL path, e.g. '/content' */
  path: string
  /** Route name (must be unique), e.g. 'content' */
  name: string
  /** display label in the sidebar nav */
  label: string
  /** Vue component to render */
  component: Component
  /** optional icon name */
  icon?: string
  /** sort order, smaller = first */
  order?: number
}

export interface NavItem extends PageOptions {}

declare module 'cordis' {
  interface Context {
    $router: RouterService
    page(options: PageOptions): () => void
  }
}

/** Registry kept in-memory, shared via the context */
export class RouterService extends cordis.Service {
  static [cordis.Service.provide] = '$router'

  public pages = reactive<NavItem[]>([])

  constructor(ctx: cordis.Context, public vueRouter: Router) {
    super(ctx, '$router', true)
    ctx.mixin('$router', ['page'])
  }

  /**
   * Register a page route. The component is added to the Vue Router and the
   * sidebar nav is updated reactively.
   */
  page(options: PageOptions) {
    this.vueRouter.addRoute('console', {
      path: options.path,
      name: options.name,
      component: options.component,
      meta: { label: options.label, icon: options.icon, order: options.order ?? 0 },
    })

    const item: NavItem = {
      ...options,
      order: options.order ?? 0,
    }
    this.pages.push(item)
    this.pages.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name))

    return this.ctx.effect(() => {
      return () => {
        this.vueRouter.removeRoute(options.name)
        const idx = this.pages.indexOf(item)
        if (idx !== -1) this.pages.splice(idx, 1)
      }
    })
  }
}

/** The root context. Sub-plugins should use this context type. */
export class ConsoleContext extends cordis.Context {
  constructor() {
    super()
  }
}

export { ConsoleContext as Context }

