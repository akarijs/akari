import { Context, Service } from 'cordis';

/**
 * 我们不再强制要求 T 泛型，默认让它继承 cordis 的 Service
 * 这样 this.ctx 就会自动应用所有的模块扩充
 */
export abstract class AkariService<C extends Context = Context> extends Service<any, C> {
    constructor(ctx: C, name: string, immediate?: boolean) {
        super(ctx, name, immediate);
    }

    protected abstract init(): Promise<void> | void;

    protected override start() {
        return this.init();
    }
}