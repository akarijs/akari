import { readdir, stat, readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { resolve, relative, join, extname } from 'node:path'
import { Context, Service } from 'cordis'
import { DataService } from '@akari/plugin-console'
import { fileURLToPath } from 'node:url'

export const name = 'console-explorer'

export interface FileEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  modifiedAt?: string
  extension?: string
}

declare module '@akari/plugin-console' {
  namespace ConsoleService {
    interface Services {
      explorer: Explorer
    }
  }
}

class Explorer extends DataService<FileEntry[]> {
  static inject = ['console']
  static [Service.provide] = 'console-explorer' as const

  private rootDir: string

  constructor(ctx: Context, config: Explorer.Config = {}) {
    super(ctx, 'explorer', { immediate: true })
    this.rootDir = resolve(config.rootDir || process.cwd())

    // UI Routing & Entries
    ctx.console.addRoute({ path: 'explorer', title: '文件浏览器' })

    const entryFile = fileURLToPath(new URL('../src/web/index.ts', import.meta.url))
    const bundleFile = fileURLToPath(new URL('../dist/web/index.js', import.meta.url))
    ctx.console.addEntry(
      { dev: entryFile, prod: bundleFile },
      () => ({ label: '文件浏览器', order: 20 })
    )

    // Listeners
    ctx.console.addListener('explorer/list', async (dirPath?: string) => {
      const targetDir = dirPath ? resolve(this.rootDir, dirPath) : this.rootDir
      if (!targetDir.startsWith(this.rootDir)) throw new Error('Access denied: path is outside root directory')
      return this.listDirectory(targetDir, this.rootDir)
    })

    ctx.console.addListener('explorer/read', async (filePath: string) => {
      const fullPath = resolve(this.rootDir, filePath)
      if (!fullPath.startsWith(this.rootDir)) throw new Error('Access denied: path is outside root')
      const content = await readFile(fullPath, 'utf-8')
      return { path: filePath, content }
    })

    ctx.console.addListener('explorer/write', async (filePath: string, content: string) => {
      const fullPath = resolve(this.rootDir, filePath)
      if (!fullPath.startsWith(this.rootDir)) throw new Error('Access denied: path is outside root')
      await mkdir(resolve(fullPath, '..'), { recursive: true })
      await writeFile(fullPath, content, 'utf-8')
      this.refresh()
      return { path: filePath, success: true }
    })

    ctx.console.addListener('explorer/delete', async (filePath: string) => {
      const fullPath = resolve(this.rootDir, filePath)
      if (!fullPath.startsWith(this.rootDir)) throw new Error('Access denied: path is outside root')
      await rm(fullPath, { recursive: true })
      this.refresh()
      return { path: filePath, success: true }
    })

    ctx.console.addListener('explorer/mkdir', async (dirPath: string) => {
      const fullPath = resolve(this.rootDir, dirPath)
      if (!fullPath.startsWith(this.rootDir)) throw new Error('Access denied: path is outside root')
      await mkdir(fullPath, { recursive: true })
      this.refresh()
      return { path: dirPath, success: true }
    })
  }

  async get(): Promise<FileEntry[]> {
    return this.listDirectory(this.rootDir, this.rootDir)
  }

  private async listDirectory(dir: string, rootDir: string): Promise<FileEntry[]> {
    const entries: FileEntry[] = []
    try {
      const items = await readdir(dir, { withFileTypes: true })
      for (const item of items) {
        if (item.name.startsWith('.') || item.name === 'node_modules') continue
        const fullPath = join(dir, item.name)
        const relPath = relative(rootDir, fullPath)
        if (item.isDirectory()) {
          entries.push({ name: item.name, path: relPath, type: 'directory' })
        } else if (item.isFile()) {
          try {
            const fileStat = await stat(fullPath)
            entries.push({
              name: item.name,
              path: relPath,
              type: 'file',
              size: fileStat.size,
              modifiedAt: fileStat.mtime.toISOString(),
              extension: extname(item.name),
            })
          } catch {
            entries.push({ name: item.name, path: relPath, type: 'file' })
          }
        }
      }
    } catch {}
    return entries
  }
}

namespace Explorer {
  export interface Config {
    rootDir?: string
  }
}

export default Explorer
