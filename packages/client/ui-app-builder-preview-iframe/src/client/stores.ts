/**
 * The App Builder preview iframe pane's stream state. The state lives on a
 * runtime snapshot store (the framework's subscription engine); the apply
 * closure creates one and shares its `HostObservable` projection through
 * the slot's inject `hooks` compartment, so the component reads via the
 * standard `use<Name>` selector hook and never sees the raw engine.
 */
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { PreviewStreamRecord } from './snapshot.ts'

/** Stream state owned by the preview iframe pane. */
export interface AppBuilderPreviewIframeState {
  /** Latest preview records keyed by projectId. */
  records: Record<string, PreviewStreamRecord>
  /** Latest stream cursor; -1 when no snapshot has arrived yet. */
  cursor: number
  /** Last stream status. */
  status: 'connecting' | 'open' | 'closed' | 'failed'
  /** Last error message; null while the last attempt succeeded or none has run yet. */
  error: string | null
  /** Last successful frame timestamp (epoch ms); 0 until the first snapshot. */
  lastFrameAt: number
}

/** Initial empty state. */
const INITIAL_STATE: AppBuilderPreviewIframeState = {
  records: {},
  cursor: -1,
  status: 'connecting',
  error: null,
  lastFrameAt: 0,
}

/**
 * Construct the stream snapshot store.
 * @returns the snapshot store; treat the return as both writable and observable.
 */
export function createAppBuilderPreviewIframeSnapshotStore(): SnapshotStore<AppBuilderPreviewIframeState> {
  return createSnapshotStore<AppBuilderPreviewIframeState>(INITIAL_STATE)
}
