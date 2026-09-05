/**
 * App Builder deployments pane contract. The slot `app-builder.deployments`
 * is declared by this package's SlotMap augmentation below and registered in
 * the shell's children table (the chain take-over at root is landed, so the
 * shell is the elected root entry).
 *
 * Stream state is registrant-private: it lives in the inject `hooks`
 * compartment as a bare `HostObservable` (the standard kit's registrant-
 * private twin). The renderer binds the source into a `use<Name>` selector
 * hook; the component reads via `useSnapshot(...)`.
 */
import type { HostObservable, PropsHooks, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { AppBuilderShellService } from '../app-builder.ts'
import type { AppBuilderDeploymentsState } from '../stores.ts'

/**
 * Inject face the deployments pane receives from its register `inject`
 * factory. Plain members plus the reserved `hooks` compartment carrying
 * the bare stream source. Plain data + a single callback; no React, no
 * JSX, no whole-service object.
 */
export interface AppBuilderDeploymentsInjected {
  /**
   * Selection callback published by the shell. Calling it writes the
   * selected project id into the shell's selection store; the shell's
   * preview pane observes the same store and re-renders.
   */
  selectProject: AppBuilderShellService['selectProject']
  /**
   * Hooks compartment: bare `HostObservable` sources the renderer binds
   * into `use<Name>` selector hooks. `useSnapshot` is the deployment
   * stream state.
   */
  hooks: {
    snapshot: HostObservable<AppBuilderDeploymentsState>
  }
}

/** Component-side view of the inject hooks compartment. */
export type AppBuilderDeploymentsHooks = PropsHooks<AppBuilderDeploymentsInjected['hooks']>

/** Selector hook shape the component reads through. */
export type UseAppBuilderDeployments = SnapshotSelectorHook<AppBuilderDeploymentsState>

/**
 * Full component props for the deployments pane: runtime owner share,
 * locale seat, and the inject face (split into plain members and bound
 * hooks via the standard `InjectFace` flatten).
 */
export type AppBuilderDeploymentsComponentProps =
  & PropsRuntime<'app-builder.deployments'>
  & PropsLocale<'app-builder-deployments'>
  & {
    selectProject: AppBuilderDeploymentsInjected['selectProject']
  }
  & AppBuilderDeploymentsHooks

/**
 * Cordis Context merge: the deployments pane reads `ctx.appBuilder` from
 * the shell package. The shell is the owner of the service implementation;
 * this declaration is a consumer view restricted to the only member the
 * pane uses. TypeScript merges the two declarations, and the shell's wider
 * view (future fields) flows through untouched — we only see
 * `selectProject`.
 */
declare module '@deepseek-ai/cordis' {
  interface Context {
    appBuilder: { selectProject: AppBuilderShellService['selectProject'] }
  }
}

/** Declare the deployments slot in this package's SlotMap augmentation. */
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** App Builder deployments pane (right sidebar in the 4-pane shell). */
    'app-builder.deployments': {
      readonly kind: 'single'
      readonly scope: 'root'
      readonly owner: AppBuilderDeploymentsOwnerProps
    }
  }
}

/** Owner share: the shell passes the selected project id so the pane can filter without round-tripping. */
export interface AppBuilderDeploymentsOwnerProps {
  readonly children?: never
  readonly selectedProjectId?: string
}
