import { Context } from 'cordis';
import { AkariService } from '@akarijs/core';
import { RenderResult } from '@akarijs/view';
import { Entity } from '@akarijs/collection';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

// 1. 类型扩充
declare module 'cordis' {
    interface Context {
        router: RouterService;
    }
    interface Events<C extends Context = Context> {
        'router/emit'(path: string, content: string): void;
    }
}

export interface RouteRule {
    projection: string;
    // 支持字符串模板，例如 "/posts/:slug.html"
    path: string | ((entity: Entity) => string);
    outDir?: string;
}

export class RouterService extends AkariService {
    private rules = new Map<string, RouteRule>();
    private routeMap = new Map<string, string>(); // 存储 nodeId -> path 的映射

    constructor(ctx: Context) {
        super(ctx, 'router', true);
    }

    protected init() {
        /**
         * 核心逻辑：订阅渲染完成事件
         * 当 ViewService 渲染完一个实体，Router 负责落地
         */
        this.ctx.on('view/render-complete', async (nodeId, result) => {
            await this.dispatch(nodeId, result);
        });
    }

    /**
     * 添加路由规则
     */
    public addRule(rule: RouteRule) {
        this.rules.set(rule.projection, rule);
    }

    /**
     * 将渲染结果分发到文件系统
     */
    private async dispatch(nodeId: string, result: RenderResult) {
        // 1. 简单演示：假设我们知道这个节点对应哪个投影
        // 实际生产中需要从 ctx.graph 中查询关联的 Projection 节点
        const [collectionName] = nodeId.split(':');

        // 查找匹配此投影的规则
        // 这里简化处理：寻找匹配该集合首选投影的规则
        const rule = Array.from(this.rules.values()).find(r => r.projection.includes(collectionName));

        if (!rule) return;

        // 2. 获取实体对象以计算路径
        const entity = this.ctx.collections.define({ name: collectionName, schema: null as any }).get(nodeId.split(':')[1]);
        if (!entity) return;

        // 3. 计算最终路径
        const path = typeof rule.path === 'function'
            ? rule.path(entity)
            : this.interpolate(rule.path, entity);

        const fullPath = join(rule.outDir || 'dist', path);

        // 4. 写入文件
        try {
            await mkdir(dirname(fullPath), { recursive: true });
            await writeFile(fullPath, result.content, 'utf-8');

            this.routeMap.set(nodeId, fullPath);
            this.ctx.emit('router/emit', fullPath, result.content);
            this.ctx.logger('akari').info(`🚀 Emitted: ${path}`);
        } catch (err) {
            this.ctx.logger('akari').error(`Failed to write file ${fullPath}:`, err);
        }
    }

    /**
     * 简单的路径插值引擎 (MVP 级别)
     */
    private interpolate(pattern: string, entity: Entity): string {
        let path = pattern;
        const data = { ...entity.data, id: entity.id, slug: entity.data.slug || entity.id };

        for (const [key, val] of Object.entries(data)) {
            path = path.replace(`:${key}`, String(val));
        }
        return path;
    }
}

export default RouterService;