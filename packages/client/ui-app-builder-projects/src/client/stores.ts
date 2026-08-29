/**
 * The App Builder projects pane's snapshot polling state. The state lives
 * on a runtime snapshot store (the framework's subscription engine); the
 * apply closure creates one and shares its `HostObservable` projection
 * through the slot's inject `hooks` compartment, so the component reads
 * via the standard `use<Name>` selector hook and never sees the raw
 * engine. The polling effect in apply() writes through `set`/`update`;
 * components only read.
 */
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { EMPTY_SNAPSHOT, type AppBuilderSnapshot } from './snapshot.ts'

/** Snapshot polling state owned by the projects pane. */
export interface AppBuilderProjectsState {
  /** Last received snapshot; the initial empty sentinel until the first poll succeeds. */
  snapshot: AppBuilderSnapshot
  /** Last fetch error message; null while the last attempt succeeded or none has run yet. */
  error: string | null
  /** Last successful poll timestamp (epoch ms); 0 until the first success. */
  lastSuccessAt: number
  /** True while a poll attempt is in flight. */
  loading: boolean
}

/** Initial empty state used by the polling store. */
const INITIAL_STATE: AppBuilderProjectsState = {
  snapshot: EMPTY_SNAPSHOT,
  error: null,
  lastSuccessAt: 0,
  loading: false,
}

/**
 * Construct the polling snapshot store. The returned object is both a
 * writable engine (the polling effect uses `set` / `update`) and a
 * HostObservable (the slot's inject `hooks` compartment exposes `getSnapshot`
 * + `subscribe` directly). One instance per apply; the slot entry and the
 * polling effect share identity through this closure.
 * @returns the snapshot store; treat the return as both writable and observable.
 */
export function createAppBuilderProjectsSnapshotStore(): SnapshotStore<AppBuilderProjectsState> {
  return createSnapshotStore<AppBuilderProjectsState>(INITIAL_STATE)
}
