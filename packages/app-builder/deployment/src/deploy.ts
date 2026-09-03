/**
 * Deployment workflow orchestration for the App Builder.
 *
 * The deployment workflow runs three deterministic gates (SAST / SCA /
 * secrets) over the project's source tree, requests approval through
 * `ctx.approval` (when mounted), and on approval performs the push step.
 * Every transition emits one durable event (`deployment/started`,
 * `deployment/succeeded`, `deployment/failed`); the `DeploymentRegistry`
 * holds the latest in-memory record keyed by deployment id.
 *
 * Phase 2.1 keeps the push step a deterministic in-process hook that
 * resolves a synthetic `https://deploy.local/<projectId>/<deploymentId>`
 * URL. A Phase 2.5 follow-up replaces this with the production push
 * implementation (likely a Remote hook into `@deepseek-ai/dsh-webhook`
 * or a configured git remote).
 *
 * @module @deepseek-ai/dsh-app-builder-deployment/deploy
 */

import type { Context } from '@deepseek-ai/cordis'

import { runAllGates } from './gates.ts'
import type {
  Deployment,
  DeploymentFailedEvent,
  DeploymentRequest,
  DeploymentStartedEvent,
  DeploymentSucceededEvent,
  GateResult,
} from './types.ts'

/** The synthetic host the local deploy step resolves its URL against. */
const LOCAL_DEPLOY_HOST = 'https://deploy.local'

/** Approval-outcome vocabulary recognised by the deployment workflow. */
type ApprovalOutcome = 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable'

/** The narrow contract the workflow needs from `ctx.approval`. */
interface ApprovalAccessor {
  request(req: { toolName: string; reason?: string }): Promise<ApprovalOutcome> | ApprovalOutcome
}

/**
 * Resolve the synthetic deploy URL for the local target. The deterministic
 * shape (`https://deploy.local/<projectId>/<deploymentId>`) is intentional:
 * snapshot tests assert against this exact URL.
 */
function localDeployUrl(projectId: string, deploymentId: string): string {
  return LOCAL_DEPLOY_HOST + '/' + projectId + '/' + deploymentId
}

/**
 * Read `ctx.approval` through `ctx.get` so an unmounted approval service
 * is `undefined` rather than a hard property-access throw. Returns the
 * accessor narrowed to the shape the workflow actually consumes.
 */
function readApproval(ctx: Context): ApprovalAccessor | undefined {
  const candidate = ctx.get('approval') as unknown
  if (candidate === undefined || candidate === null) return undefined
  if (typeof (candidate as { request?: unknown }).request !== 'function') return undefined
  return candidate as ApprovalAccessor
}

/**
 * Append a status transition to a deployment record. Returns a fresh
 * record so the durable event log carries the post-transition state.
 */
function transition(
  current: Deployment,
  status: Deployment['status'],
  patch: { readonly gateResults?: readonly GateResult[]; readonly url?: string; readonly reason?: string } = {},
): Deployment {
  const next: Deployment = {
    ...current,
    status,
    updatedAt: new Date().toISOString(),
    ...(patch.gateResults !== undefined ? { gateResults: patch.gateResults } : {}),
    ...(patch.url !== undefined ? { url: patch.url } : {}),
    ...(patch.reason !== undefined ? { reason: patch.reason } : {}),
  }
  return next
}

/**
 * Execute the full deployment workflow for one project.
 *
 *  1. Build the initial record (`status: 'pending'`).
 *  2. Run all three gates; the record transitions through
 *     `gates-running` -> `gates-failed` (short-circuit) or `awaiting-approval`.
 *  3. Request approval. The approval service is read via `ctx.get` so a
 *     missing service is a configured-no-op (the registry falls back to
 *     the `requireApproval` config field: when `false`, the workflow
 *     proceeds straight to the push step).
 *  4. On approval, perform the push and emit `deployment/succeeded`.
 *  5. On rejection or any thrown error, emit `deployment/failed` with the
 *     reason.
 *
 * The function never throws; every error path emits `deployment/failed`
 * and returns a record with `status === 'failed'`. The Typert Remote
 * caller in `packages/app-builder/api` consumes the returned record.
 *
 * @param ctx - Cordis context carrying `appBuilderProjects` + `logger` +
 *   the optional `approval` service.
 * @param deps - Resolved project root + registry handle. The registry is
 *   passed in so the workflow stays a pure function over its inputs.
 * @param request - Deployment request payload (projectId + optional target).
 * @param options - Workflow config (requireApproval, denyList, host).
 * @returns the final deployment record (one of `succeeded`, `failed`,
 *   `rejected`).
 */
