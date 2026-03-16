import { Context } from 'cordis'
import { DataService } from './service.js'
import type { WebSocket } from 'ws'
import type { IncomingMessage } from 'node:http'

export class Client {
  readonly id: string = Math.random().toString(36).slice(2)

  constructor(readonly ctx: Context, public socket: WebSocket, public request?: IncomingMessage) {
    socket.on('message', this.receive)
    ctx.on('dispose', () => {
      socket.off('message', this.receive)
    })
    this.refresh()
  }

  send(payload: any) {
    this.socket.send(JSON.stringify(payload))
  }

  receive = async (data: Buffer | ArrayBuffer | Buffer[]) => {
    const { type, method, args = [], id } = JSON.parse(data.toString())
    const event = type || method
    const listener = this.ctx.get('console')?.listeners[event]
    if (!listener) {
      console.log('unknown message:', event, ...args)
      return this.send({ type: 'response', body: { id, error: 'not implemented' } })
    }

    if (await this.ctx.serial('console/intercept', this, listener)) {
      return this.send({ type: 'response', body: { id, error: 'unauthorized' } })
    }

    try {
      const value = await listener.callback.call(this, ...args)
      return this.send({ type: 'response', body: { id, value } })
    } catch (e: any) {
      console.debug(e)
      const error = e?.message || String(e)
      return this.send({ type: 'response', body: { id, error } })
    }
  }

  refresh() {
    // In pure Cordis 3, registered services are technically accessible through mapping or we can broadcast via Console
    // The easiest way is to let Console keep track of active services, or iterate over them.
    const consoleSvc = this.ctx.get('console')
    if (!consoleSvc) return
    for (const key of Object.keys(consoleSvc.services) as any[]) {
      const service = consoleSvc.services[key] as DataService
      if (!service) continue
      this.refreshService(key, service)
    }
  }

  async refreshService(key: string, service: DataService) {
    if (await this.ctx.serial('console/intercept', this, service.options)) {
      return this.send({ type: 'data', body: { key, value: null } })
    }
    try {
      const value = await service.get(false, this)
      if (!value && value !== false && value !== 0 && value !== '') return
      this.send({ type: 'data', body: { key, value } })
    } catch (error) {
      console.warn(error)
    }
  }
}
