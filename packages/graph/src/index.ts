import { Context, Service } from 'cordis';
import { AkariService } from '@akarijs/core';
import { Entity } from '@akarijs/collection';
import { AkariNode, AkariEdge } from './node';

// 严格按照你提供的类型声明进行扩展
declare module 'cordis' {
    interface Events<C extends Context = Context> {
        'collection/entity-added'(entity: Entity<any>): void;
        'collection/entity-removed'(collName: string, id: string): void;
        'graph/node-dirty'(nodeId: string): void;
        'graph/link'(from: string, to: string): void;
    }
}

declare module '@akarijs/core' {
    interface AkariContext {
        graph: GraphService;
    }
}

export class GraphService extends AkariService {
    private nodes = new Map<string, AkariNode>();
    private edges = new Set<AkariEdge>();

    constructor(ctx: Context) {
        super(ctx, 'graph', true);
    }

    protected init() {
        this.ctx.on('collection/entity-added', (entity) => {
            this.upsertEntityNode(entity);
        });

        this.ctx.on('collection/entity-removed', (coll, id) => {
            this.removeNode(`${coll}:${id}`);
        });
    }

    /**
     * 更新或创建实体节点
     */
    private upsertEntityNode(entity: Entity) {
        const nodeId = `${entity.collection}:${entity.id}`;
        let node = this.nodes.get(nodeId);

        if (node) {
            node.version++;
            node.origin = entity;
            this.ctx.emit('graph/node-dirty', nodeId);
        } else {
            let nodeCtx!: Context;

            /**
             * 技巧：定义一个唯一的匿名函数作为插件。
             * Cordis 会为每个不同的函数创建一个独立的 Scope。
             */
            const plugin = (ctx: Context) => {
                nodeCtx = ctx;
            };

            this.ctx.plugin(plugin);

            node = {
                id: nodeId,
                type: 'entity',
                origin: entity,
                version: 1,
                ctx: nodeCtx,
                plugin: plugin
            };

            this.nodes.set(nodeId, node);
            this.processTraits(node);
        }
    }

    private processTraits(node: AkariNode) {
        const entity = node.origin as Entity;
        const data = entity.data;

        // 自动为 tags 建立索引
        if (Array.isArray(data.tags)) {
            data.tags.forEach((tag: string) => {
                const tagId = `identity:tag:${tag}`;
                this.ensureIdentityNode(tagId, 'tag', tag);
                this.link(node.id, tagId, 'belong');
            });
        }
    }

    private ensureIdentityNode(id: string, trait: string, value: any) {
        if (this.nodes.has(id)) return;

        let nodeCtx!: Context;
        const plugin = (ctx: Context) => {
            nodeCtx = ctx;
        };

        this.ctx.plugin(plugin);

        this.nodes.set(id, {
            id,
            type: 'identity',
            version: 1,
            ctx: nodeCtx,
            plugin: plugin,
            origin: { trait, value }
        });
    }

    /**
     * 建立边关系：使用最新的 ctx.effect()
     */
    public link(from: string, to: string, type: AkariEdge['type'] = 'link') {
        const edge: AkariEdge = { from, to, type };
        const fromNode = this.nodes.get(from);

        if (fromNode) {
            /**
             * 使用 ctx.effect() 注册副作用。
             * 当 fromNode.ctx 被销毁时，这个清理函数会被自动执行。
             */
            fromNode.ctx.effect(() => {
                this.edges.add(edge);
                this.ctx.emit('graph/link', from, to);

                return () => {
                    this.edges.delete(edge);
                    this.ctx.logger('akari').debug(`Auto-cleanup edge: ${from} -> ${to}`);
                };
            });
        }
    }

    private removeNode(id: string) {
        const node = this.nodes.get(id);
        if (node) {
            /**
             * 核心修正：在 Cordis 中，销毁一个特定插件实例的
             * 最标准做法是直接从注册表中将其删除。
             */
            this.ctx.registry.delete(node.plugin);
            this.nodes.delete(id);
            this.ctx.logger('akari').info(`Node removed from graph: ${id}`);
        }
    }

    public getNeighbors(id: string) {
        return Array.from(this.edges)
            .filter(e => e.from === id || e.to === id)
            .map(e => (e.from === id ? e.to : e.from));
    }
}

export default GraphService;