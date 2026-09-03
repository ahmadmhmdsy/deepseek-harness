/**
 * The App Builder deployments pane's stream state. The state lives on a
 * runtime snapshot store (the framework's subscription engine); the apply
 * closure creates one and shares its `HostObservable` projection through
 * the slot's inject `hooks` compartment, so the component reads via the
 * standard `use<Name>` selector hook and never sees the raw engine. The
 * stream effect in apply() writes through `set`/`update`; components
 * only read.
 *
 * Immer's `update` mutates a draft that mirrors the original shape, so the
 * declared shape stays free of `readonly` markers — immer produces the
 * immutable next snapshot on commit, and the framework's snapshot-store
 * subscribe path reads it without surprises.
 */
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { DeploymentShape } from './snapshot.ts'

/** Stream state owned by the deployments pane. */
export interface AppBuilderDeploymentsState {
  /** Latest deployments keyed by id. */
  records: Record<string, DeploymentShape>
  /** Insertion-ordered deployment ids; newest first. */
  order: string[]
  /** Latest stream cursor; -1 when no snapshot has arrived yet. */
  cursor: number
  /** Last stream status. */
  status: 'connecting' | 'open' | 'closed' | 'failed'
  /** Last error message; null while the last attempt succeeded or none has run yet. */
  error: string | null
  /** Last successful frame timestamp (epoch ms); 0 until the first snapshot. */
  lastFrameAt: number
}

/** Initial empty state used by the stream store. */
const INITIAL_STATE: AppBuilderDeploymentsState = {
  records: {},
  order: [],
  cursor: -1,
  status: 'connecting',
  error: null,
  lastFrameAt: 0,
}

/**
 * Construct the stream snapshot store. The returned object is both a
 * writable engine (the apply effect uses `set` / `update`) and a
 * HostObservable (the slot's inject `hooks` compartment exposes
 * `getSnapshot` + `subscribe` directly). One instance per apply; the
 * slot entry and the stream effect share identity through this closure.
 * @returns the snapshot store; treat the return as both writable and observable.
 */
export function createAppBuilderDeploymentsSnapshotStore(): SnapshotStore<AppBuilderDeploymentsState> {
  return createSnapshotStore<AppBuilderDeploymentsState>(INITIAL_STATE)
}
