import { Dict } from 'cosmokit';

export interface Entity<T = any> {
    id: string;          // 唯一标识符（如文件路径或 UUID）
    collection: string;  // 所属集合名称
    data: T;             // 经过校验的结构化数据
    meta: Dict;          // 插件注入的额外元数据（如阅读时间、SEO信息）
    source?: string;     // 原始数据追踪（可选）
    hash?: string;       // 内容哈希，用于增量构建判定
}

export type EntityMap<T = any> = Map<string, Entity<T>>;