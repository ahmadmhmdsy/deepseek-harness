/**
 * App Builder preview iframe pane plugin, browser half. Registers into the
 * host-declared `app-builder.preview` slot through `ctx.slots.inject`, then
 * opens the preview lifecycle event stream via
 * `ctx.remote.appBuilder.subscribePreview` and drives a snapshot store that
 * the renderer reads.
 *
 * Option B bypass (per session-4 handoff §2): `appBuilderApiRemote` is
 * mounted directly inside this apply closure instead of being aggregated in
 * `packages/api/remotes/src/client/index.ts`. The mount is ordered before
 * the slot registration.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-app-builder-shell/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import appBuilderApiRemote from '@deepseek-ai/dsh-app-builder-api/remote'
import { createAppBuilderPreviewIframeSnapshotStore } from './stores.ts'
import { PreviewIframe } from './PreviewIframe.tsx'
import { en, zh, type AppBuilderPreviewIframeKey } from './locales.ts'
import type {
  PreviewStreamRecord,
  SubscribePreviewFrame,
  SubscribePreviewRequest,
} from './snapshot.ts'

export type {
  AppBuilderPreviewIframeComponentProps,
  AppBuilderPreviewIframeHooks,
  AppBuilderPreviewIframeInjected,
  UseAppBuilderPreviewIframe,
} from './contract/slots.ts'
export type { AppBuilderPreviewIframeKey } from './locales.ts'
export type { AppBuilderPreviewIframeState } from './stores.ts'
export type {
  PreviewStreamEvent,
  PreviewStreamRecord,
  SubscribePreviewFrame,
  SubscribePreviewRequest,
} from './snapshot.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** App Builder preview iframe pane copy (header, status labels, iframe aria). */
    'app-builder-preview-iframe': AppBuilderPreviewIframeKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'app-builder-preview-iframe'

/** Plugin configuration: drives the preview stream subscription. */
export interface Config {
  /** Optional projectId filter; absent means every project's preview records. */
  readonly projectId?: string
}

/** Required services (cordis fiber inject — the loader passes all module exports as an object plugin). */
export const inject = ['slots', 'locale', 'remote']

/**
 * Register the App Builder preview iframe pane.
 * @param ctx - Client root context.
 * @param config - Plugin configuration (see Config).
 * @returns disposer that unmounts the Remote contribution and tears down the
 *   stream effect.
 */
export async function apply(ctx: ClientContext, config: Config = {}): Promise<() => Promise<void>> {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-app-builder-preview-iframe: dictionaries')

  // Option B bypass: mount appBuilderApiRemote inside this apply closure.
  const disposeRemote = await ctx.remote.$mount(appBuilderApiRemote)

  const snapshotStore = createAppBuilderPreviewIframeSnapshotStore()

  const streamDisposer = ctx.effect(() => {
    const request: SubscribePreviewRequest = config.projectId !== undefined
      ? { projectId: config.projectId }
      : {}
    const controller = new AbortController()
    const abortSignal = controller.signal
    let cancelled = false
    void consumeStream(
      () => ctx.remote.appBuilder.subscribePreview(request, abortSignal),
      snapshotStore,
      () => cancelled,
    )
    return () => {
      cancelled = true
      controller.abort()
    }
  }, 'ui-app-builder-preview-iframe: stream effect')

  ctx.slots.inject('app-builder.preview', () => ctx.slots.register({
    name: 'app-builder.preview',
    locale: NS,
    inject: () => ({
      hooks: { snapshot: snapshotStore },
    }),
  }, PreviewIframe))

  return async () => {
    streamDisposer()
    await disposeRemote()
  }
}

async function consumeStream(
  subscribe: () => AsyncIterable<SubscribePreviewFrame>,
  store: ReturnType<typeof createAppBuilderPreviewIframeSnapshotStore>,
  isCancelled: () => boolean,
): Promise<void> {
  store.set({ ...store.getSnapshot(), status: 'connecting', error: null })
  try {
    for await (const frame of subscribe()) {
      if (isCancelled()) return
      applyFrame(frame, store)
    }
    if (!isCancelled()) {
      store.update((draft) => { draft.status = 'closed' })
    }
  } catch (reason: unknown) {
    if (isCancelled()) return
    const message = reason instanceof Error ? reason.message : String(reason)
    store.update((draft) => { draft.status = 'failed'; draft.error = message })
  }
}

function applyFrame(
  frame: SubscribePreviewFrame,
  store: ReturnType<typeof createAppBuilderPreviewIframeSnapshotStore>,
): void {
  if (frame.type === 'snapshot') {
    store.update((draft) => {
      draft.records = Object.fromEntries(frame.records.map(r => [r.projectId, r]))
      draft.cursor = frame.cursor
      draft.status = 'open'
      draft.error = null
      draft.lastFrameAt = Date.now()
    })
    return
  }
  if (frame.type === 'closed') {
    store.update((draft) => {
      draft.status = 'closed'
      if (frame.reason === 'cancelled') draft.error = 'stream_cancelled'
    })
    return
  }
  // 'event' frame: insert or replace the record keyed by projectId.
  const rec: PreviewStreamRecord | undefined = (frame.event as { record?: PreviewStreamRecord }).record
  if (rec === undefined) return
  store.update((draft) => {
    draft.records = { ...draft.records, [rec.projectId]: rec }
    draft.cursor = frame.seq
    draft.status = 'open'
    draft.lastFrameAt = Date.now()
  })
}
