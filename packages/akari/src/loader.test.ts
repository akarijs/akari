import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
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
    it('should parse YAML config', () => {
      const configPath = join(tmpDir, 'akari.config.yml')
      writeFileSync(configPath, 'transformer-markdown:\n  html: true\nbuild:\n  outputDir: ./public\n')
      const loader = new Loader()
      loader.init(configPath)
      const config = loader.readConfig()
      expect(config['transformer-markdown']).toEqual({ html: true })
      expect(config.build).toEqual({ outputDir: './public' })
      expect(config.plugins['transformer-markdown']).toEqual({ html: true })
    })

    it('should parse JSON config', () => {
      const configPath = join(tmpDir, 'akari.config.json')
      writeFileSync(configPath, JSON.stringify({
        'transformer-markdown': { html: true },
        build: { outputDir: './public' },
      }))
      const loader = new Loader()
      loader.init(configPath)
      const config = loader.readConfig()
      expect(config['transformer-markdown']).toEqual({ html: true })
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

    it('should store config on the loader instance', () => {
      const configPath = join(tmpDir, 'akari.config.yml')
      writeFileSync(configPath, 'foo: bar\n')
      const loader = new Loader()
      loader.init(configPath)
      loader.readConfig()
      expect(loader.config.foo).toEqual('bar')
      expect(loader.config.plugins.foo).toEqual('bar')
    })
  })
})
