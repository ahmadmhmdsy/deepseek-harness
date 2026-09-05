/**
 * @module @deepseek-ai/dsh-app-builder-api
 *
 * App Builder Host BFF as a Typert Remote service. The 13 Remote methods
 * listed in `planning/Phase 2 prompt.md §3` are grouped into project CRUD
 * (4), session lifecycle (5), SSE event subscription (1), preview (1),
 * deploy (wired through @deepseek-ai/dsh-app-builder-deployment in
 * Phase 2.1), and getUsage (wired through @deepseek-ai/dsh-token-meter in
 * Phase 2.3). The service mounts
 * inside `@deepseek-ai/dsh-api-gateway` automatically — the gateway
 * auto-discovers every TypertRemoteService via reflection on
 * `ctx.reflect.props` and exposes its methods over its own transport.
 *
 * Every implemented Remote method delegates to an existing service that
 * already proves its own relation: `ctx.appBuilderProjects` for project
 * CRUD, `ctx.sessionController` for the session lifecycle and the SSE
 * event stream, and `ctx.appBuilderSnapshotBridge` for preview state.
 * Phase 2.1 wires `deploy` through @deepseek-ai/dsh-app-builder-deployment and
 * returns the typed `not-implemented` failure when that plugin is not
 * mounted; `getUsage` is wired through @deepseek-ai/dsh-token-meter in
 * Phase 2.3 and answers with a typed `not-implemented` only for the
 * projectId-only aggregation path that lands with the Phase 2.4
 * projection unit. A missing owner never silently succeeds.
 */

import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'

import type {
  CreateProjectRequest,
  CreateProjectValue,
  DeleteProjectRequest,
  DeleteProjectValue,
  DeployRequest,
  DeployValue,
  ForkSessionRequest,
  ForkSessionValue,
  GetPreviewRequest,
  GetPreviewValue,
  GetProjectRequest,
  GetProjectValue,
  GetTranscriptRequest,
  GetTranscriptValue,
  GetUsageRequest,
  GetUsageValue,
  ListDeploymentsRequest,
  ListDeploymentsValue,
  ListProjectsValue,
  ResumeSessionRequest,
  ResumeSessionValue,
  SendMessageRequest,
  SendMessageValue,
  StartSessionRequest,
  StartSessionValue,
  SubscribeDeploymentEventsFrame,
  SubscribeDeploymentEventsRequest,
  SubscribeEventsFrame,
  SubscribeEventsRequest,
  SubscribePreviewFrame,
  SubscribePreviewRequest,
} from './types.ts'

import { createProjectRemote, deleteProjectRemote, getProjectRemote, listProjectsRemote } from './projects.ts'
import {
  forkSessionRemote,
  getTranscriptRemote,
  resumeSessionRemote,
  sendMessageRemote,
  startSessionRemote,
} from './sessions.ts'
import { getPreviewRemote, subscribePreviewRemote } from './preview.ts'
import { subscribeEventsRemote } from './events.ts'
import { deployRemote } from './deferred.ts'
import { getUsageRemote } from './usage.ts'
import { listDeploymentsRemote, subscribeDeploymentEventsRemote } from './deployments.ts'

export type {
  CreateProjectRequest,
  CreateProjectValue,
  DeleteProjectRequest,
  DeleteProjectValue,
  DeploymentShape,
  DeploymentStreamEvent,
  DeployRequest,
  DeployValue,
  ForkSessionRequest,
  ForkSessionValue,
  GetPreviewRequest,
  GetPreviewValue,
  GetProjectRequest,
  GetProjectValue,
  GetTranscriptRequest,
  GetTranscriptValue,
  GetUsageRequest,
  GetUsageValue,
  ListDeploymentsRequest,
  ListDeploymentsValue,
  ListProjectsValue,
  ListProjectsRequest,
  PreviewStreamRecord,
  ProjectShape,
  ResumeSessionRequest,
  ResumeSessionValue,
  SendMessageRequest,
  SendMessageValue,
  StartSessionRequest,
  StartSessionValue,
  SubscribeDeploymentEventsFrame,
  SubscribeDeploymentEventsRequest,
  SubscribeEventsFrame,
  SubscribeEventsRequest,
  SubscribePreviewFrame,
  SubscribePreviewRequest,
} from './types.ts'

