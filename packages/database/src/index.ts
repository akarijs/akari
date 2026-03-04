import { Context } from 'cordis'
import { AkariService } from '@akarijs/core'
import { LedgerEntry, TableConfig } from './model'
import { Dict } from 'cosmokit'
import { createHash } from 'node:crypto'

declare module 'cordis' {
  interface Context {
    database: DatabaseService
  }

  interface Events {
    'database/table-define'(name: string, config: TableConfig): void
    'database/change'(table: string, id: string, data: any): void
    'database/remove'(table: string, id: string): void
  }
}

export interface SyncOptions<T> {
  /** 获取当前所有实体的指纹清单 (id -> signature) */
  fingerprint: () => Promise<Dict<string>>
  /** 只有当指纹不匹配时，才会触发该加载器 */
  loader: (id: string) => Promise<T>
}

export class DatabaseService extends AkariService {
  // 模拟 Minato 的内存存储：table -> id -> data
  private _tables = new Map<string, Map<string, any>>()
  // 增量账本：table -> id -> LedgerEntry
  private _ledger = new Map<string, Map<string, LedgerEntry>>()
  // 表结构配置
  private _configs = new Map<string, TableConfig>()

  constructor(ctx: Context) {
    super(ctx, 'database', true)
  }

  protected init() {
    this.ctx.logger('akari').info('Database storage initialized.')
  }

  /**
   * 定义表结构 (类似 Minato 的 model.extend)
   */
  public extend(name: string, config: TableConfig) {
    this._configs.set(name, config)
    if (!this._tables.has(name)) {
      this._tables.set(name, new Map())
      this._ledger.set(name, new Map())
    }
    this.ctx.emit('database/table-define', name, config)
  }

  /**
   * 基于指纹协议同步数据
   */
  public async sync<T>(tableName: string, options: SyncOptions<T>) {
    const table = this._tables.get(tableName)
    const ledger = this._ledger.get(tableName)
    if (!table || !ledger) {
      throw new Error(`Table "${tableName}" is not defined. Call extend() first.`)
    }

    const { fingerprint, loader } = options
    const currentManifest = await fingerprint()
    const seenIds = new Set<string>()

    for (const [id, signature] of Object.entries(currentManifest)) {
      seenIds.add(id)
      const cached = ledger.get(id)

      // 1. 指纹校验 (Fingerprint Check)
      if (cached && cached.signature === signature) {
        continue // 物理状态未变，跳过
      }

      // 2. 加载原始数据
      const rawData = await loader(id)

      // 3. 内容哈希校验 (Content Hash Check)
      // 解决“文件保存了但内容没变”的情况
      const contentHash = this.hash(rawData)
      if (cached && cached.hash === contentHash) {
        // 更新指纹，但中断下游通知
        ledger.set(id, { ...cached, signature })
        continue
      }

      // 4. 入库并更新账本
      table.set(id, rawData)
      ledger.set(id, {
        signature,
        hash: contentHash,
        updatedAt: Date.now(),
      })

      // 5. 触发变更事件 (供 Graph 和 Composer 监听)
      this.ctx.emit('database/change', tableName, id, rawData)
    }

    // 6. 清理孤儿节点 (Orphan Cleanup)
    // 如果账本里有，但 fingerprint 清单里没了，说明源文件被删除了
    for (const id of ledger.keys()) {
      if (!seenIds.has(id)) {
        table.delete(id)
        ledger.delete(id)
        this.ctx.emit('database/remove', tableName, id)
      }
    }
  }

  /**
   * 基础查询接口
   */
  public get<T = any>(tableName: string, id: string): T | undefined {
    return this._tables.get(tableName)?.get(id)
  }

  public select<T = any>(tableName: string, query: (data: T) => boolean = () => true): T[] {
    const data = Array.from(this._tables.get(tableName)?.values() || [])
    return data.filter(query)
  }

  /**
   * 计算内容哈希
   */
  private hash(data: any): string {
    const str = typeof data === 'string' ? data : JSON.stringify(data)
    return createHash('sha1').update(str).digest('hex').slice(0, 16)
  }
}

export default DatabaseService
