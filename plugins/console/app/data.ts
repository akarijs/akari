/**
 * app/data.ts — re-exports from the canonical client/data.ts module.
 *
 * The real implementation lives in client/data.ts so it can be shared
 * by the console shell and by sub-plugin Vue components that import
 * '@akari/console-client/data'.
 */
export * from '../client/data'