/**
 * App Builder Host BFF. Class default export per the service-plugin rule
 * (a Service Definition is default-exported; function plugins use named
 * exports only — see `packages/AGENTS.md`). The Gateway auto-discovers
 * every subclass of `TypertRemoteService` via `Reflect.get(original,
 * 'typertRemote')` set by the `TypertRemoteService` constructor.
 */
export class AppBuilderApi extends TypertRemoteService {
  /**
   * Required host services. `appBuilderSnapshotBridge` is intentionally
   * absent from this list because `getPreview` reads it via `ctx.get()`
   * and returns a neutral `unknown` record when the bridge is unmounted
   * (a deployment that does not need the projects pane can ship the BFF
   * without the bridge). The Gateway auto-injects this list when it
   * instantiates the class; the upstream Service Definition pattern
   * preserves the runtime check on `super` so a missing required
   * injection throws at construction rather than at the first Remote call.
   */
  static inject = ['appBuilderProjects', 'sessionController', 'tokenMeter'] as const

  /**
   * @param ctx - Host context carrying App Builder registries + session controller.
   */
  constructor(ctx: Context) {
    super(ctx, 'appBuilderApi', { namespace: 'appBuilder' })
  }

  // ---- Project CRUD ----

  /**
   * List every durable project in creation order.
   * @returns the empty-state array when the registry has no records.
   */
  @Remote('listProjects')
  listProjects(): Promise<ListProjectsValue> {
    return listProjectsRemote(this.ctx)
  }

  /**
   * Create one durable project: writes the template files, registers the
   * record, and returns its public shape. `npm install` is intentionally
   * not run here (caller can spawn it via the `jobs` capability).
   * @param request - create payload.
   * @returns the created project shape.
   */
  @Remote('createProject')
  createProject(request: CreateProjectRequest): Promise<CreateProjectValue> {
    return createProjectRemote(this.ctx, request)
  }

  /**
   * Look up one project by id.
   * @param request - lookup payload.
   * @returns the public shape, or a typed `not-found` failure.
   */
  @Remote('getProject')
  getProject(request: GetProjectRequest): Promise<GetProjectValue> {
    return getProjectRemote(this.ctx, request)
  }

  /**
   * Remove one project: rm -rf the directory tree, then drop the registry
   * record and emit `project/deleted` so the snapshot bridge re-flushes.
   * @param request - delete payload.
   * @returns the deleted id and `deleted: true`.
   */
  @Remote('deleteProject')
  deleteProject(request: DeleteProjectRequest): Promise<DeleteProjectValue> {
    return deleteProjectRemote(this.ctx, request)
  }

  // ---- Session lifecycle ----

  /**
   * Create one Session rooted at the project's canonical path.
   * @param request - start payload (projectId + optional presetId / sessionId).
   * @returns the new Session id and resolved cwd.
   */
  @Remote('startSession')
  startSession(request: StartSessionRequest): Promise<StartSessionValue> {
    return startSessionRemote(this.ctx, request)
  }

  /**
   * Admit one user-facing prompt on an attached Session.
   * @param request - prompt payload.
   * @returns the admitted Session id and sequence number.
   */
  @Remote('sendMessage')
  sendMessage(request: SendMessageRequest): Promise<SendMessageValue> {
    return sendMessageRemote(this.ctx, request)
  }

  /**
   * Read one cold-safe Session history page.
   * @param request - page payload.
   * @param signal - caller cancellation for persistence reads.
   * @returns the requested page.
   */
  @Remote('getTranscript')
  getTranscript(request: GetTranscriptRequest, signal: AbortSignal): Promise<GetTranscriptValue> {
    return getTranscriptRemote(this.ctx, request, signal)
  }

  /**
   * Fork one cold-readable completed-turn prefix into a new Session.
   * @param request - fork payload (source Session + optional anchor seq).
   * @returns the source / new Session ids and the anchor seq.
   */
  @Remote('forkSession')
  forkSession(request: ForkSessionRequest): Promise<ForkSessionValue> {
    return forkSessionRemote(this.ctx, request)
  }

