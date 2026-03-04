/* eslint-disable no-console */

import { Context } from '@akarijs/core'
import { DatabaseService } from '@akarijs/database'
import { ComposerService } from '@akarijs/composer'
import { ViewService } from '@akarijs/view'
import { RouterService } from '@akarijs/router'
import { h } from '@akarijs/protocol'

async function bootstrap() {
  const ctx = new Context()

  // 1. 挂载所有重构后的核心服务
  ctx.plugin(DatabaseService)
  ctx.plugin(ComposerService)
  ctx.plugin(ViewService)
  ctx.plugin(RouterService, { outDir: './dist-demo', writeToDisk: true })

  // 2. 初始化：定义数据模型 (Schema)
  ctx.database.extend('authors', {
    fields: { name: 'string', bio: 'string' },
    name: 'authors',
  })

  ctx.database.extend('posts', {
    name: 'posts',
    fields: { title: 'string', content: 'string', authorId: 'string' },
  })

  // 3. 配置渲染引擎：将 AE 协议内容渲染为 HTML
  ctx.view.register('ArticleLayout', async (context) => {
    const { post, author } = context
    // 使用协议辅助函数构建结构，再由 view 渲染
    const article = h('article', {},
      h('heading', { level: 1 }, post?.title),
      h('paragraph', { class: 'author' }, `By: ${author?.name} - ${author?.bio}`),
      h('div', { class: 'content' }, post?.content),
    )
    return ctx.view.simpleRender(article)
  })

  // 4. 编排页面：定义“文章详情页”
  // 这里展示 N:1 的聚合逻辑
  ctx.composer.define('post-detail', {
    path: '/post/hello-akari.html',
    component: 'ArticleLayout',
    wire: async (db) => {
      const post = db.get('posts', 'post-1')
      if (!post) return { }
      const author = db.get('authors', post.authorId)
      return { post, author }
    },
  })

  // 建立图谱依赖：告知系统这个页面依赖了 posts 和 authors 两张表
  ctx.composer.link('post-detail', ['posts', 'authors'])

  await ctx.start()
  console.log('🚀 Akari 2026 Engine Ready.\n')

  // 5. 模拟第一次数据同步 (数据源注入)
  console.log('--- 📥 Initial Sync ---')
  await ctx.database.sync('authors', {
    fingerprint: async () => ({ 'auth-1': 'sig-v1' }),
    loader: async () => ({ name: 'Shigma', bio: 'The creator of Cordis' }),
  })

  await ctx.database.sync('posts', {
    fingerprint: async () => ({ 'post-1': 'sig-v1' }),
    loader: async () => ({
      title: 'Hello Akari 2026',
      content: 'This is a reactive SSG.',
      authorId: 'auth-1',
    }),
  })

  // 此时 Router 应该已经写出了文件

  // 6. 模拟“增量更新”：仅仅修改作者信息
  // 验证：即使文章没变，由于页面依赖了作者，文章页也会自动重绘
  setTimeout(async () => {
    console.log('\n--- ⚡️ Incremental Update: Author changed bio ---')
    await ctx.database.sync('authors', {
      fingerprint: async () => ({ 'auth-1': 'sig-v2' }), // 指纹变了
      loader: async () => ({ name: 'Shigma', bio: 'The philosopher of architecture' }),
    })
  }, 2000)
}

bootstrap().catch(console.error)
