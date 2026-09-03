/**
 * App Builder deployments pane wire types. These mirror the
 * `@deepseek-ai/dsh-app-builder-api` Host BFF's deployment stream wire
 * shape exactly (the artifacts under `@deepseek-ai/dsh-app-builder-api/types`).
 * Re-declared here so the pane compiles without re-importing the BFF's
 * runtime path; the BFF Remote contribution is the source of truth at
 * runtime.
 */
import type { DeploymentStatus } from '@deepseek-ai/dsh-app-builder-api/types'

/** Status a deployment is currently in. */
export type DeploymentStatusValue = DeploymentStatus

/** JSON-safe gate-finding projection. */
export interface DeploymentGateFindingShape {
  readonly kind: string
  readonly severity: string
  readonly message: string
  readonly file?: string
  readonly line?: number
}

/** JSON-safe per-gate result projection. */
export interface DeploymentGateResultShape {
  readonly kind: string
  readonly passed: boolean
  readonly findings: readonly DeploymentGateFindingShape[]
  readonly durationMs: number
}

/** JSON-safe projection of a deployment record. */
export interface DeploymentShape {
  readonly id: string
  readonly projectId: string
  readonly target: string
  readonly status: DeploymentStatusValue
  readonly gateResults: readonly DeploymentGateResultShape[]
  readonly url?: string
  readonly reason?: string
  readonly createdAt: string
  readonly updatedAt: string
}

/** Request for the deployment stream. */
export interface SubscribeDeploymentEventsRequest {
  readonly projectId?: string
}

/** One lifecycle transition the deployment stream surfaces. */
export type DeploymentStreamEvent =
  | { readonly type: 'started'; readonly deployment: DeploymentShape }
  | { readonly type: 'succeeded'; readonly deployment: DeploymentShape }
  | { readonly type: 'failed'; readonly deployment: DeploymentShape; readonly reason: string }

/** Frame emitted by the deployment stream. */
export type SubscribeDeploymentEventsFrame =
  | { readonly type: 'snapshot'; readonly cursor: number; readonly records: readonly DeploymentShape[] }
  | { readonly type: 'event'; readonly seq: number; readonly event: DeploymentStreamEvent }
  | { readonly type: 'closed'; readonly reason: 'cancelled' | 'source-closed' }
