import { Context, Service } from 'cordis';

/**
 * Akari 基础服务类
 * 继承自 Cordis Service，自动注入生命周期管理
 */
export abstract class AkariService<T = any> extends Service<T, Context> {
    constructor(ctx: Context, name: string, immediate?: boolean) {
        super(ctx, name, immediate);
    }

    // 预留的标准化初始化接口
    protected abstract init(): Promise<void> | void;

    protected override start() {
        return this.init();
    }
}