import { Context } from 'cordis';
import { AkariService } from '@akarijs/core';
import { Entity } from '@akarijs/collection';

export interface RenderResult {
    content: string;
    type: string; // 'html' | 'json' | 'xml' 等
}

export type RenderEngine = (entity: Entity) => Promise<RenderResult>;

export interface Projection {
    name: string;
    collection: string;
    selector?: (entity: Entity) => boolean;
    engine: string;
}

declare module 'cordis' {
    interface AkariContext {
        view: ViewService;
    }
}

declare module 'cordis' {
    interface Events<C extends Context = Context> {
        'view/render-start'(nodeId: string): void;
        'view/render-complete'(nodeId: string, result: RenderResult): void;
    }
}

export class ViewService extends AkariService {
    private engines = new Map<string, RenderEngine>();
    private projections: Projection[] = [];

    constructor(ctx: Context) {
        super(ctx, 'view', true);
    }

    protected init() {
        /**
         * 核心逻辑：监听图谱的脏检查
         * 当一个实体节点变脏时，触发与其关联的所有投影进行重绘
         */
        this.ctx.on('graph/node-dirty', async (nodeId) => {
            this.ctx.logger('akari').debug(`View sensing dirty node: ${nodeId}`);
            await this.refreshNode(nodeId);
        });
    }

    /**
     * 注册渲染引擎 (如 React, Markdown, Pug)
     */
    public registerEngine(name: string, engine: RenderEngine) {
        this.engines.set(name, engine);
    }

    /**
     * 注册投影配置
     */
    public project(options: Projection) {
        this.projections.push(options);

        // 如果是新投影，可能需要扫描现有图谱触发全量渲染
        // 这里的逻辑可以后续在构建流程中细化
    }

    /**
     * 执行渲染任务
     */
    private async refreshNode(nodeId: string) {
        // 1. 从 ID 中解析出集合名称
        const [collectionName] = nodeId.split(':');

        // 2. 找到该实体所属的所有投影
        const activeProjections = this.projections.filter(p => p.collection === collectionName);

        for (const proj of activeProjections) {
            const entity = this.ctx.collections.define({ name: collectionName, schema: null as any }).get(nodeId.split(':')[1]);

            if (!entity || (proj.selector && !proj.selector(entity))) continue;

            const engine = this.engines.get(proj.engine);
            if (!engine) {
                this.ctx.logger('akari').warn(`Engine ${proj.engine} not found for projection ${proj.name}`);
                continue;
            }

            this.ctx.emit('view/render-start', nodeId);

            try {
                const result = await engine(entity);
                this.ctx.emit('view/render-complete', nodeId, result);
                this.ctx.logger('akari').info(`Rendered [${proj.name}]: ${nodeId}`);
            } catch (err) {
                this.ctx.logger('akari').error(`Render failed for ${nodeId}:`, err);
            }
        }
    }
}

export default ViewService;