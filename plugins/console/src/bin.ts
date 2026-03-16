#!/usr/bin/env node
import { resolve } from 'path'
import { build } from './builder.js'
import { existsSync, readFileSync } from 'fs'

async function main() {
  // A simple build script for compiling all sub-plugins passed as arguments (mirrors yakumo client)
  const dirs = process.argv.slice(2)
  if (!dirs.length) {
    console.error('Usage: tsx build.ts <path> [path...]')
    process.exit(1)
  }

  for (const dir of dirs) {
    const root = resolve(process.cwd(), dir)
    if (!existsSync(root)) {
      console.log(`Skipping ${dir} (not found)`)
      continue
    }
    
    // Minimal extraction of any custom config
    let config = {}
    const pkgPath = resolve(root, 'package.json')
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
        // If meta.yakumo.client is defined, we'd load it. Or just assume standard for now.
        if (pkg.yakumo?.client) {
          const cfgPath = resolve(root, pkg.yakumo.client)
          if (existsSync(cfgPath)) {
             try {
               const mod = await import(cfgPath)
               const exports = mod.default || mod
               if (typeof exports === 'function') {
                 await exports()
                 continue
               }
               config = exports
             } catch (e) {
               console.error(`Failed to load ${cfgPath}`, e)
             }
          }
        }
      } catch (e) {}
    }
    
    console.log(`Building client for ${dir}...`)
    await build(root, config)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
