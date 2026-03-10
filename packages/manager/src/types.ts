/**
 * Akari 系统级元数据表定义
 */
export interface AkariSchema {
  akari_sources: AkariSource
  akari_sites: AkariSite
}

export interface AkariSource {
  id: string
  name: string
  driver: string
  config: any
}

export interface AkariSite {
  id: string
  name: string
  outDir: string
  template: string
  sources: string[] // 依赖的数据源 ID 列表
}
