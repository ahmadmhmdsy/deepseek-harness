# Agent Note: App Builder API gateway cluster (Phase 1.5 / 1.5.5)

Status: implemented

English | [中文](2026-08-31-api-gateway-cluster.zh.md)

> Phase 1.5 / sub-phase 1.5.5 — adopt the upstream `worktree-apire-*` cluster (PRs #2911, #2968, #3082, #3083, #3085, #3086, #3217, #3235) into the fork as a new `packages/app-builder/api/` Typert Remote service exposing the 13 methods from `planning/Phase 2 prompt.md §3`. Stacked on `origin/adopt/projection-cache` (1.5.4 HEAD `8a28421e02`).

## Problem

Phase 1 (App Builder MVP) shipped `packages/app-builder/{project,scaffold,preview,persona,snapshot-bridge}` — function plugins that compose model-facing tools plus the durable project entity. Phase 2 calls for a Host BFF Typert Remote surface (13 methods: project CRUD + session lifecycle + SSE event subscription + preview + deploy + usage) so the Web client and any external gateway can drive the App Builder without round-tripping through the model. The fork lacks that BFF.

The upstream `worktree-apire-*` cluster (PRs #2911, #2968, #3082, #3083, #3085, #3086, #3217, #3235) is the reference shape; the cluster does not yet exist on `master` of this fork (1.5.1 already merged `dsh-v0.1.2-alpha.1` but the cluster landed in a later upstream batch).

## Decision

Scaffold `@deepseek-ai/dsh-app-builder-api` as one Cordis Service (`AppBuilderApi extends TypertRemoteService`, namespace `appBuilder`) whose 13 `@Remote`-decorated methods delegate 1:1 to the services that already own each relation:

- **Project CRUD (4)**: `listProjects`, `createProject`, `getProject`, `deleteProject` map to `ctx.appBuilderProjects` (Phase 1.5.4 registry). `createProject` re-implements the template-file write that the model-facing scaffold tool exposes, importing the same `TEMPLATES` and `validateProjectName` so both surfaces agree on the catalog and validation rules. `deleteProject` removes the directory tree first, then drops the registry record and emits `project/deleted` for the snapshot bridge.
- **Session lifecycle (5)**: `startSession`, `sendMessage`, `getTranscript`, `forkSession`, `resumeSession` forward to the upstream `@deepseek-ai/dsh-api-session-controller` (`ctx.sessionController`). `startSession` synthesizes a controller request with `cwd: project.rootPath`; the rest use the controller as-is.
- **SSE event subscription (1)**: `subscribeEvents` is a `@Remote({ mode: "stream" })` method that delegates to `ctx.sessionController.follow`. The gateway transports the `AsyncIterable` as SSE; one snapshot frame followed by gap-free event frames.
- **Preview (1)**: `getPreview` reads the snapshot bridge's in-memory state via the new `ctx.appBuilderSnapshotBridge` accessor the bridge publishes. Returns `status: "unknown"` when the bridge is unmounted (a deployment that does not need the projects pane).
- **Phase 2 deferred (2)**: `deploy` and `getUsage` return typed `not-implemented` failures (Typert `code: "not-implemented"`). They land when Phase 2 adopts `@deepseek-ai/dsh-app-builder-deployment` and the token / cost accounting policy package.

Mounting requires no Gateway patch row: the Gateway iterates `ctx.reflect.props` for `type === "service"` and `Reflect.get(original, "typertRemote")` (set by `TypertRemoteService`'s constructor via `bindTypertRemote`). The new service is auto-discovered.

## Bundle / composition impact

- `packages/bundle/app-builder/cordis.patch.yml` adds rows for `app-builder-snapshot-bridge`, `app-builder-api`, `api-session-controller`, and `api-remotes` (the last two are required peers for the BFF's session methods and the SSE stream).
- `apps/cli/config/examples/app-builder/cordis.yml` mirrors the same rows so the example composition boots the full BFF.
- `packages/app-builder/scaffold/package.json` gains `./templates` and `./validate` exports so the BFF can reuse the same template catalog the model-facing scaffold tool uses.
- `packages/app-builder/snapshot-bridge/src/index.ts` adds `ctx.appBuilderSnapshotBridge = { snapshot: () => cachedSnapshot }` so the BFF can read the bridge's in-memory state without going through the HTTP route. Also subscribes to the new `project/deleted` event for synchronous refresh.
- `packages/app-builder/project/src/index.ts` adds `ProjectRegistry.delete(id)` and the `project/deleted` event. The projection cache drops the project's cells on the next mandatory write point.
- `tsconfig.base.json` adds hand-written path aliases for `@deepseek-ai/dsh-app-builder-api` (the package name's segment count does not match the directory depth so `gen-tsconfig-paths` cannot auto-derive).
- `scripts/verify-package-readme-model-experience.ts` adds `packages/app-builder/api` to `NO_MODEL_EXPERIENCE_SECTION` (the BFF dispatches to upstream services; no model-facing rendering).

## Supersession check

Searched `.agents/notes/{implemented,archived}` for `projection.cache|projectionCache|projection.unit|project.*projection|owning.*project|xtr/projection`. No prior note covers the App Builder Host BFF Typert Remote surface specifically. Closest precedents cross-linked below; none is superseded by this triplet.

- `2026-07-27-session-projection-and-command-log.{md,zh.md}` (RFC) — the session-projection seam this PR's predecessor (1.5.4) wired into `app-builder/project`. The 1.5.5 BFF consumes `ctx.sessionController` (built on the same seam) for `subscribeEvents`; the BFF does not change the seam.
- `2026-08-19-session-projection-state-and-client-views.{md,zh.md}` — implements the projection registry the BFF reads through `sessionController.follow`. No conflict.
- `2026-08-06-subagent-list-identity-projection.{md,zh.md}` — earliest precedent for adding a new projection unit on `ctx.sessionProjections`; 1.5.4 followed this pattern for the `project` unit. 1.5.5 does not add a projection unit.

## Alternatives considered

- **Inline the 13 methods into the existing app-builder packages** (project / scaffold / preview / persona). Rejected: 13 Remote methods across 4 different concerns do not belong in any single existing package; mixing them with model-facing tools would muddy the function-plugin vs service boundary (the existing packages are function plugins without default exports per `packages/AGENTS.md`).
- **Generate the BFF from a Typert `*.remote.ts` schema** instead of hand-writing the `@Remote`-decorated methods. Rejected for 1.5.5: the typert generator (`packages/typert/generator`) handles the wire-codec story but the BFF's per-method logic is per-method handwritten in either path; the hand-written form makes the per-method delegation to `ctx.sessionController` and `ctx.appBuilderProjects` explicit. Phase 2 can revisit if more remotes land.
- **Implement `deploy` and `getUsage` as best-effort stubs** that use existing services (e.g. read the preview URL for "deploy"). Rejected: the methods have a single semantic owner each; a stub that pretends to deploy is worse than a typed `not-implemented` failure that the client renders explicitly.

## Consequences

- The 13-method surface is now mounted wherever `@deepseek-ai/dsh-app-builder-api` + `@deepseek-ai/dsh-api-session-controller` + `@deepseek-ai/dsh-api-remotes` are co-installed. Bundles / compositions that omit `session-controller` see the BFF's project-CR + preview methods; the session methods throw a typed `service-unavailable` failure (no silent partial surface).
- `project/deleted` is a new Cordis event (declared on `Context.Events` in `app-builder/project`). Any listener that subscribes is bound to the same fiber as the registry plugin; the snapshot-bridge subscription added in this PR is the only first-party consumer today.
- The projection cache for a Session whose owning project was deleted retains the stale project ownership until the Session restarts. The session-controller's own `inspect()` reads the fresh log; the projection's `apply` is identity (cwd-immutability invariant), so the cached view diverges from the registry until restart. Documented in the package README `## Known Limitations and Deferred Work`.
- `deleteProject` is irreversible: the directory removal is non-transactional, and a partial failure leaves the registry without its directory. Documented in the package README `## Known Limitations`.
- The BFF's `appBuilderSnapshotBridge` dependency is OPTIONAL (a deployment that does not need the projects pane can ship the BFF without the bridge; `getPreview` returns `status: "unknown"`). `inject` lists only the two required services.

## Reference

- [`planning/Phase 1.5 prompt.md`](../../../planning/Phase%201.5%20prompt.md) — §1.5 adopt `worktree-apire-*` cluster
- [`planning/Phase 2 prompt.md`](../../../planning/Phase%202%20prompt.md) — §3 API surface
- [`planning/inspect/19-upstream-v0.1.2-alpha.1-adoption-plan.md`](../../../planning/inspect/19-upstream-v0.1.2-alpha.1-adoption-plan.md) — adoption-plan reference (does not detail the cluster; this PR fills the gap)
- [`packages/app-builder/api/`](../../packages/app-builder/api/) — the new package
- [`packages/api/session-controller/`](../../packages/api/session-controller/) — the upstream Remote service the BFF forwards to
- [`packages/app-builder/snapshot-bridge/`](../../packages/app-builder/snapshot-bridge/) — the in-memory snapshot the `getPreview` method reads
- [`packages/app-builder/project/`](../../packages/app-builder/project/) — the durable project registry the project CRUD methods wrap
- `.agents/notes/implemented/architecture/2026-07-27-session-projection-and-command-log.{md,zh.md}` — RFC for the session-projection seam the upstream session-controller builds on
- `.agents/notes/implemented/feature/2026-08-19-session-projection-state-and-client-views.{md,zh.md}` — implements the projection registry the BFF reads through `sessionController.follow`
- `.agents/notes/implemented/feature/2026-08-06-subagent-list-identity-projection.{md,zh.md}` — earliest precedent for adding a new projection unit (followed by 1.5.4 for the `project` unit)

## Known pre-existing failures (not caused by 1.5.5)

- `pnpm run verify-translation-pairing` reports 3 out-of-sync notes from 1.5.1 baseline: `2026-06-24-workspace-context.md`, `2026-07-21-follow-instruction-symlinks.md`, `2026-07-21-instruction-load-all-dedup.md`. Their `i18n.yaml` records diverge from the prose; the drift predates this PR and lands in 1.5.7 per the 1.5.4 Agent Note.
- `pnpm run verify-package-readme-model-experience` reports 7 pre-existing failures across `app-builder/{persona,preview,scaffold,snapshot-bridge}`, `bundle/app-builder`, and `client/ui-app-builder-{projects,shell}` — every one predates 1.5.5 (the model-experience gate was failing for these in the 1.5.4 baseline).
- `pnpm run verify-package-invariants` reports 7 pre-existing failures flagging `@deepseek-ai/dsh-invariants` peer / devDep mismatches in `app-builder/{persona,preview,scaffold,snapshot-bridge}` and `bundle/app-builder` — every one predates 1.5.5. The 1.5.5 scaffold edit (adding `./templates` and `./validate` exports) preserved the dsh-invariants devDep that was already present in the 1.5.4 package.json.
- `pnpm run test:coverage` (not run locally; CI-owned) and `pnpm run doc-sync` / `pnpm run hygiene` (also CI-owned) inherit the 15 coverage regressions + 13 doc-sync + 8 hygiene pre-existing failures from 1.5.1 — same posture as 1.5.3 and 1.5.4.
