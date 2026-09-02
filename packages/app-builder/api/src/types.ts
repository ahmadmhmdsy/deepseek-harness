/**
 * Type-only surface for the App Builder Host BFF Typert Remote.
 *
 * Every Remote method exposes one `Request` and one `Value` shape; the
 * value is what the gateway returns over the wire, the request is what it
 * accepts from the client. The 13-method surface mirrors the methods listed
 * in `planning/Phase 2 prompt.md §3`. Two methods (`deploy`, `getUsage`)
 * are deferred until Phase 2 ships their backing packages; their request and
 * value types are still published so callers can wire them today.
 * @module @deepseek-ai/dsh-app-builder-api/types
 */

import type { SessionHeader } from '@deepseek-ai/dsh-session'
import type { SessionHistoryRecord, SessionWireEvent } from '@deepseek-ai/dsh-api-session-controller'
import type { ProjectStack } from '@deepseek-ai/dsh-app-builder-project'
import type { DeploymentStatus, GateFindingSeverity, GateKind } from '@deepseek-ai/dsh-app-builder-deployment'

/**
 * JSON-safe projection of the in-memory `Project` record. `ProjectId` is a
 * branded string at compile time; over the wire it travels as a plain string
 * (the runtime type is `string`).
 */
export interface ProjectShape {
  readonly id: string
  readonly name: string
  readonly rootPath: string
  readonly stack: ProjectStack
  readonly gitUrl: string | null
  readonly dshProfile: string
  /** ISO-8601 timestamp. */
  readonly createdAt: string
}

// ---- Project CRUD ----

/** Empty request — lists every durable project the host has registered. */
export interface ListProjectsRequest {
  readonly type?: never
}

/** Value returned from `listProjects`. */
export interface ListProjectsValue {
  readonly projects: readonly ProjectShape[]
}

/** Request for `createProject`. */
export interface CreateProjectRequest {
  readonly name: string
  readonly rootPath: string
  readonly stack: ProjectStack
  readonly gitUrl?: string | null
  readonly dshProfile?: string
}

/** Value returned from `createProject`. */
export interface CreateProjectValue {
  readonly project: ProjectShape
}

/** Request for `getProject`. */
export interface GetProjectRequest {
  readonly id: string
}

/** Value returned from `getProject`. */
export interface GetProjectValue {
  readonly project: ProjectShape
}

/** Request for `deleteProject`. */
export interface DeleteProjectRequest {
  readonly id: string
}

/** Value returned from `deleteProject`; empty body on success. */
export interface DeleteProjectValue {
  readonly id: string
  readonly deleted: true
}

// ---- Session lifecycle ----

/** Request for `startSession`. */
export interface StartSessionRequest {
  readonly projectId: string
  /** Optional preset id to mount as the Agent preset. */
  readonly presetId?: string
  /** Optional caller-supplied Session id; one is generated when absent. */
  readonly sessionId?: string
}

/** Value returned from `startSession`. */
export interface StartSessionValue {
  readonly sessionId: string
  readonly projectId: string
  readonly cwd: string
}

/** Request for `sendMessage`. */
export interface SendMessageRequest {
  readonly sessionId: string
  readonly content: string
  /** Optional message source (defaults to `user`). */
  readonly source?: 'user' | 'api'
}

/** Value returned from `sendMessage`. */
export interface SendMessageValue {
  readonly sessionId: string
  readonly accepted: true
  /** Sequence of the admitted message; -1 when the Agent is offline. */
  readonly seq: number
}

/** Request for `getTranscript` (cold page read). */
export interface GetTranscriptRequest {
  readonly sessionId: string
  /** Cursor of the next event to read (inclusive); `-1` starts at `0`. */
  readonly fromSeq?: number
  /** Maximum events to include; defaults to the controller's default. */
  readonly maxMessages?: number
}

/** Value returned from `getTranscript`. */
export interface GetTranscriptValue {
  readonly sessionId: string
  readonly header: SessionHeader
  readonly cursor: number
  readonly records: readonly SessionHistoryRecord[]
  readonly hasMore: boolean
}

/** Request for `forkSession`. */
export interface ForkSessionRequest {
  readonly sessionId: string
  /** Anchor seq; defaults to the latest. */
  readonly anchorSeq?: number
}

/** Value returned from `forkSession`. */
export interface ForkSessionValue {
  readonly sourceSessionId: string
  readonly newSessionId: string
  readonly anchorSeq: number
}

/** Request for `resumeSession`. */
export interface ResumeSessionRequest {
  readonly sessionId: string
}

