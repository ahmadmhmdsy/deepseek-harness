/**
 * Types for the App Builder deployment pipeline. No runtime code lives here.
 *
 * The deployment pipeline gates a project's source tree through three
 * deterministic scanners (SAST / SCA / secrets) before requesting approval
 * and pushing. Every public surface here is JSON-safe so the BFF can
 * serialize it directly into the deployment status pane and into
 * `deployment/started|succeeded|failed` events.
 *
 * @module @deepseek-ai/dsh-app-builder-deployment/types
 */

/** Branded deployment id (see `dsh-brand` rationale in the root AGENTS.md). */
export type DeploymentId = string & { readonly __deploymentIdBrand: unique symbol }

/** Branded gate id (a single scanner pass over a project root). */
export type GateId = string & { readonly __gateIdBrand: unique symbol }

/**
 * Deployment lifecycle status.
 *
 *  - `pending`       — record added; gates have not started.
 *  - `gates-running` — at least one gate is mid-scan.
 *  - `gates-failed`  — at least one gate emitted an `error`-severity finding;
 *                       the deploy short-circuits before approval.
 *  - `awaiting-approval` — gates passed; the approval step is in flight.
 *  - `rejected`      — approval denied; the deploy short-circuits.
 *  - `pushing`       — approval granted; the push step is in flight.
 *  - `succeeded`     — push landed; the deploy is complete.
 *  - `failed`        — terminal failure during gate / approval / push; the
 *                       `reason` field carries the human-readable summary.
 */
export type DeploymentStatus =
  | 'pending'
  | 'gates-running'
  | 'gates-failed'
  | 'awaiting-approval'
  | 'rejected'
  | 'pushing'
  | 'succeeded'
  | 'failed'

/** The three gate kinds the deployment pipeline runs in order. */
export type GateKind = 'sast' | 'sca' | 'secrets'

/** Every gate kind in canonical pipeline order. */
export const GATE_KINDS: readonly GateKind[] = ['sast', 'sca', 'secrets']

/** Severity classification for a single gate finding. */
export type GateFindingSeverity = 'info' | 'warn' | 'error'

/**
 * One finding from a gate scanner.
 *
 *  - `error` severity blocks the deploy.
 *  - `warn` and `info` are surfaced in the deployment record but do not
 *    block the push step.
 */
export interface GateFinding {
  /** Which gate emitted the finding. */
  readonly kind: GateKind
  /** Severity classification. */
  readonly severity: GateFindingSeverity
  /** Human-readable summary of the finding. */
  readonly message: string
  /** Project-relative file path the finding references, when applicable. */
  readonly file?: string
  /** 1-based line number the finding references, when applicable. */
  readonly line?: number
}

/**
 * Result of running one gate over a project root. The deployment record
 * stores one `GateResult` per gate kind so the status pane can show a
 * per-gate breakdown without re-running the scanners.
 */
export interface GateResult {
  /** Which gate ran. */
  readonly kind: GateKind
  /** True when no `error`-severity finding was emitted. */
  readonly passed: boolean
  /** Every finding the gate emitted (may include warnings + info). */
  readonly findings: readonly GateFinding[]
  /** Wall-clock duration of the gate, in milliseconds. */
  readonly durationMs: number
}

/**
 * Public, JSON-safe deployment record.
 *
 * The record is the unit of durability: every durable transition emits one
 * `deployment/started|succeeded|failed` event that carries the latest
 * shape. The registry keeps the latest in-memory copy; the session log is
 * the durable source of truth across process restarts.
 */
export interface Deployment {
  readonly id: DeploymentId
  /** Project id the deploy belongs to. */
  readonly projectId: string
  /** Deployment target override (`local` by default; a remote URL for hooks). */
  readonly target: string
  /** Current lifecycle status. */
  readonly status: DeploymentStatus
  /** Per-gate results in pipeline order; absent entries mean the gate has not run yet. */
  readonly gateResults: readonly GateResult[]
  /** Resolved push URL once `status === 'succeeded'`; absent otherwise. */
  readonly url?: string
  /** Human-readable reason on terminal failure; absent on success. */
  readonly reason?: string
  /** ISO-8601 timestamp at which the record was created. */
  readonly createdAt: string
  /** ISO-8601 timestamp of the most recent status transition. */
  readonly updatedAt: string
}

/** Input shape for `DeploymentRegistry.deploy`. */
export interface DeploymentRequest {
  readonly projectId: string
  /** Optional deployment target override. `local` is the default. */
  readonly target?: string
}

/** Value returned from `DeploymentRegistry.deploy` on the success path. */
export interface DeploymentValue {
  readonly projectId: string
  readonly deploymentId: string
  readonly url?: string
}

// ---- Events ----

/** Event payload for `deployment/started`; emitted when the deploy begins. */
export interface DeploymentStartedEvent {
  readonly type: 'deployment/started'
  readonly deployment: Deployment
}

/**
 * Event payload for `deployment/succeeded`; emitted when the push lands.
 * Listeners see the final record with `status === 'succeeded'`.
 */
export interface DeploymentSucceededEvent {
  readonly type: 'deployment/succeeded'
  readonly deployment: Deployment
}

/**
 * Event payload for `deployment/failed`; emitted on terminal failure
 * (gate failure, approval rejection, push error). The `reason` field
 * carries the human-readable summary; `deployment.reason` carries the
 * same value for record durability.
 */
export interface DeploymentFailedEvent {
  readonly type: 'deployment/failed'
  readonly deployment: Deployment
  readonly reason: string
}
