import { Context, Service } from 'cordis'

export * from 'cordis'

declare module 'cordis' {
  export interface Context {
    akari: Akari<this>
  }

  export namespace Context {
    const session: unique symbol
  }

  interface Events {
    'akari/meta'(): void
  }
}

class AkariContext extends Context {
  constructor() {
    super()
    this.set('akari', undefined)
    this.plugin(Akari)
  }
}

export { AkariContext as Context }

export class Akari<C extends Context = Context> extends Service<C> {
  public constructor(ctx: C) {
    super(ctx, 'akari')
  }
}
