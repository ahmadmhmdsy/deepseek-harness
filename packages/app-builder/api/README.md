# @deepseek-ai/dsh-app-builder-api

English | [中文](README.zh.md)

The App Builder Host BFF as a Typert Remote service. The 13 Remote methods listed in planning/Phase 2 prompt.md section 3 are grouped into project CRUD (4), session lifecycle (5), SSE event subscription (1), preview (1), deploy (wired through @deepseek-ai/dsh-app-builder-deployment, Phase 2.1), and getUsage (wired through @deepseek-ai/dsh-token-meter, Phase 2.3).

## What it does

The package exposes one AppBuilderApi Cordis Service (super(ctx, "appBuilderApi", { namespace: "appBuilder" })) whose every method is @Remote-decorated. The Gateway auto-discovers the class via reflection on ctx.reflect.props and transports each method over its own carrier (unary RPC, SSE stream, or live-control stream).

Every implemented Remote method delegates to an upstream service that already proves its own runtime relation:

| Method | Mode | Delegates to | Notes |
|---|---|---|---|
| listProjects | unary | ctx.appBuilderProjects | Returns the public shape (id, name, rootPath, stack, gitUrl, dshProfile, createdAt) in creation order. |
| createProject | unary | ctx.appBuilderProjects + scaffold templates | Validates name + stack, writes the template files verbatim, registers the record. npm install is intentionally NOT started here. |
| getProject | unary | ctx.appBuilderProjects | Typed not-found failure when the id is unknown. |
| deleteProject | unary | ctx.appBuilderProjects | Removes the directory tree (rm -rf) before dropping the registry record, then emits project/deleted for the snapshot bridge. |
| startSession | unary | ctx.sessionController.create | Synthesizes a controller request with cwd: project.rootPath. |
| sendMessage | unary | ctx.sessionController.prompt | Forwards to the controller prompt method. |
| getTranscript | unary | ctx.sessionController.page | Cold page read; persists across session resume. |
| forkSession | unary | ctx.sessionController.fork | Anchor seq defaults to the latest. |
| resumeSession | unary | ctx.sessionController.inspect | Returns the header without re-attaching the Agent. |
| subscribeEvents | stream | ctx.sessionController.follow | Yields a snapshot frame then gap-free event frames; gateway transports the AsyncIterable as SSE. |
| getPreview | unary | ctx.appBuilderSnapshotBridge (optional) | Returns the bridge in-memory dev-server state. Returns status: unknown when the bridge is unmounted. |
| deploy | unary | ctx.appBuilderDeployment (optional) | Delegates to the deployment registry and projects the record into the public `DeployValue` shape. Returns a typed `not-implemented` failure when the deployment plugin is not mounted. |
| getUsage | unary | ctx.tokenMeter + ctx.sessions | Reads `ctx.tokenMeter.measure(session)` for the addressed live Session and projects the resulting `TokenMeasurement` into the public `GetUsageValue` shape (`tokensIn` + `tokensOut` + `cacheHitRate`). The `projectId`-only aggregation path returns a typed `not-implemented` failure until the Phase 2.4 projection unit lands. |

## Required services (injection)

| Service | Required | Source |
|---|---|---|
| appBuilderProjects | yes | @deepseek-ai/dsh-app-builder-project |
| sessionController | yes | @deepseek-ai/dsh-api-session-controller |
| tokenMeter | yes | @deepseek-ai/dsh-token-meter |
| appBuilderSnapshotBridge | optional | @deepseek-ai/dsh-app-builder-snapshot-bridge (only needed for getPreview to return real state) |
| appBuilderDeployment | optional | @deepseek-ai/dsh-app-builder-deployment (only needed for deploy to succeed; unmounted returns not-implemented) |

## Mounting

```yaml
- id: app-builder-api
  name: "@deepseek-ai/dsh-app-builder-api"
- id: api-session-controller
  name: "@deepseek-ai/dsh-api-session-controller"
- id: api-remotes
  name: "@deepseek-ai/dsh-api-remotes"
```

The Gateway picks up the BFF automatically — no patch row or extra registration is required.

## Known Limitations and Deferred Work

- `getUsage` only measures live Sessions (a cold Session returns `not-found` from `ctx.sessions.get`). Cold-replay measurement lands with the Phase 2.4 projection unit; until then the BFF surfaces the typed `not-found` failure so a missing owner never silently succeeds.
- `getUsage` answers the `projectId`-only aggregation path with a typed `not-implemented` failure; aggregating per-session measurements into one project total requires enumerating the project's Sessions, which is the Phase 2.4 projection unit's job.
- `costUsd` is reported as `0` in `getUsage` because Phase 2.3 ships without a per-route price table. The DeepSeek price table lands in Phase 2.5 and is projected into the same field without changing the wire shape.
- The projection cache for a Session whose owning project was deleted retains the stale project ownership until the Session restarts. The session-controller own inspect() reads the fresh log; the projection apply is identity (cwd-immutability invariant), so the cached view diverges from the registry until restart. Lands when Phase 2 introduces a project/deleted event hook into the projection fold.
- deleteProject is irreversible: the directory removal is non-transactional, and a partial failure leaves the registry without its directory.

## Reference

- planning/Phase 1.5 prompt.md — section 1.5 adopt worktree-apire-* cluster
- planning/Phase 2 prompt.md — section 3 API surface
- packages/api/session-controller/ — upstream Remote service the BFF forwards to
- packages/app-builder/snapshot-bridge/ — in-memory snapshot the getPreview method reads
- packages/app-builder/project/ — durable project registry the project CRUD methods wrap
- packages/llm/token-meter/ — replay-aware token meter the getUsage method reads
- packages/app-builder/deployment/ — deployment pipeline the deploy method reads