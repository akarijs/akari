import { Context, Service } from 'cordis'
import { Database, Driver } from 'minato'

declare module 'cordis' {
  interface Context {
    datasource: DatasourceService
  }
}

export class DatasourceService extends Service {
  // 存储所有命名的 Minato 实例
  private _instances = new Map<string, Database>()
  // 存储所有可用的驱动构造器
  private _drivers = new Map<string, Driver.Constructor<any>>()

  constructor(ctx: Context) {
    super(ctx, 'datasource', true)
  }

  /**
   * 注册驱动（例如 Markdown 驱动、YAML 驱动）
   */
  public registerDriver(name: string, driver: Driver.Constructor<any>) {
    this._drivers.set(name, driver)
    this.ctx.logger('datasource').debug(`Driver registered: ${name}`)
  }

  /**
   * 激活并获取一个数据源实例
   */
  public use(name: string = 'system'): Database {
    if (!this._instances.has(name)) {
      this._instances.set(name, new Database())
    }
    return this._instances.get(name)!
  }

  /**
   * 核心方法：根据配置连接数据源
   * 无论它是真实的 DB 还是文件驱动
   */
  public async connect(name: string, driverName: string, options: any) {
    const db = this.use(name)
    const Driver = this._drivers.get(driverName)

    if (!Driver) {
      throw new Error(`Driver [${driverName}] not found. Did you install the plugin?`)
    }

    try {
      await db.connect(Driver, options)
      this.ctx.logger('datasource').info(`Source [${name}] connected via ${driverName}`)
    } catch (err: any) {
      this.ctx.logger('datasource').error(`Connection failed [${name}]: ${err.message}`)
      throw err
    }
  }

  protected async stop() {
    for (const db of this._instances.values()) {
      await db.stopAll()
    }
  }
}
