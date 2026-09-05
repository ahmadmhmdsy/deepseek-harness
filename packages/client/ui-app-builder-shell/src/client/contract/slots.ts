/**
 * App Builder shell slot contract: declares the shell entry plus its four
 * child slots. The shell entry occupies a peer position under the existing
 * root layout via the chain take-over mechanism (see
 * `planning/inspect/21-app-builder-web-shell.md` for the integration plan).
 * The shell entry holds exclusive render authority over its declared
 * children per the slot type chain standard.
 *
 * Take-over contract: the root slot is chain-kind. This shell registers the
 * `root` entry at priority 0 (consulted first in the ascending-priority
 * election) while `enabled` is true; the classic ui-layout AppFrame is the
 * priority-1 fallback, so a disabled shell leaves the classic frame in place.
 */
import type { PropsLocale, PropsRenderSlots, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { createAppBuilderShellStore } from '../stores.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * App Builder 4-pane shell. Declared by this package; this package's
     * priority-0 `root` entry renders it, gated by the apply-time `enabled`
     * check (a disabled shell never registers, leaving the classic AppFrame
     * fallback). Empty owner: the shell owns its own layout state through the
     * selection store.
     */
    'app-builder-shell': { kind: 'chain'; scope: 'root'; owner: AppBuilderShellOwnerProps }
    /** Left pane: project list. */
    'app-builder.projects': { kind: 'single'; scope: 'root'; owner: AppBuilderProjectsOwnerProps }
    /** Center-right pane: deployments list (Phase 2.5). */
    'app-builder.deployments': { kind: 'single'; scope: 'root'; owner: AppBuilderDeploymentsOwnerProps }
    /** Right pane: preview iframe. */
    'app-builder.preview': { kind: 'single'; scope: 'root'; owner: AppBuilderPreviewOwnerProps }
    /** Center pane: chat. Session-maybe: rides the ambient session binding, empty until a session is selected. */
    'app-builder.conversation': { kind: 'single'; scope: 'session-maybe'; owner: AppBuilderConversationOwnerProps }
  }
}

/** Empty owner for the shell entry itself. */
export interface AppBuilderShellOwnerProps {
  children?: never
}

/**
 * Owner share for the projects pane: the current selection so the pane can
 * highlight the active row without round-tripping through its own store or
 * the shell's service. The pane writes selection through its inject-face
 * `selectProject` callback; the shell reads `selectedProjectId` from its own
 * selection store and passes it here on every renderSlot call.
 */
export interface AppBuilderProjectsOwnerProps {
  children?: never
  /** Currently selected project id, or undefined when no project is selected. */
  selectedProjectId?: string | undefined
}

/**
 * Owner share for the deployments pane (Phase 2.5): the shell passes the
 * selected project id so the pane can filter the list without
 * round-tripping through the deployment stream. Pane writes selection
 * through its inject-face `selectProject` callback.
 */
export interface AppBuilderDeploymentsOwnerProps {
  readonly children?: never
  /** Currently selected project id, or undefined when no project is selected. */
  readonly selectedProjectId?: string
}

/** Owner for the preview pane carries the selected project id. */
export interface AppBuilderPreviewOwnerProps {
  /** Currently selected project id, or undefined when none is selected. */
  selectedProjectId?: string
}

/** Empty owner for the conversation pane. */
export interface AppBuilderConversationOwnerProps {
  children?: never
}

/**
 * Full component props: runtime + render slots + store + locale.
 * `PropsStore<ReturnType<typeof createAppBuilderShellStore>>` derives the
 * typed `useStore` selector hook and the baked `actions` write set.
 */
export type AppBuilderShellComponentProps =
  & PropsRuntime<'app-builder-shell'>
  & PropsRenderSlots<'app-builder.projects' | 'app-builder.deployments' | 'app-builder.preview' | 'app-builder.conversation'>
  & PropsStore<ReturnType<typeof createAppBuilderShellStore>>
  & PropsLocale<'app-builder-shell'>
