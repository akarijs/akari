import { Context } from 'cordis';
import { AkariService } from '@akarijs/core'

declare module 'cordis' {
  interface Context {
    graph: GraphService;
  }
  interface Events {
    /** 当某个节点失效时触发 */
    'graph/invalidate'(nodeId: string): void;
  }
}

export type NodeType = 'table' | 'row' | 'page' | 'asset';

export class GraphService extends AkariService {
  /** * 存储边关系: target -> Set<source>
   * 采用反向索引，方便从数据变更找受影响的页面
   */
  private _revDeps = new Map<string, Set<string>>();

  constructor(ctx: Context) {
    super(ctx, 'graph', true);
  }

  protected init() {
    this.ctx.logger('akari').info('Graph dependency engine initialized.');
  }

  /**
   * 建立依赖关系：source 依赖于 target
   * @example link('page:index', 'data:table:posts')
   */
  public link(source: string, target: string) {
    if (!this._revDeps.has(target)) {
      this._revDeps.set(target, new Set());
    }
    this._revDeps.get(target)!.add(source);
    this.ctx.logger('akari').debug(`Graph link: ${source} -> ${target}`);
  }

  /**
   * 解除依赖关系
   */
  public unlink(source: string, target: string) {
    this._revDeps.get(target)?.delete(source);
  }

  /**
   * 使某个节点失效，并传播给所有依赖它的节点
   */
  public invalidate(nodeId: string) {
    this.ctx.emit('graph/invalidate', nodeId);

    // 找到所有依赖此节点的下游
    const dependents = this._revDeps.get(nodeId);
    if (dependents) {
      for (const depId of dependents) {
        this.ctx.logger('akari').debug(`Propagating invalidation: ${nodeId} -> ${depId}`);
        // 递归使下游也失效
        this.invalidate(depId);
      }
    }
  }

  /**
   * 清理某个节点的所有出边（通常在页面被删除时调用）
   */
  public clear(source: string) {
    for (const [target, sources] of this._revDeps) {
      sources.delete(source);
    }
  }
}

export default GraphService;