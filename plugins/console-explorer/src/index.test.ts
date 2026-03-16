import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from 'cordis'
import { ServerService } from '@akari/plugin-server'
import { ConsoleService } from '@akari/plugin-console'
import explorerPlugin from './index.js'
import { name } from './index.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const tmpDir = resolve(__dirname, '../.test-explorer')

describe('console-explorer', () => {
  let ctx: Context

  beforeAll(() => {
    mkdirSync(resolve(tmpDir, 'subdir'), { recursive: true })
    writeFileSync(resolve(tmpDir, 'hello.md'), '# Hello World')
    writeFileSync(resolve(tmpDir, 'readme.txt'), 'This is a readme')
    writeFileSync(resolve(tmpDir, 'subdir/nested.md'), '# Nested')
  })

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  beforeEach(async () => {
    ctx = new Context()
    ctx.plugin(ServerService, { port: 0 })
    ctx.plugin(ConsoleService)
    await new Promise<void>((resolve) => {
      ctx.inject(['console'], () => resolve())
    })
  })

  afterEach(async () => {
    await ctx.stop()
  })

  it('exports the correct plugin name', () => {
    expect(name).toBe('console-explorer')
  })

  it('exports correct inject dependencies', () => {
    expect(explorerPlugin.inject).toEqual(['console'])
  })

  it('registers Explorer route on apply', () => {
    ctx.plugin(explorerPlugin, { rootDir: tmpDir })
    const routes = ctx.console.getRoutes()
    expect(routes.some((route) => route.path === 'explorer')).toBe(true)
  })

  it('Explorer lists files in directory', async () => {
    const provider = new explorerPlugin(ctx, { rootDir: tmpDir })
    const files = await provider.get()
    expect(files.length).toBeGreaterThanOrEqual(3) // hello.md, readme.txt, subdir
    const names = files.map((f: any) => f.name)
    expect(names).toContain('hello.md')
    expect(names).toContain('readme.txt')
    expect(names).toContain('subdir')
  })

  it('Explorer correctly identifies file types', async () => {
    const provider = new explorerPlugin(ctx, { rootDir: tmpDir })
    const files = await provider.get()
    const subdir = files.find((f: any) => f.name === 'subdir')
    expect(subdir?.type).toBe('directory')
    const hello = files.find((f: any) => f.name === 'hello.md')
    expect(hello?.type).toBe('file')
    expect(hello?.extension).toBe('.md')
  })

  it('Explorer reports file sizes', async () => {
    const provider = new explorerPlugin(ctx, { rootDir: tmpDir })
    const files = await provider.get()
    const hello = files.find((f: any) => f.name === 'hello.md')
    expect(hello?.size).toBeGreaterThan(0)
  })
})
