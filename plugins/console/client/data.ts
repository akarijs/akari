/**
 * @akari/console-client/data
 *
 * Shared WebSocket client — used by both the console shell (app/data.ts)
 * and sub-plugin Vue components that import from '@akari/console-client/data'.
 *
 * Extracted from app/data.ts so it can be compiled into the client bundle
 * and re-used without duplicating the connection logic.
 */

import { reactive, ref } from 'vue'

export interface EntryData {
  /** Browser-accessible URLs to load (JS and CSS files) */
  files: string[]
  /** Optional plugin data forwarded from addEntry() */
  data?: any
}

export type EntryRecord = Record<string, EntryData>

/** Reactive store — updated via 'data' / 'patch' server events */
export const store = reactive<Record<string, any>>({})

/** Whether the WebSocket connection is currently open */
export const connected = ref(false)

// ---------------------------------------------------------------------------
// Internal plumbing
// ---------------------------------------------------------------------------

type Listener = (data: any) => void
const listeners: Record<string, Listener> = {}
const responseHooks: Record<string, [(v: any) => void, (e: Error) => void]> = {}
let _ws: WebSocket | null = null

// Built-in message handlers (Koishi-style)
function registerBuiltins() {
  receive<{ key: string; value: any }>('data', ({ key, value }) => {
    store[key] = value
  })

  receive<{ key: string; value: any }>('patch', ({ key, value }) => {
    if (store[key] && typeof store[key] === 'object' && !Array.isArray(store[key])) {
      Object.assign(store[key], value)
    } else {
      store[key] = value
    }
  })

  receive<{ id: string; value?: any; error?: { message: string } }>('response', ({ id, value, error }) => {
    const hooks = responseHooks[id]
    if (!hooks) return
    delete responseHooks[id]
    if (error) hooks[1](new Error(error.message || 'RPC error'))
    else hooks[0](value)
  })
}

registerBuiltins()

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Register a handler for a named server-push event. */
export function receive<T = any>(type: string, listener: (data: T) => void): void {
  listeners[type] = listener as Listener
}

/** Send an RPC call to the server. Returns a Promise for the result. */
export function send(method: string, ...args: any[]): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!_ws || _ws.readyState !== WebSocket.OPEN) {
      reject(new Error('WebSocket not connected'))
      return
    }
    const id = Math.random().toString(36).slice(2, 9)
    responseHooks[id] = [resolve, reject]
    setTimeout(() => {
      if (!responseHooks[id]) return
      delete responseHooks[id]
      reject(new Error(`RPC timeout: ${method}`))
    }, 30_000)
    _ws.send(JSON.stringify({ id, type: method, method, args }))
  })
}

/** Connect to the server WebSocket with auto-reconnect. */
export function connect(endpointUrl: string): void {
  function tryConnect() {
    const wsUrl = endpointUrl.replace(/^http/, 'ws')
    const ws = new WebSocket(wsUrl)
    _ws = ws

    ws.onopen = () => {
      connected.value = true
    }

    ws.onmessage = (event: MessageEvent) => {
      try {
        const parsed = JSON.parse(event.data as string)
        const type = parsed.type
        const payload = parsed.body !== undefined ? parsed.body : parsed.data
        listeners[type]?.(payload)
      } catch {
        // ignore malformed frames
      }
    }

    ws.onerror = () => {
      // will be followed by onclose
    }

    ws.onclose = () => {
      connected.value = false
      _ws = null
      // Reconnect after 3 seconds
      setTimeout(tryConnect, 3_000)
    }
  }

  tryConnect()
}
