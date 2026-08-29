/**
 * App Builder projects pane contract. The slot `app-builder.projects` is
 * DECLARED by `@deepseek-ai/dsh-client-ui-app-builder-shell`; this package
 * registers into it through `ctx.slots.inject`. The owner share is
 * declared in the shell package; this contract re-asserts the four-share
 * composition rules for the projects pane without importing the shell's
 * concrete owner type (cross-package value imports are forbidden; the shell
 * augments `SlotMap` and `Context` and we resolve through those merges).
 *
 * Snapshot polling state is registrant-private: it lives in the inject
 * `hooks` compartment as a bare `HostObservable` (the standard kit's
 * registrant-private twin). The renderer binds the source into a
 * `use<Name>` selector hook; the component reads via `useSnapshot(...)`.
 */
import type { HostObservable, PropsHooks, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { AppBuilderShellService } from '../app-builder.ts'
import type { AppBuilderProjectsState } from '../stores.ts'

/**
 * Inject face the projects pane receives from its register `inject` factory.
 * Two plain members (the snapshot URL the apply closure captured, and the
 * shell's selection callback) plus the reserved `hooks` compartment carrying
 * the bare snapshot source. Plain data + a single callback; no React, no
 * JSX, no whole-service object.
 */
export interface AppBuilderProjectsInjected {
  /** Snapshot endpoint URL; the projects pane polls this on its `pollIntervalMs` cadence. */
  snapshotUrl: string
  /**
   * Selection callback published by the shell. Calling it writes the selected
   * project id into the shell's selection store; the shell's preview pane
   * observes the same store and re-renders.
   */
  selectProject: AppBuilderShellService['selectProject']
  /**
   * Hooks compartment: bare `HostObservable` sources the renderer binds into
   * `use<Name>` selector hooks. `useSnapshot` is the snapshot-polling state
   * (the latest fetch result, an error sentinel, a loading flag).
   */
  hooks: {
    snapshot: HostObservable<AppBuilderProjectsState>
  }
}

/** Component-side view of the inject hooks compartment. */
export type AppBuilderProjectsHooks = PropsHooks<AppBuilderProjectsInjected['hooks']>

/** Selector hook shape the component reads through. */
export type UseAppBuilderSnapshot = SnapshotSelectorHook<AppBuilderProjectsState>

/**
 * Full component props for the projects pane: the runtime owner share,
 * the locale seat, the inject face (split into plain members and bound
 * hooks via the standard `InjectFace` flatten), and no `PropsStore` share
 * — the polling state lives in the inject hooks compartment, not in a
 * slot-declared store.
 */
export type AppBuilderProjectsComponentProps =
  & PropsRuntime<'app-builder.projects'>
  & PropsLocale<'app-builder-projects'>
  & {
    snapshotUrl: AppBuilderProjectsInjected['snapshotUrl']
    selectProject: AppBuilderProjectsInjected['selectProject']
  }
  & AppBuilderProjectsHooks

/**
 * Cordis Context merge: the projects pane reads `ctx.appBuilder` from the
 * shell package. The shell is the owner of the service implementation; this
 * declaration is a consumer view restricted to the only member the pane uses.
 * TypeScript merges the two declarations, and the shell's wider view (future
 * fields) flows through untouched — we only see `selectProject`.
 */
declare module '@deepseek-ai/cordis' {
  interface Context {
    appBuilder: { selectProject: AppBuilderShellService['selectProject'] }
  }
}
