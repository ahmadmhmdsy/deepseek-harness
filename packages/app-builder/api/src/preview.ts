/**
 * Preview Remote method for the App Builder Host BFF. Reads the snapshot
 * bridge's in-memory state (the same map the projects pane polls) and
 * returns one project's dev-server status. The bridge subscribes to the
 * preview tool's `app-builder-preview/dev-state` transitions and to
 * `project/deleted` for the in-memory `devServers` map; this method is
 * a synchronous read of that authoritative view.
 * @module @deepseek-ai/dsh-app-builder-api/preview
 */

import { TypertRemoteFailure } from '@deepseek-ai/dsh-typert-protocol'
import type { Context } from '@deepseek-ai/cordis'
import type { ProjectId } from '@deepseek-ai/dsh-app-builder-project'
import type { AppBuilderPreviewDevState } from '@deepseek-ai/dsh-app-builder-snapshot-bridge'
import type {
  GetPreviewRequest,
  GetPreviewValue,
  PreviewStreamEvent,
  PreviewStreamRecord,
  SubscribePreviewFrame,
  SubscribePreviewRequest,
} from './types.ts'

interface PreviewState {
  readonly status: 'idle' | 'starting' | 'ready' | 'failed' | 'stopped'
  readonly url?: string
  readonly port: number
  readonly message?: string
  readonly updatedAt: number
}

/**
 * Read one project's dev-server status. Returns an `idle` record when the
 * project exists but no preview has run yet; a typed `not-found` failure
 * when the project is unknown to the registry.
 * @param ctx - Cordis context carrying the snapshot bridge.
 * @param request - lookup payload.
 * @returns the public preview shape.
 */
export async function getPreviewRemote(
  ctx: Context,
  request: GetPreviewRequest,
): Promise<GetPreviewValue> {
  await Promise.resolve()
  const id = request.projectId as ProjectId
  const project = ctx.appBuilderProjects.get(id)
  if (project === undefined) {
    throw new TypertRemoteFailure({
      code: 'not-found',
      message: `getPreview: no project with id ${String(id)}`,
      details: { projectId: id },
    })
  }
  const bridge = ctx.get('appBuilderSnapshotBridge') as
    | { snapshot(): { devServers: Readonly<Record<string, PreviewState>> } }
    | undefined
  if (bridge === undefined) {
    // The bridge is optional: a deployment that omits it has no preview
    // state to report. Return a neutral 'unknown' record instead of
    // failing so the API surface stays uniform.
    return { projectId: id, status: 'unknown', port: -1, updatedAt: 0 }
  }
  const entry = bridge.snapshot().devServers[id]
  if (entry === undefined) {
    return { projectId: id, status: 'idle', port: -1, updatedAt: 0 }
  }
  return {
    projectId: id,
    status: entry.status,
    ...(entry.url !== undefined ? { url: entry.url } : {}),
    port: entry.port,
    ...(entry.message !== undefined ? { message: entry.message } : {}),
    updatedAt: entry.updatedAt,
  }
}

/**
 * Shape of a single bridge entry the stream snapshot is projected from.
 * Defined locally to avoid coupling to the snapshot-bridge package internals.
 */
interface PreviewBridgeEntry {
  readonly status: PreviewState['status']
  readonly url?: string
  readonly port: number
  readonly message?: string
  readonly updatedAt: number
}

/**
 * Snapshot-bridge accessor the stream reads for its opening frame.
 * Narrower than the real type so the BFF stays a soft-dep on the bridge.
 */
interface PreviewBridgeAccessor {
  snapshot(): { devServers: Readonly<Record<string, PreviewBridgeEntry>> }
}

/**
 * Project a snapshot-bridge entry into the public `PreviewStreamRecord` shape.
 * The bridge omits the framework; the stream records carry it so the preview
 * pane can render the framework tag without a follow-up RPC.
 * @param projectId - the project id the bridge keyed the entry under.
 * @param entry - the bridge row (omitted when no preview has run).
 * @returns the public record.
 */
function bridgeEntryToRecord(
  projectId: string,
  entry: PreviewBridgeEntry,
): PreviewStreamRecord {
  return {
    projectId,
    status: entry.status,
    framework: 'unknown',
    port: entry.port,
    sinceMs: entry.updatedAt,
    ...(entry.url !== undefined ? { url: entry.url } : {}),
    ...(entry.message !== undefined ? { message: entry.message } : {}),
  }
}

/**
 * Project a preview-tool dev-state event into a `PreviewStreamRecord`. The
 * `rootPath → projectId` resolution happens at the call site so the stream
 * can filter by `projectId` before the projection.
 * @param projectId - the resolved project id for the event.
 * @param state - the dev-state event payload.
 * @returns the public record.
 */
