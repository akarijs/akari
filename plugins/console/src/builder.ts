import * as vite from 'vite'
// @ts-ignore
import type { RollupOutput } from 'rollup'
import { existsSync, promises as fs } from 'fs'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import vue from '@vitejs/plugin-vue'

export async function build(root: string, config: vite.UserConfig = {}) {
  const webDir = root + '/src/web' // changed from '/client' to '/src/web' to match Akari standard
  if (!existsSync(webDir)) return

  const outDir = root + '/dist/web'
  if (existsSync(outDir)) {
    await fs.rm(outDir, { recursive: true })
  }
  await fs.mkdir(outDir, { recursive: true })

  const results = await vite.build(vite.mergeConfig({
    root,
    build: {
      write: false,
      outDir: 'dist/web',
      assetsDir: '',
      minify: true,
      emptyOutDir: true,
      commonjsOptions: {
        strictRequires: true,
      },
      lib: {
        entry: webDir + '/index.ts',
        fileName: 'index',
        formats: ['es'],
      },
      rollupOptions: {
        makeAbsoluteExternalsRelative: true,
        external: [
          'vue',
          'vue-router',
          '@vueuse/core',
          '@akari/console-client',
          '@akari/console-client/data'
        ],
        output: {
          format: 'iife',
        },
      },
    },
    plugins: [
      vue(),
    ],
    css: {
      preprocessorOptions: {
        scss: {
          api: 'modern-compiler',
        },
      },
    },
    resolve: {
      alias: {
        '@akari/console-client': resolve(fileURLToPath(new URL('..', import.meta.url)), 'client/index.ts'),
        '@akari/console-client/data': resolve(fileURLToPath(new URL('..', import.meta.url)), 'client/data.ts'),
      },
    },
    define: {
      'process.env.NODE_ENV': '"production"',
    },
  } as vite.InlineConfig, config)) as RollupOutput[]

  for (const item of results[0].output) {
    if (item.fileName === 'index.mjs') item.fileName = 'index.js'
    const dest = root + '/dist/web/' + item.fileName
    if (item.type === 'asset') {
      await fs.writeFile(dest, item.source)
    } else {
      const result = await vite.transformWithEsbuild(item.code, dest, {
        minifyWhitespace: true,
        charset: 'utf8',
      })
      await fs.writeFile(dest, result.code)
    }
  }
}

export async function createServer(baseDir: string, config: vite.InlineConfig = {}) {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)), 'app')
  return vite.createServer(vite.mergeConfig({
    root,
    base: '/console/', // mapped to console route instead of /vite/
    server: {
      middlewareMode: true,
      fs: {
        allow: [
          vite.searchForWorkspaceRoot(baseDir),
        ],
      },
    },
    plugins: [
      vue(),
    ],
    css: {
      preprocessorOptions: {
        scss: {
          api: 'modern-compiler',
        },
      },
    },
    resolve: {
      dedupe: ['vue', 'vue-router'],
      alias: [
        { find: '@akari/console-client/data', replacement: resolve(fileURLToPath(new URL('..', import.meta.url)), 'client/data.ts') },
        { find: '@akari/console-client', replacement: resolve(fileURLToPath(new URL('..', import.meta.url)), 'client/index.ts') },
      ],
    },
    optimizeDeps: {
      include: [
        'vue',
        'vue-router',
      ],
    },
    build: {
      rollupOptions: {
        input: root + '/index.html',
      },
    },
  } as vite.InlineConfig, config))
}