/** Value returned from `resumeSession`. */
export interface ResumeSessionValue {
  readonly sessionId: string
  readonly header: SessionHeader
  readonly resumed: true
}

// ---- SSE event subscription (stream) ----

/** Request for `subscribeEvents` (the gateway transports it as SSE). */
export interface SubscribeEventsRequest {
  readonly sessionId: string
  /** Last committed seq the caller already holds; `-1` for an opening window. */
  readonly afterSeq?: number
}

/** Frame emitted by the `subscribeEvents` stream. */
export interface SubscribeEventsFrame {
  readonly type: 'snapshot' | 'event' | 'closed'
  readonly seq?: number
  readonly header?: SessionHeader
  readonly cursor?: number
  readonly records?: readonly SessionHistoryRecord[]
  readonly hasMore?: boolean
  readonly event?: SessionWireEvent
  readonly reason?: string
}

/** Request for `getPreview`. */
export interface GetPreviewRequest {
  readonly projectId: string
}

/** Value returned from `getPreview`. */
export interface GetPreviewValue {
  readonly projectId: string
  readonly status: 'idle' | 'starting' | 'ready' | 'failed' | 'stopped' | 'unknown'
  readonly url?: string
  readonly port: number
  readonly message?: string
  readonly updatedAt: number
}

// ---- Deferred (Phase 2) ----

/** Request for `deploy` (currently throws `not-implemented`). */
export interface DeployRequest {
  readonly projectId: string
  /** Optional deployment target override. */
  readonly target?: string
}

/** Value returned from `deploy` when the implementation lands. */
export interface DeployValue {
  readonly projectId: string
  readonly deploymentId: string
  readonly url?: string
}

/** Request for `getUsage` (currently throws `not-implemented`). */
export interface GetUsageRequest {
  readonly projectId?: string
  readonly sessionId?: string
}

/** Value returned from `getUsage` when the implementation lands. */
export interface GetUsageValue {
  readonly tokensIn: number
  readonly tokensOut: number
  readonly costUsd: number
  readonly cacheHitRate: number
}
// ---- Deployment stream + list (Phase 2.5) ----

/** Public, JSON-safe projection of a `Deployment` record. The branded deployment id is erased to a plain `string` for the wire shape. */
export interface DeploymentShape {
  readonly id: string
  readonly projectId: string
  readonly target: string
  readonly status: DeploymentStatus
  readonly gateResults: readonly DeploymentGateResultShape[]
  readonly url?: string
  readonly reason?: string
  readonly createdAt: string
  readonly updatedAt: string
}

/** JSON-safe per-gate result projection. */
export interface DeploymentGateResultShape {
  readonly kind: GateKind
  readonly passed: boolean
  readonly findings: readonly DeploymentGateFindingShape[]
  readonly durationMs: number
}

/** JSON-safe gate-finding projection. */
export interface DeploymentGateFindingShape {
  readonly kind: GateKind
  readonly severity: GateFindingSeverity
  readonly message: string
  readonly file?: string
  readonly line?: number
}

/** Re-export the closed source-of-truth unions so callers typecheck against one set. */
export type { DeploymentStatus, GateKind, GateFindingSeverity }

/** Empty request — lists every durable deployment in creation order. */
export interface ListDeploymentsRequest {
  /** Optional projectId filter; absent means every project. */
  readonly projectId?: string
}

/** Value returned from `listDeployments`. */
export interface ListDeploymentsValue {
  readonly deployments: readonly DeploymentShape[]
}

/** Request for `subscribeDeploymentEvents`. */
export interface SubscribeDeploymentEventsRequest {
  /** Optional projectId filter; absent means every project. */
  readonly projectId?: string
}

/** One lifecycle transition the deployment stream surfaces. */
export type DeploymentStreamEvent =
  | { readonly type: 'started'; readonly deployment: DeploymentShape }
  | { readonly type: 'succeeded'; readonly deployment: DeploymentShape }
  | { readonly type: 'failed'; readonly deployment: DeploymentShape; readonly reason: string }

/** Frame emitted by the `subscribeDeploymentEvents` stream. */
export type SubscribeDeploymentEventsFrame =
  | { readonly type: 'snapshot'; readonly cursor: number; readonly records: readonly DeploymentShape[] }
  | { readonly type: 'event'; readonly seq: number; readonly event: DeploymentStreamEvent }
  | { readonly type: 'closed'; readonly reason: 'cancelled' | 'source-closed' }