  /**
   * Cold-resume one durable Session without re-attaching its Agent.
   * @param request - resume payload.
   * @returns the resumed Session header.
   */
  @Remote('resumeSession')
  resumeSession(request: ResumeSessionRequest): Promise<ResumeSessionValue> {
    return resumeSessionRemote(this.ctx, request)
  }

  // ---- SSE event subscription ----

  /**
   * Stream one Session's events as gap-free frames. The Gateway transports
   * the AsyncIterable as the response body of an SSE-style invocation.
   * @param request - subscription payload (sessionId + optional afterSeq).
   * @param signal - caller / transport cancellation.
   * @returns the frame iterable.
   */
  @Remote({ mode: 'stream' })
  subscribeEvents(request: SubscribeEventsRequest, signal: AbortSignal): AsyncIterable<SubscribeEventsFrame> {
    return subscribeEventsRemote(this.ctx, request, signal)
  }

  // ---- Preview ----

  /**
   * Read one project's dev-server status from the snapshot bridge.
   * @param request - lookup payload.
   * @returns the public preview shape.
   */
  @Remote('getPreview')
  getPreview(request: GetPreviewRequest): Promise<GetPreviewValue> {
    return getPreviewRemote(this.ctx, request)
  }

  // ---- Deferred (Phase 2) ----

  /**
   * `deploy` placeholder. Returns a typed `not-implemented` failure.
   * @param request - deploy payload (projectId + optional target).
   * @returns never — throws the typed `not-implemented` failure.
   */
  @Remote('deploy')
  deploy(request: DeployRequest): Promise<DeployValue> {
    return deployRemote(this.ctx, request)
  }

  /**
   * Read current token / cache pressure for one Session (or, once the
   * Phase 2.4 projection unit lands, aggregate over every Session of a
   * project). Delegates to `ctx.tokenMeter.measure(session)` and projects
   * the resulting `TokenMeasurement` into the public `GetUsageValue`
   * shape. Returns a typed `not-implemented` failure for the
   * projectId-only aggregation path until that lands.
   * @param request - usage query (sessionId required today; projectId
   *   aggregation lands in Phase 2.4).
   * @returns the public `GetUsageValue` shape.
   */
  @Remote('getUsage')
  getUsage(request: GetUsageRequest): Promise<GetUsageValue> {
    return getUsageRemote(this.ctx, request)
  }

  // ---- Deployment stream + list (Phase 2.5) ----

  /**
   * List every deployment in creation order, optionally filtered by
   * projectId. Reads the in-memory deployment registry.
   * @param request - optional projectId filter.
   * @returns the public value.
   */
  @Remote('listDeployments')
  listDeployments(request: ListDeploymentsRequest): Promise<ListDeploymentsValue> {
    return listDeploymentsRemote(this.ctx, request)
  }

  /**
   * Stream deployment lifecycle events. Yields one `snapshot` frame
   * first (the current registry state) then `event` frames as new
   * transitions land. Listeners dispose on stream end.
   * @param request - optional projectId filter.
   * @param signal - caller / transport cancellation.
   * @returns the frame iterable.
   */
  @Remote({ mode: 'stream' })
  subscribeDeploymentEvents(
    request: SubscribeDeploymentEventsRequest,
    signal: AbortSignal,
  ): AsyncIterable<SubscribeDeploymentEventsFrame> {
    return subscribeDeploymentEventsRemote(this.ctx, request, signal)
  }

  // ---- Preview stream (Phase 2.5 option 2) ----

  /**
   * Stream preview dev-server transitions. Opens with one `snapshot`
   * frame (the snapshot bridge's current `devServers` map, filtered by
   * `projectId` when requested) then yields `event` frames as new
   * transitions land. The carrier aborts by calling `signal.abort()`
   * and the stream disposes its listener in the `finally` block.
   * @param request - subscription payload (optional projectId filter).
   * @param signal - caller / transport cancellation.
   * @returns the frame iterable.
   */
  @Remote({ mode: 'stream' })
  subscribePreview(
    request: SubscribePreviewRequest,
    signal: AbortSignal,
  ): AsyncIterable<SubscribePreviewFrame> {
    return subscribePreviewRemote(this.ctx, request, signal)
  }
}

// Suppress unused-import lint for the Service base class (imported above
// for type discovery of TypertRemoteService's base contract).
void Service

export default AppBuilderApi
