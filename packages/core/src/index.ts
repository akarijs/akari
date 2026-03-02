export * from 'cordis';
export * from './context';
export * from './service';

import { Akari } from './context';

/**
 * 工厂函数：创建一个 Akari 实例
 */
export function createAkari(config?: any) {
  const ctx = new Akari(config);

  // 注入基础日志或监控逻辑
  ctx.on('ready', () => {
    console.log('✨ Akari.js Kernel is ready.');
  });

  return ctx;
}