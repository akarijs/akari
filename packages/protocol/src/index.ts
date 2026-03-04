import { Dict, is } from 'cosmokit'

/**
 * 基础元素类型
 * 涵盖了 HTML 标准子集以及 Akari 自定义组件
 */
export type ElementType =
  | 'text' // 纯文本节点
  | 'heading' // 标题 (h1-h6)
  | 'paragraph' // 段落
  | 'list' // 列表 (ul/ol)
  | 'item' // 列表项 (li)
  | 'link' // 链接
  | 'image' // 图片
  | 'code' // 代码块
  | 'quote' // 引用
  | 'fragment' // 片段（类似 React.Fragment）
  | string // 支持自定义组件，如 'akari:bilibili'

export interface AkariElement {
  type: ElementType
  attrs: Dict
  children: (AkariElement | string)[]
}

/**
 * HyperScript 构造函数：h('type', { attrs }, ...children)
 */
export function h(type: ElementType, attrs: Dict, ...children: any[]): AkariElement {
  return {
    type,
    attrs: attrs || {},
    children: children.flat(Infinity).filter(c => c !== null && c !== undefined).map(child => {
      // 自动将基本类型转换为 text 节点是不必要的，
      // 因为在 AE 中字符串本身就是合法的叶子节点，
      // 但为了后续处理方便，我们可以选择将其规范化。
      return is('String', child) ? String(child) : child
    }),
  }
}

/**
 * 判定是否为 AkariElement
 */
export function isElement(node: any): node is AkariElement {
  return node && typeof node === 'object' && 'type' in node && 'children' in node
}

/**
 * 递归遍历 AE 树
 */
export function traverse(node: AkariElement | string, fn: (node: AkariElement | string) => void) {
  fn(node)
  if (isElement(node)) {
    node.children.forEach(child => traverse(child, fn))
  }
}

/**
 * 序列化为简单的 JSON 对象（用于数据库存储）
 */
export function stringify(node: AkariElement): string {
  return JSON.stringify(node)
}

/**
 * 反序列化
 */
export function parse(content: string): AkariElement {
  return JSON.parse(content)
}
