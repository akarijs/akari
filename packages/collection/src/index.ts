import { Context, Schema } from 'cordis';
import { AkariService } from '@akarijs/core';
import { Entity, EntityMap } from './entity';

export * from './entity';

// 扩展 AkariContext 接口，让 IDE 能感知到 ctx.collections 服务
declare module 'cordis' {
    interface Context {
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

    // 显式声明依赖 (如果有的话，目前 collection 是基座，通常被别人依赖)
    static inject = [];

    protected init() {
        this.ctx.logger('akari').info('Collection service initialized.');
    }

    /**
       * 安全获取集合，如果不存在则报错或返回 null
       */
    public get(name: string) {
        return this._storage.get(name);
    }

    public define<T>(options: CollectionConfig<T>) {
        const { name, schema } = options;

        // 如果已经定义过，直接返回之前的 handle，而不是报错
        if (this._storage.has(name)) {
            return this.getHandle(name, schema);
        }

        this._storage.set(name, new Map());
        return this.getHandle(name, schema);
    }

    private getHandle<T>(name: string, schema: Schema<T>) {
        const entities = this._storage.get(name)!;
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