import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { Loader } from './loader.js'

const tmpDir = resolve(__dirname, '../../.test-loader')

function createTmpDir() {
  mkdirSync(tmpDir, { recursive: true })
}

function removeTmpDir() {
  rmSync(tmpDir, { recursive: true, force: true })
}

describe('Loader', () => {
  beforeEach(() => {
    createTmpDir()
  })

  afterEach(() => {
    removeTmpDir()
  })

  describe('init()', () => {
    it('should find akari.config.yml', () => {
      writeFileSync(join(tmpDir, 'akari.config.yml'), 'foo: bar\n')
      const loader = new Loader()
      loader.init(undefined, tmpDir)
      expect(loader.filename).toBe(resolve(tmpDir, 'akari.config.yml'))
      expect(loader.baseDir).toBe(tmpDir)
      expect(loader.mime).toBe('application/yaml')
    })

    it('should find akari.config.yaml', () => {
      writeFileSync(join(tmpDir, 'akari.config.yaml'), 'foo: bar\n')
      const loader = new Loader()
      loader.init(undefined, tmpDir)
      expect(loader.filename).toBe(resolve(tmpDir, 'akari.config.yaml'))
      expect(loader.mime).toBe('application/yaml')
    })

    it('should find akari.config.json', () => {
      writeFileSync(join(tmpDir, 'akari.config.json'), '{"foo":"bar"}')
      const loader = new Loader()
      loader.init(undefined, tmpDir)
      expect(loader.filename).toBe(resolve(tmpDir, 'akari.config.json'))
      expect(loader.mime).toBe('application/json')
    })

    it('should accept an explicit config path', () => {
      const configPath = join(tmpDir, 'custom.yml')
      writeFileSync(configPath, 'foo: bar\n')
      const loader = new Loader()
      loader.init(configPath)
      expect(loader.filename).toBe(resolve(configPath))
      expect(loader.mime).toBe('application/yaml')
    })

    it('should throw when config file is not found', () => {
      const loader = new Loader()
      expect(() => loader.init(undefined, tmpDir)).toThrow('config file not found')
    })

    it('should throw for unsupported extensions', () => {
      const configPath = join(tmpDir, 'config.toml')
      writeFileSync(configPath, '[foo]\nbar = 1\n')
      const loader = new Loader()
      expect(() => loader.init(configPath)).toThrow('not supported')
    })

    it('should throw when explicit path does not exist', () => {
      const loader = new Loader()
      expect(() => loader.init(join(tmpDir, 'nonexistent.yml'))).toThrow('not found')
    })
  })

  describe('readConfig()', () => {
    it('should parse YAML config into plugins-only shape', () => {
      const configPath = join(tmpDir, 'akari.config.yml')
      writeFileSync(configPath, 'transformer-markdown:\n  html: true\nbuild:\n  outputDir: ./public\n')
      const loader = new Loader()
      loader.init(configPath)
      const config = loader.readConfig()
      expect(config['transformer-markdown']).toBeUndefined()
      expect(config.build).toEqual({ outputDir: './public' })
      expect(config.plugins['transformer-markdown']).toEqual({ html: true })
    })

    it('should parse JSON config into plugins-only shape', () => {
      const configPath = join(tmpDir, 'akari.config.json')
      writeFileSync(configPath, JSON.stringify({
        'transformer-markdown': { html: true },
        build: { outputDir: './public' },
      }))
      const loader = new Loader()
      loader.init(configPath)
      const config = loader.readConfig()
      expect(config['transformer-markdown']).toBeUndefined()
      expect(config.build).toEqual({ outputDir: './public' })
      expect(config.plugins['transformer-markdown']).toEqual({ html: true })
    })

    it('should throw for invalid YAML config', () => {
      const configPath = join(tmpDir, 'akari.config.yml')
      writeFileSync(configPath, '123')
      const loader = new Loader()
      loader.init(configPath)
      expect(() => loader.readConfig()).toThrow('invalid config file')
    })

    it('should throw for array YAML config', () => {
      const configPath = join(tmpDir, 'akari.config.yml')
      writeFileSync(configPath, '- foo\n- bar\n')
      const loader = new Loader()
      loader.init(configPath)
      expect(() => loader.readConfig()).toThrow('invalid config file')
    })

    it('should store normalized config on the loader instance', () => {
      const configPath = join(tmpDir, 'akari.config.yml')
      writeFileSync(configPath, 'foo: bar\n')
      const loader = new Loader()
      loader.init(configPath)
      loader.readConfig()
      expect(loader.config.foo).toBeUndefined()
      expect(loader.config.plugins.foo).toEqual('bar')
    })

    it('should apply migrateEntry() on initial read', () => {
      class TestLoader extends Loader {
        protected migrateEntry(name: string, config: any) {
          if (name === 'foo') return { ...config, migrated: true }
          return config
        }
      }

      const configPath = join(tmpDir, 'akari.config.yml')
      writeFileSync(configPath, 'foo:\n  bar: 1\n')

      const loader = new TestLoader()
      loader.init(configPath)
      const config = loader.readConfig(true)
      expect(config.plugins.foo).toEqual({ bar: 1, migrated: true })
    })

    it('should write migrated config back to file when writable', async () => {
      class TestLoader extends Loader {
        protected migrateEntry(name: string, config: any) {
          if (name === 'foo') return { ...config, migrated: true }
          return config
        }
      }

      const configPath = join(tmpDir, 'akari.config.yml')
      writeFileSync(configPath, 'foo:\n  bar: 1\n')

      const loader = new TestLoader()
      loader.init(configPath)
      loader.readConfig(true)
      await new Promise(resolve => setTimeout(resolve, 10))

      const raw = readFileSync(configPath, 'utf8')
      expect(raw).toContain('migrated: true')
    })

    it('should support explicit config write via writeConfig()', async () => {
      const configPath = join(tmpDir, 'akari.config.yml')
      writeFileSync(configPath, 'foo:\n  bar: 1\n')

      const loader = new Loader()
      loader.init(configPath)
      loader.readConfig()
      loader.config.plugins.foo = { bar: 2 }

      await loader.writeConfig(true)

      const raw = readFileSync(configPath, 'utf8')
      expect(raw).toContain('bar: 2')
    })

    it('should support plugin key migration via migrateName()', () => {
      class TestLoader extends Loader {
        protected migrateName(name: string) {
          if (name === 'legacy-plugin') return 'modern-plugin'
          return undefined
        }
      }

      const configPath = join(tmpDir, 'akari.config.yml')
      writeFileSync(configPath, 'legacy-plugin:\n  enabled: true\n')

      const loader = new TestLoader()
      loader.init(configPath)
      const config = loader.readConfig(true)

      expect(config.plugins['legacy-plugin']).toBeUndefined()
      expect(config.plugins['modern-plugin']).toEqual({ enabled: true })
    })

    it('should preserve disabled and suffix parts when migrateName() renames plugin', () => {
      class TestLoader extends Loader {
        protected migrateName(name: string) {
          if (name === 'legacy-plugin') return 'modern-plugin'
          return undefined
        }
      }

      const configPath = join(tmpDir, 'akari.config.yml')
      writeFileSync(configPath, 'plugins:\n  "~legacy-plugin:alpha":\n    foo: 1\n')

      const loader = new TestLoader()
      loader.init(configPath)
      const config = loader.readConfig(true)

      expect(config.plugins['~legacy-plugin:alpha']).toBeUndefined()
      expect(config.plugins['~modern-plugin:alpha']).toEqual({ foo: 1 })
    })

    it('should write canonical plugins-only config without YAML anchors', async () => {
      const configPath = join(tmpDir, 'akari.config.yml')
      writeFileSync(configPath, 'foo:\n  bar: 1\n')

      const loader = new Loader()
      loader.init(configPath)
      loader.readConfig()

      await loader.writeConfig(true)

      const raw = readFileSync(configPath, 'utf8')
      expect(raw).toContain('plugins:')
      expect(raw).toContain('foo:')
      expect(raw).not.toContain('&ref_')
      expect(raw).not.toContain('*ref_')
      expect(raw.startsWith('foo:')).toBe(false)
    })

    it('should persist disabled state as ~plugin key', async () => {
      const configPath = join(tmpDir, 'akari.config.yml')
      writeFileSync(configPath, 'plugins:\n  foo:\n    bar: 1\n')

      const loader = new Loader()
      loader.init(configPath)
      loader.readConfig()

      ;(loader as any).persistPluginDisabled('foo')
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(loader.config.plugins.foo).toBeUndefined()
      expect(loader.config.plugins['~foo']).toEqual({ bar: 1 })

      const raw = readFileSync(configPath, 'utf8')
      expect(raw).toContain('~foo:')
      expect(raw).not.toContain('\n  foo:\n')
    })

    it('should persist enabled state as plugin key', async () => {
      const configPath = join(tmpDir, 'akari.config.yml')
      writeFileSync(configPath, 'plugins:\n  "~foo":\n    bar: 1\n')

      const loader = new Loader()
      loader.init(configPath)
      loader.readConfig()

      ;(loader as any).persistPluginEnabled('foo')
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(loader.config.plugins['~foo']).toBeUndefined()
      expect(loader.config.plugins.foo).toEqual({ bar: 1 })

      const raw = readFileSync(configPath, 'utf8')
      expect(raw).toContain('\n  foo:\n')
      expect(raw).not.toContain('~foo:')
    })
  })
})