function devStateToRecord(projectId: string, state: AppBuilderPreviewDevState): PreviewStreamRecord {
  return {
    projectId,
    status: state.status,
    framework: state.framework,
    port: state.port ?? -1,
    sinceMs: state.sinceMs,
    ...(state.url !== undefined ? { url: state.url } : {}),
    ...(state.message !== undefined ? { message: state.message } : {}),
    ...(state.reason !== undefined ? { reason: state.reason } : {}),
  }
}

/**
 * Read the optional snapshot-bridge accessor. The bridge is mounted by the
 * snapshot-bridge plugin; a deployment that omits it can still mount the
 * BFF, in which case the snapshot frame is empty.
 * @param ctx - Cordis context.
 * @returns the bridge accessor or undefined.
 */
function readBridge(ctx: Context): PreviewBridgeAccessor | undefined {
  return ctx.get('appBuilderSnapshotBridge') as PreviewBridgeAccessor | undefined
}

/**
 * Resolve the `rootPath` of an incoming dev-state event to a project id via
 * the project registry. A dev-state event whose `rootPath` does not match
 * any registered project is dropped — the preview tool may run against a
 * hand-built directory outside the App Builder composition.
 * @param ctx - Cordis context carrying the project registry.
 * @param rootPath - the canonical root path the dev server runs in.
 * @returns the project id, or undefined when no project owns the root.
 */
function projectIdForRootPath(ctx: Context, rootPath: string): string | undefined {
  for (const project of ctx.appBuilderProjects.list()) {
    if (project.rootPath === rootPath) return project.id
  }
  return undefined
}

/**
 * Stream preview dev-server transitions as gap-free frames. Yields one
 * `snapshot` frame first (the bridge's current `devServers` map, filtered
 * by `projectId` when requested), then `event` frames as new transitions
 * land, and ends with a `closed` frame when the carrier aborts the stream.
 *
 * The async generator mirrors the canonical `sessionController.follow`
 * pattern: a buffered queue + a wake-up resolver + an AbortSignal-driven
 * close path. The single listener disposes in `finally` so a signalled
 * carrier does not leak the dev-state subscription.
 *
 * A missing snapshot bridge yields an empty snapshot frame; the carrier
 * still receives transitions that land while the stream is open. A
 * `projectId` filter restricts both the snapshot and the events to the
 * matching project.
 * @param ctx - Cordis context carrying the project registry + bridge.
 * @param request - subscription payload (optional projectId filter).
 * @param signal - caller / transport cancellation.
 * @returns the frame iterable.
 */
export async function* subscribePreviewRemote(
  ctx: Context,
  request: SubscribePreviewRequest,
  signal: AbortSignal,
): AsyncIterable<SubscribePreviewFrame> {
  const filter = request.projectId
  const matchProject = (projectId: string): boolean => filter === undefined || projectId === filter

  const bridge = readBridge(ctx)
  const snapshot: PreviewStreamRecord[] = []
  if (bridge !== undefined) {
    for (const [projectId, entry] of Object.entries(bridge.snapshot().devServers)) {
      if (!matchProject(projectId)) continue
      snapshot.push(bridgeEntryToRecord(projectId, entry))
    }
  }
  yield { type: 'snapshot', cursor: snapshot.length, records: snapshot }
  signal.throwIfAborted()

  const buffered: PreviewStreamEvent[] = []
  let wake: (() => void) | undefined
  const notify = (): void => {
    const resume = wake
    wake = undefined
    resume?.()
  }
  const follower = { closed: false }
  const disposers: Array<() => void> = []
  disposers.push(
    ctx.on('app-builder-preview/dev-state', (state: AppBuilderPreviewDevState) => {
      const projectId = projectIdForRootPath(ctx, state.rootPath)
      if (projectId === undefined) return
      if (!matchProject(projectId)) return
      const record = devStateToRecord(projectId, state)
      if (state.status === 'starting') {
        buffered.push({ type: 'starting', record })
      } else if (state.status === 'ready') {
        buffered.push({ type: 'ready', record })
      } else if (state.status === 'failed') {
        buffered.push({ type: 'failed', record, reason: state.reason ?? 'dev server failed' })
      } else {
        // 'idle' and 'stopped' are bridge-only states; the preview tool
        // never emits them. Drop them so the carrier never sees a frame
        // shape outside the typed vocabulary.
        return
      }
      notify()
    }),
  )
  const onAbort = (): void => {
    follower.closed = true
    notify()
  }
  signal.addEventListener('abort', onAbort, { once: true })
  let seq = 0
  try {
    while (!follower.closed && !signal.aborted) {
      const item = buffered.shift()
      if (item === undefined) {
        await new Promise<void>((resolve) => { wake = resolve })
        continue
      }
      seq += 1
      yield { type: 'event', seq, event: item }
    }
  } finally {
    signal.removeEventListener('abort', onAbort)
    for (const dispose of disposers) dispose()
  }
  yield { type: 'closed', reason: signal.aborted || follower.closed ? 'cancelled' : 'source-closed' }
}
