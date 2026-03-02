import { Context } from 'cordis';
import { AkariService } from './service';

/**
 * Akari 核心上下文
 * 这里定义了全局服务接口，后续子模块会通过 TypeScript 的模块合并（Module Augmentation）来扩展它
 */
export interface AkariContext extends Context {
    // 核心服务声明预留
}

/**
 * 这种扩展方式允许我们在编写插件时，
 * 获得完美的 IDE 补全，即使服务是由不同的 npm 包提供的。
 */
export class Akari extends Context {
    constructor(config?: any) {
        super(config);
    }
}

// 导出基础 Service 供子模块引用
export { AkariService };