export async function runDeployment(
  ctx: Context,
  deps: {
    readonly registry: { get(id: string): { rootPath: string } | undefined }
    readonly createDeploymentId: () => string
    readonly now: () => string
  },
  request: DeploymentRequest,
  options: { readonly requireApproval?: boolean; readonly denyList?: ReadonlySet<string>; readonly host?: string } = {},
): Promise<Deployment> {
  const target = request.target ?? 'local'
  const id = deps.createDeploymentId() as Deployment['id']
  const project = deps.registry.get(request.projectId)
  if (project === undefined) {
    const reason = 'project ' + request.projectId + ' is not registered'
    const failed: Deployment = {
      id,
      projectId: request.projectId,
      target,
      status: 'failed',
      gateResults: [],
      reason,
      createdAt: deps.now(),
      updatedAt: deps.now(),
    }
    const event: DeploymentFailedEvent = { type: 'deployment/failed', deployment: failed, reason }
    ctx.emit('deployment/failed', event)
    return failed
  }
  const started = deps.now()
  let record: Deployment = {
    id,
    projectId: request.projectId,
    target,
    status: 'pending',
    gateResults: [],
    createdAt: started,
    updatedAt: started,
  }
  ctx.emit('deployment/started', { type: 'deployment/started', deployment: record } satisfies DeploymentStartedEvent)

  record = transition(record, 'gates-running')
  let gateResults: readonly GateResult[] = []
  try {
    gateResults = await runAllGates(project.rootPath, options.denyList !== undefined ? { denyList: options.denyList } : {})
  } catch (error) {
    const reason = 'gate runner threw: ' + (error instanceof Error ? error.message : String(error))
    const failed = transition(record, 'failed', { reason })
    ctx.emit('deployment/failed', { type: 'deployment/failed', deployment: failed, reason } satisfies DeploymentFailedEvent)
    return failed
  }
  record = transition(record, 'gates-running', { gateResults })
  const failedGate = gateResults.find(r => !r.passed)
  if (failedGate !== undefined) {
    const reason = failedGate.kind + ' gate reported an error-severity finding'
    const failed = transition(record, 'gates-failed', { gateResults, reason })
    ctx.emit('deployment/failed', { type: 'deployment/failed', deployment: failed, reason } satisfies DeploymentFailedEvent)
    return failed
  }

  if (options.requireApproval === true) {
    const approval = readApproval(ctx)
    if (approval !== undefined) {
      record = transition(record, 'awaiting-approval', { gateResults })
      let outcome: ApprovalOutcome
      try {
        outcome = await approval.request({ toolName: 'deploy', reason: 'Push ' + project.rootPath + ' to ' + target })
      } catch (error) {
        const reason = 'approval request threw: ' + (error instanceof Error ? error.message : String(error))
        const failed = transition(record, 'failed', { gateResults, reason })
        ctx.emit('deployment/failed', { type: 'deployment/failed', deployment: failed, reason } satisfies DeploymentFailedEvent)
        return failed
      }
      if (outcome !== 'allowed-once') {
        const reason = 'approval outcome: ' + outcome
        const rejected = transition(record, 'rejected', { gateResults, reason })
        ctx.emit('deployment/failed', { type: 'deployment/failed', deployment: rejected, reason } satisfies DeploymentFailedEvent)
        return rejected
      }
    }
  }

  record = transition(record, 'pushing', { gateResults })
  try {
    const url = localDeployUrl(request.projectId, id)
    record = transition(record, 'succeeded', { gateResults, url })
    ctx.emit('deployment/succeeded', { type: 'deployment/succeeded', deployment: record } satisfies DeploymentSucceededEvent)
    return record
  } catch (error) {
    const reason = 'push step threw: ' + (error instanceof Error ? error.message : String(error))
    const failed = transition(record, 'failed', { gateResults, reason })
    ctx.emit('deployment/failed', { type: 'deployment/failed', deployment: failed, reason } satisfies DeploymentFailedEvent)
    return failed
  }
}
