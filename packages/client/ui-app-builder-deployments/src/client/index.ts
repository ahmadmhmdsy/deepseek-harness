/**
 * App Builder deployments pane plugin, browser half. Registers the
 * deployments list into the host-declared `app-builder.deployments` slot
 * through `ctx.slots.inject`, then opens the deployment lifecycle event
 * stream via `ctx.remote.appBuilder.subscribeDeploymentEvents` and drives
 * a snapshot store that the renderer reads.
 *
 * Option B bypass (per session-4 handoff §2): `appBuilderApiRemote` is
 * mounted directly inside this apply closure instead of being aggregated in
 * `packages/api/remotes/src/client/index.ts`. The mount is ordered before
 * the slot registration; the slot registration does not read from
 * `ctx.remote.appBuilder` until the mount's `await` resolves. The
 * corresponding `@deepseek-ai/dsh-app-builder-api` peer+dev dependency
 * keeps the workspace import resolvable.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the locale plugin Context merge (ctx.locale) and the shell's
// appBuilder service merge (ctx.appBuilder).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-app-builder-shell/client'
// Type-only: pulls the SlotRegistry service merge (ctx.slots) the pane reads
// for chain registration into the shell-declared slot.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import appBuilderApiRemote from '@deepseek-ai/dsh-app-builder-api/remote'
import { createAppBuilderDeploymentsSnapshotStore } from './stores.ts'
import { DeploymentsList } from './DeploymentsList.tsx'
import { en, zh, type AppBuilderDeploymentsKey } from './locales.ts'
import type {
  DeploymentShape,
  SubscribeDeploymentEventsFrame,
  SubscribeDeploymentEventsRequest,
} from './snapshot.ts'

export type {
  AppBuilderDeploymentsComponentProps,
  AppBuilderDeploymentsHooks,
  AppBuilderDeploymentsInjected,
  AppBuilderDeploymentsOwnerProps,
  UseAppBuilderDeployments,
} from './contract/slots.ts'
export type { AppBuilderDeploymentsKey } from './locales.ts'
export type { AppBuilderDeploymentsState } from './stores.ts'
export type {
  DeploymentGateFindingShape,
  DeploymentGateResultShape,
  DeploymentShape,
  DeploymentStatusValue,
  DeploymentStreamEvent,
  SubscribeDeploymentEventsFrame,
  SubscribeDeploymentEventsRequest,
} from './snapshot.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** App Builder deployments pane copy (header, empty/error states, status labels). */
    'app-builder-deployments': AppBuilderDeploymentsKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'app-builder-deployments'

/** Plugin configuration: drives the deployment stream subscription. */
export interface Config {
  /** Optional projectId filter; absent means every project's deployments. */
  readonly projectId?: string
}

/** Required services (cordis fiber inject — the loader passes all module exports as an object plugin). */
export const inject = ['slots', 'locale', 'appBuilder', 'remote']

/**
 * Register the App Builder deployments pane into the host-declared
 * `app-builder.deployments` slot and drive the deployment event stream
 * effect.
 * @param ctx - Client root context.
 * @param config - Plugin configuration (see Config).
 * @returns disposer that unmounts the Remote contribution and tears down the
 *   stream effect.
 */
export async function apply(ctx: ClientContext, config: Config = {}): Promise<() => Promise<void>> {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-app-builder-deployments: dictionaries')

  // Option B bypass: mount appBuilderApiRemote inside this apply closure.
  const disposeRemote = await ctx.remote.$mount(appBuilderApiRemote)

  // One snapshot store per apply: the stream effect writes via `set` /
  // `update`, and the inject `hooks` compartment exposes the same
  // instance as a HostObservable so the component reads via the standard
  // `useSnapshot` selector hook.
  const snapshotStore = createAppBuilderDeploymentsSnapshotStore()

  const streamDisposer = ctx.effect(() => {
    const request: SubscribeDeploymentEventsRequest = config.projectId !== undefined
      ? { projectId: config.projectId }
      : {}
    const controller = new AbortController()
    const abortSignal = controller.signal
    let cancelled = false
    void consumeStream(
      () => ctx.remote.appBuilder.subscribeDeploymentEvents(request, abortSignal),
      snapshotStore,
      () => cancelled,
    )
    return () => {
      cancelled = true
      controller.abort()
    }
  }, 'ui-app-builder-deployments: stream effect')

  ctx.slots.inject('app-builder.deployments', () => ctx.slots.register({
    name: 'app-builder.deployments',
    locale: NS,
    inject: () => ({
      selectProject: (id: string) => {
        ;(ctx.appBuilder as unknown as { selectProject: (id: string) => void }).selectProject(id)
      },
      hooks: { snapshot: snapshotStore },
    }),
  }, DeploymentsList))

  return async () => {
    streamDisposer()
    await disposeRemote()
  }
}

/**
 * Pull deployment stream frames into the snapshot store. The for-await
 * loop mirrors the canonical async-generator pattern: every frame updates
 * the store; cancellation is via the AbortSignal on the underlying
 * transport.
 */
async function consumeStream(
  subscribe: () => AsyncIterable<SubscribeDeploymentEventsFrame>,
  store: ReturnType<typeof createAppBuilderDeploymentsSnapshotStore>,
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

/** Apply one frame to the snapshot store. */
function applyFrame(
  frame: SubscribeDeploymentEventsFrame,
  store: ReturnType<typeof createAppBuilderDeploymentsSnapshotStore>,
): void {
  if (frame.type === 'snapshot') {
    store.update((draft) => {
      draft.records = Object.fromEntries(frame.records.map(d => [d.id, d]))
      draft.order = frame.records.map(d => d.id)
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
  // 'event' frame: insert or replace the deployment record.
  const dep: DeploymentShape | undefined = (frame.event as { deployment?: DeploymentShape }).deployment
  if (dep === undefined) return
  store.update((draft) => {
    const records = { ...draft.records, [dep.id]: dep }
    const order = draft.order.includes(dep.id) ? draft.order : [dep.id, ...draft.order]
    draft.records = records
    draft.order = order
    draft.cursor = frame.seq
    draft.status = 'open'
    draft.lastFrameAt = Date.now()
  })
}
