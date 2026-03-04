export type FieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'json'
  | 'list'
  | 'date'

export interface ModelDefinition {
  primary?: string
  fields: Record<string, FieldType>
}

export interface TableConfig extends ModelDefinition {
  name: string
}

/**
 * 存储在账本中的元数据，用于判定增量
 */
export interface LedgerEntry {
  signature: string // 外部指纹 (如 mtime)
  hash: string // 内容哈希 (数据解析后的指纹)
  updatedAt: number
}
