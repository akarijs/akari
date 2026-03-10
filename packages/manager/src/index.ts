import { Context, Service } from 'cordis'
import SQLite from '@minatojs/driver-sqlite'
import { } from '@akarijs/datasource'
import { AkariSchema } from './types'

export class ManagerService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'manager', true)
  }

  static inject = ['datasource']

  protected async init() {
    // 1. 初始化系统库（户口本）
    const datasource = this.ctx.datasource
    datasource.registerDriver('sqlite', SQLite)

    await datasource.connect('system', 'sqlite', {
      path: './.akari/system.db',
    })

    const system = datasource.use<AkariSchema>('system')

    // 2. 定义元数据表
    // 记录：{ id: 'src1', name: 'docs', driver: 'markdown', config: { path: './content' } }
    system.extend('akari_sources', {
      id: 'string',
      name: 'string',
      driver: 'string',
      config: 'json',
    }, { primary: 'id' })

    system.extend('akari_sites', {
      id: 'string',
      name: 'string',
      outDir: 'string',
      template: 'string',
    }, { primary: 'id' })

    // 3. 自动激活所有配置的数据源
    this.ctx.on('ready', async () => {
      const sources = await system.get('akari_sources', {})
      for (const src of sources) {
        await datasource.connect(src.name, src.driver, src.config)
      }
    })
  }
}
