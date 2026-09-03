/**
 * App Builder preview iframe pane contract. The slot `app-builder.preview`
 * is declared by the shell package; this pane registers into it through
 * `ctx.slots.inject`. The owner share is declared in the shell package;
 * this contract re-asserts the four-share composition rules for the preview
 * pane without importing the shell's concrete owner type.
 */
import type { HostObservable, PropsHooks, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { AppBuilderPreviewIframeState } from '../stores.ts'

/**
 * Inject face: the hooks compartment carries the bare stream source. The
 * component reads via the standard `use<Name>` selector hook.
 */
export interface AppBuilderPreviewIframeInjected {
  /** Hooks compartment: bare `HostObservable` sources the renderer binds into `use<Name>` selector hooks. */
  hooks: {
    snapshot: HostObservable<AppBuilderPreviewIframeState>
  }
}

/** Component-side view of the inject hooks compartment. */
export type AppBuilderPreviewIframeHooks = PropsHooks<AppBuilderPreviewIframeInjected['hooks']>

/** Selector hook shape the component reads through. */
export type UseAppBuilderPreviewIframe = SnapshotSelectorHook<AppBuilderPreviewIframeState>

/**
 * Full component props for the preview iframe pane: the runtime owner share
 * (carries selectedProjectId), the locale seat, and the inject face (bound
 * hooks). No PropsStore share: state lives in the inject hooks compartment.
 */
export type AppBuilderPreviewIframeComponentProps =
  & PropsRuntime<'app-builder.preview'>
  & PropsLocale<'app-builder-preview-iframe'>
  & AppBuilderPreviewIframeHooks
