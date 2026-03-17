import { dirname, basename } from 'node:path'
import nunjucks from 'nunjucks'
import { Context } from 'cordis'
import type { Renderer } from '@akari/core'

export const name = 'engine-nunjucks'
export const inject = ['renderer']

export interface Config {
  autoescape?: boolean
  throwOnUndefined?: boolean
  trimBlocks?: boolean
  lstripBlocks?: boolean
}

export function apply(ctx: Context, config: Config = {}) {
  const envOpts = {
    autoescape: config.autoescape ?? false,
    throwOnUndefined: config.throwOnUndefined ?? false,
    trimBlocks: config.trimBlocks ?? false,
    lstripBlocks: config.lstripBlocks ?? false,
  }

  const renderer: Renderer = {
    async renderFile(path: string, locals: Record<string, any>): Promise<string> {
      return new Promise((resolve, reject) => {
        // Configure nunjucks with the template's directory so it can
        // resolve both absolute paths and relative {% include %} / {% extends %}.
        const env = nunjucks.configure(dirname(path), envOpts)
        // Add all locals as globals so they're available in templates
        for (const [key, value] of Object.entries(locals)) {
          if (typeof value === 'function') {
            env.addGlobal(key, value)
          }
        }
        env.render(basename(path), locals, (err, result) => {
          if (err) reject(err)
          else resolve(result || '')
        })
      })
    },
    async renderString(template: string, locals: Record<string, any>): Promise<string> {
      return new Promise((resolve, reject) => {
        const env = nunjucks.configure(envOpts)
        for (const [key, value] of Object.entries(locals)) {
          if (typeof value === 'function') {
            env.addGlobal(key, value)
          }
        }
        env.renderString(template, locals, (err, result) => {
          if (err) reject(err)
          else resolve(result || '')
        })
      })
    },
  }

  ctx.renderer.register('nunjucks', renderer)
}
