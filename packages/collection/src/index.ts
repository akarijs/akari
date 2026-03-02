import { Context, Schema } from 'cordis';
import { AkariService } from '@akarijs/core';
import { Entity, EntityMap } from './entity';

export * from './entity';

// 扩展 AkariContext 接口，让 IDE 能感知到 ctx.collections 服务
declare module '@akarijs/core' {
    interface AkariContext {
        collections: CollectionService;
    }
}

declare module 'cordis' {
    interface Events<C extends Context = Context> {
        'collection/entity-added'(entity: Entity<any>): void;
        'collection/entity-removed'(collName: string, id: string): void;
    }
}

export interface CollectionConfig<T = any> {
    name: string;
    schema: Schema<T>;
    source?: string | string[]; // Glob 模式
}

export class CollectionService extends AkariService {
    private _storage = new Map<string, EntityMap>();

    constructor(ctx: Context) {
        super(ctx, 'collections', true);
    }

    protected init() {
        this.ctx.logger('akari').info('Collection service initialized.');
    }

    /**
     * 定义一个新的集合
     */
    define<T>(options: CollectionConfig<T>) {
        const { name, schema } = options;

        if (this._storage.has(name)) {
            throw new Error(`Collection "${name}" already exists.`);
        }

        const entities: EntityMap<T> = new Map();
        this._storage.set(name, entities);

        this.ctx.logger('akari').debug(`Defined collection: ${name}`);

        // 返回一个操作句柄，支持流式调用
        return {
            add: (id: string, rawData: any) => this.addEntity(name, id, rawData, schema),
            remove: (id: string) => this.removeEntity(name, id),
            get: (id: string) => entities.get(id),
            all: () => Array.from(entities.values()),
        };
    }

    private addEntity<T>(collName: string, id: string, rawData: any, schema: Schema<T>) {
        const entities = this._storage.get(collName)!;

        // 使用 Cordis Schema 进行强校验与默认值注入
        const validatedData = schema(rawData);

        const entity: Entity<T> = {
            id,
            collection: collName,
            data: validatedData,
            meta: {},
        };

        entities.set(id, entity);

        // 触发全局事件，供 ctx.graph 或渲染插件监听
        this.ctx.emit('collection/entity-added', entity);
        return entity;
    }

    private removeEntity(collName: string, id: string) {
        const entities = this._storage.get(collName);
        if (entities?.delete(id)) {
            this.ctx.emit('collection/entity-removed', collName, id);
        }
    }
}

export default CollectionService;