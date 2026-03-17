import { resolve, dirname } from 'node:path'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { Context } from 'cordis'
import { RendererService } from '@akari/core'
import * as engineNunjucks from './index.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const tmpDir = resolve(__dirname, '../.test-templates')

describe('engine-nunjucks', () => {
  let ctx: Context

  beforeAll(() => {
    mkdirSync(tmpDir, { recursive: true })
    writeFileSync(resolve(tmpDir, 'hello.njk'), 'Hello, {{ name }}!')
    writeFileSync(resolve(tmpDir, 'post.njk'), '<h1>{{ post.title }}</h1>\n<div>{{ post.content | safe }}</div>')
    writeFileSync(resolve(tmpDir, 'with-helper.njk'), '{{ upper("hello") }}')
  })

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  beforeEach(async () => {
    ctx = new Context()
    ctx.plugin(RendererService)
    ctx.plugin(engineNunjucks)
    await new Promise<void>(resolve => {
      ctx.inject(['renderer'], () => resolve())
    })
  })

  afterEach(() => ctx.stop())

  it('renders a simple template', async () => {
    const renderer = ctx.renderer.get('nunjucks')
    const result = await renderer.renderFile(resolve(tmpDir, 'hello.njk'), { name: 'World' })
    expect(result).toBe('Hello, World!')
  })

  it('renders with complex data', async () => {
    const renderer = ctx.renderer.get('nunjucks')
    const result = await renderer.renderFile(resolve(tmpDir, 'post.njk'), {
      post: { title: 'My Post', content: '<p>Hello</p>' },
    })
    expect(result).toContain('<h1>My Post</h1>')
    expect(result).toContain('<p>Hello</p>')
  })

  it('renders with helper functions', async () => {
    const renderer = ctx.renderer.get('nunjucks')
    const result = await renderer.renderFile(resolve(tmpDir, 'with-helper.njk'), {
      upper: (s: string) => s.toUpperCase(),
    })
    expect(result).toBe('HELLO')
  })
})
