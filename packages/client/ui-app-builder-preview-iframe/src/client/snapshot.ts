/**
 * App Builder preview iframe pane wire types. These mirror the BFF's
 * preview stream wire shape exactly. Re-declared here so the pane compiles
 * without re-importing the BFF runtime; the Remote contribution is the
 * source of truth at runtime.
 */

/** One row of preview dev-server state. */
export interface PreviewStreamRecord {
  readonly projectId: string
  readonly status: 'idle' | 'starting' | 'ready' | 'failed' | 'stopped'
  readonly framework: 'next' | 'vite' | 'unknown'
  readonly url?: string
  readonly port: number
  readonly message?: string
  readonly reason?: string
  readonly sinceMs: number
}

/** Request for the preview stream. */
export interface SubscribePreviewRequest {
  readonly projectId?: string
}

/** One dev-server transition. */
export type PreviewStreamEvent =
  | { readonly type: 'starting'; readonly record: PreviewStreamRecord }
  | { readonly type: 'ready'; readonly record: PreviewStreamRecord }
  | { readonly type: 'failed'; readonly record: PreviewStreamRecord; readonly reason: string }

/** Frame emitted by the preview stream. */
export type SubscribePreviewFrame =
  | { readonly type: 'snapshot'; readonly cursor: number; readonly records: readonly PreviewStreamRecord[] }
  | { readonly type: 'event'; readonly seq: number; readonly event: PreviewStreamEvent }
  | { readonly type: 'closed'; readonly reason: 'cancelled' | 'source-closed' }

/** Initial empty record list. */
export const EMPTY_PREVIEW_RECORDS: readonly PreviewStreamRecord[] = []
