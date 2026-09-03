/**
 * Deployment Remote methods for the App Builder Host BFF.
 *
 * `listDeployments` is a synchronous read of the in-memory deployment
 * registry (optionally filtered by projectId). `subscribeDeploymentEvents`
 * opens an SSE-style stream that mirrors the registry's
 * `deployment/started|succeeded|failed` events. Each yielded frame is a
 * discriminated union (snapshot / event / closed) the deployment status
 * pane consumes directly through the gateway's AsyncIterable transport.
 *
 * The async generator mirrors the canonical `sessionController.follow`
 * pattern: a buffered queue + a wakeup resolver + an AbortSignal-driven
 * close path. Listeners dispose on stream end so a signalled carrier
 * does not leak registry subscriptions.
 * @module @deepseek-ai/dsh-app-builder-api/deployments
 */

import type { Context } from '@deepseek-ai/cordis'
import type {
  Deployment,
  DeploymentStartedEvent,
  DeploymentSucceededEvent,
  DeploymentFailedEvent,
  DeploymentRegistry,
} from '@deepseek-ai/dsh-app-builder-deployment'

import type {
  DeploymentShape,
  DeploymentStreamEvent,
  ListDeploymentsRequest,
  ListDeploymentsValue,
  SubscribeDeploymentEventsFrame,
  SubscribeDeploymentEventsRequest,
} from './types.ts'

/**
 * Project a `Deployment` record to its public wire shape. The branded
 * deployment id is erased to a plain string; every nested object is
 * shallow-cloned to keep the projection free of shared mutable state.
 */
function toShape(deployment: Deployment): DeploymentShape {
  return {
    id: deployment.id,
    projectId: deployment.projectId,
    target: deployment.target,
    status: deployment.status,
    gateResults: deployment.gateResults.map(result => ({
      ...result,
      findings: result.findings.map(finding => ({ ...finding })),
    })),
    ...(deployment.url !== undefined ? { url: deployment.url } : {}),
    ...(deployment.reason !== undefined ? { reason: deployment.reason } : {}),
    createdAt: deployment.createdAt,
    updatedAt: deployment.updatedAt,
  }
}

/**
 * Look up the optional deployment registry. Throws when the deployment
 * plugin is not mounted so the gateway surfaces a stable error code to
 * the deployment status pane instead of returning an empty record.
 */
function requireDeploymentRegistry(ctx: Context): DeploymentRegistry {
  const registry = ctx.get('appBuilderDeployment') as DeploymentRegistry | undefined
  if (registry === undefined) {
    throw new Error('listDeployments / subscribeDeploymentEvents require @deepseek-ai/dsh-app-builder-deployment to be mounted')
  }
  return registry
}

/**
 * List every deployment in creation order. An optional `projectId`
 * filter restricts the result to that project's deployments. The registry
 * is process-local; a freshly booted host returns `{ deployments: [] }`.
 * @param ctx - Cordis context carrying the deployment registry.
 * @param request - optional projectId filter.
 * @returns the public value.
 */
export async function listDeploymentsRemote(
  ctx: Context,
  request: ListDeploymentsRequest,
): Promise<ListDeploymentsValue> {
  await Promise.resolve()
  const registry = requireDeploymentRegistry(ctx)
  const all = registry.list()
  const filtered = request.projectId === undefined
    ? all
    : all.filter(deployment => deployment.projectId === request.projectId)
  return { deployments: filtered.map(toShape) }
}

/**
 * Stream deployment lifecycle events as gap-free frames. Yields one
 * `snapshot` frame first (the current registry state, optionally filtered
 * by projectId), then `event` frames as new transitions land, and ends
 * with a `closed` frame when the carrier aborts the stream.
 *
 * The async generator buffers event frames into a queue; a wake-up
 * resolver allows the body to suspend until the next event lands or the
 * signal aborts. All three listeners dispose in `finally` so a signalled
 * carrier does not leak registry subscriptions.
 * @param ctx - Cordis context carrying the deployment registry + events map.
 * @param request - subscription payload (optional projectId filter).
 * @param signal - caller / transport cancellation.
 * @returns the frame iterable.
 */
export async function* subscribeDeploymentEventsRemote(
  ctx: Context,
  request: SubscribeDeploymentEventsRequest,
  signal: AbortSignal,
): AsyncIterable<SubscribeDeploymentEventsFrame> {
  const registry = requireDeploymentRegistry(ctx)
  const projectId = request.projectId
  const matchProject = (deployment: Deployment): boolean =>
    projectId === undefined || deployment.projectId === projectId
  const current = registry.list().filter(matchProject).map(toShape)
  yield { type: 'snapshot', cursor: current.length, records: current }
  signal.throwIfAborted()

  const buffered: DeploymentStreamEvent[] = []
  let wake: (() => void) | undefined
  const notify = (): void => {
    const resume = wake
    wake = undefined
    resume?.()
  }
  const follower = { closed: false }
  const disposers: Array<() => void> = []
  disposers.push(
    ctx.on('deployment/started', (event: DeploymentStartedEvent) => {
      if (!matchProject(event.deployment)) return
      buffered.push({ type: 'started', deployment: toShape(event.deployment) })
      notify()
    }),
  )
  disposers.push(
    ctx.on('deployment/succeeded', (event: DeploymentSucceededEvent) => {
      if (!matchProject(event.deployment)) return
      buffered.push({ type: 'succeeded', deployment: toShape(event.deployment) })
      notify()
    }),
  )
  disposers.push(
    ctx.on('deployment/failed', (event: DeploymentFailedEvent) => {
      if (!matchProject(event.deployment)) return
      buffered.push({ type: 'failed', deployment: toShape(event.deployment), reason: event.reason })
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
