import { createAkari, Schema } from '@akarijs/core';
import { CollectionService } from '@akarijs/collection';
import { GraphService } from '@akarijs/graph';
import { ViewService } from '@akarijs/view';
import { RouterService } from '@akarijs/router';
import { rm } from 'node:fs/promises';

async function bootstrap() {
  // 0. 清理旧的输出环境
  await rm('./dist', { recursive: true, force: true });

  // 1. 创建 Akari 实例
  const ctx = createAkari();

  // 2. 挂载核心服务 (顺序很重要)
  ctx.plugin(CollectionService);
  ctx.plugin(GraphService);
  ctx.plugin(ViewService);
  ctx.plugin(RouterService);

  // 3. 配置：注册一个简单的 HTML 渲染引擎
  ctx.view.registerEngine('mock-html', async (entity) => {
    return {
      type: 'html',
      content: `
        <html>
          <head><title>${entity.data.title}</title></head>
          <body>
            <h1>${entity.data.title}</h1>
            <p>Category: ${entity.data.category}</p>
            <div>Content: ${entity.data.content}</div>
          </body>
        </html>
      `
    };
  });

  // 4. 配置：定义路由规则
  ctx.router.addRule({
    projection: 'posts-to-web',
    path: '/blog/:category/:slug.html',
    outDir: './dist'
  });

  // 5. 配置：定义投影规则
  ctx.view.project({
    name: 'posts-to-web',
    collection: 'posts',
    engine: 'mock-html'
  });

  // 6. 定义数据集合
  const postCollection = ctx.collections.define({
    name: 'posts',
    schema: Schema.object({
      title: Schema.string().required(),
      content: Schema.string().default('No content'),
      category: Schema.string().default('uncategorized'),
      slug: Schema.string().required(),
      tags: Schema.array(String).default([])
    })
  });

  // 等待系统就绪
  await ctx.start();

  console.log('\n--- 🚀 Akari Pipeline Triggered ---');

  // 7. 模拟数据泵入 (这是反应式的起点)
  postCollection.add('first-post', {
    title: 'Hello Akari.js',
    content: '这是基于 Cordis 重构的跨时代 SSG 工具。',
    category: 'tech',
    slug: 'hello-akari',
    tags: ['ssg', 'typescript']
  });

  // 8. 模拟数据更新 (测试增量更新逻辑)
  setTimeout(() => {
    console.log('\n--- ⚡️ Updating Data (Reactive Update) ---');
    postCollection.add('first-post', {
      title: 'Hello Akari.js (Updated)',
      content: '内容已更新，图谱会自动追踪并重新渲染。',
      category: 'tech',
      slug: 'hello-akari'
    });
  }, 1000);
}

bootstrap().catch(console.error);