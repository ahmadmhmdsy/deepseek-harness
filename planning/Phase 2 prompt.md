# TASK: Phase 2 — Productize the control plane

Read [docs/PROJECT.md](../../docs/PROJECT.md) first. Goal: a real product around dsh, still single-user but scale-ready.

> **Predecessor**: Phase 1.5 (Upstream sync) merges `dsh-v0.1.2-alpha.1` and re-grounds the fork on upstream's app shape. **Phase 1.5 is accepted** (sub-phases 1.5.1–1.5.6 merged via native GitHub stacked PRs atop `origin/adopt/api-gateway-cluster`; 1.5.7 is the docs-only commit on `docs/phase1.5-record` that lands the planning artifacts + 1.5.5 cordis-catalog regression fixes). By the time Phase 2 begins, `apps/web/` is upstream's, `examples/app-builder/` lives at `apps/cli/config/examples/app-builder/`, `packages/session/session-projection-cache/` is wired into `packages/app-builder/project/`, the `worktree-apire-*` cluster + `feat/subagent-provider` are in our tree, and `packages/app-builder/api/` is scaffolded with 13 Typert Remote methods. Phase 2 builds the App Builder products on top of that infra — not on top of `0.1.1-rc.2`. The detailed sync plan lives in [`inspect/19-upstream-v0.1.2-alpha.1-adoption-plan.md`](inspect/19-upstream-v0.1.2-alpha.1-adoption-plan.md); the §9 backlog of pre-existing gate failures is documented in the 1.5.7 Agent Note (`.agents/notes/implemented/process/2026-09-01-phase-1.5-upstream-sync-record.md`).

## 0. Resolved decisions for Phase 2

- **API style**: Typert RPC + JSON-RPC. The control plane exposes REST + SSE endpoints through a Typert Remote service; the underlying transport is JSON-RPC 2.0 over stdio + the Typert RPC HTTP gateway. **Do not add a new HTTP layer.** Re-use `@deepseek-ai/dsh-api-gateway` and `@deepseek-ai/dsh-api-remotes` (both at upstream's `0.1.2-alpha.1` after Phase 1.5 sub-phase 1.5.5).
  - REST endpoints (one-shot request/response): standard Typert method dispatch.
  - SSE endpoints (subscribeEvents, live updates): reuse the existing `session/projection` push frame; SSE is an addition over the same agent-event stream.
  - JSON-RPC over stdio: the existing wire (`@deepseek-ai/dsh-sdk-protocol`); SDK clients (TS + Python) already speak it. Out-of-process clients (CI, automation) drive the App Builder through the same wire.
- **Projection cache**: `packages/session/session-projection-cache/` (adopted in Phase 1.5 sub-phase 1.5.4) is the Phase 2 §4 cache. `packages/app-builder/project/` already peer-depends on it.

## 1. Deployment package (`packages/app-builder/deployment/`)

- Cordis plugin that registers a `Deployment` entity and emits `deployment/started|succeeded|failed` events (log-only).
- Deploy tool: `git init -> commit -> push` (or ZIP export).
- **Deterministic gates** run before any push: SAST (bash + a bundled scanner), SCA (dependency audit), secrets scan (greps + pattern matchers). Failed gates block the push and emit `deployment/failed` with reason.
- Approval via `@deepseek-ai/dsh-approval` for every push.

## 2. ToolPolicy manifest (`packages/app-builder/tool-policy/`)

- Declare the typed `ToolPolicy` schema (see [docs/PROJECT.md §6](../../docs/PROJECT.md)):

  ```ts ignore-check
  interface ToolPolicy {
    id: string
    tool: string
    allow: ('read' | 'write' | 'execute' | 'network' | 'credential')[]
    ask:   ('read' | 'write' | 'execute' | 'network' | 'credential')[]
    scope?: { paths?: string[]; commands?: string[]; hosts?: string[]; credentials?: string[] }
  }
  ```

- Register a `tools/pre-execute` listener that consults `ctx.toolPolicy.for(toolName)` and converts the typed policy into a `PreToolDecision`.
- Falls back to `ctx.permissionPresets.current(events)` when no per-tool policy is declared.
- Audit: every decision becomes a `toolPolicy/decision` event (log-only).
- **Important**: this is intent + audit, NOT authority. Real authority comes from the sandbox-mode fences.

## 3. API surface (`packages/app-builder/api/`)

- A Typert Remote service `@deepseek-ai/dsh-app-builder-api` exposing:

  - `listProjects`, `createProject`, `getProject`, `deleteProject`
  - `startSession`, `sendMessage`, `getTranscript`, `forkSession`, `resumeSession`
  - `subscribeEvents` (SSE)
  - `getPreview`, `deploy`
  - `getUsage` (cache-aware token/cost)

- Mount via existing `@deepseek-ai/dsh-api-gateway` + `@deepseek-ai/dsh-api-remotes`. **Do not add a new HTTP layer**.
- SSE for `subscribeEvents` reuses the existing `session/projection` push frame.

## 4. Projection unit + cache for the projects list

- Add a `project` projection unit in `packages/app-builder/project/` (extends Phase 1's project entity).
- Wire the cache via `@deepseek-ai/dsh-session-projection-cache`.

## 5. Web UI integration

- Update `apps/web`:
  - Project list pane (uses the new projection unit).
  - Deployment status pane.
  - Preview iframe with `EventSource` for live updates.

## 6. Bundle update

- Update `packages/bundle/app-builder/cordis.patch.yml` to mount the new packages.

## 7. Snapshot tests

- `deploy-local` (gates run, push happens, `deployment/succeeded` event appended).
- `deploy-blocked-by-gates` (SAST failure, no push, `deployment/failed` with reason).
- `tool-policy-allow` (declared policy permits, decision event logged).
- `tool-policy-deny` (declared policy denies, decision event logged).
- `api-list-projects` (REST round-trip).

## 8. Agent Notes

- `deployment-pipeline` (gates + approval).
- `tool-policy-typed-schema` (the typed `ToolPolicy` and its enforcer).
- `control-plane-api` (Typert mounting).

## 9. Per-package obligations (apply to every new package)

(Same as Phase 1.) `tests/`, `./invariant`, README + JSDoc, real-composition test, per-file 100% coverage, bilingual README, catalog registration, tsconfig extends `tsconfig.base.json`.

## 10. Update `docs/PROJECT.md`

Update the canonical source of truth with any schema/API/event-type changes.

## Verification

`pnpm run typecheck && pnpm run test:coverage && pnpm run test:snapshot && pnpm run doc-sync && pnpm run hygiene` — all green.

## Definition of done

- Chat UI drives the full loop end-to-end.
- Sessions resume/fork/replay from the event log.
- Every tool call is policy-checked and logged with traceability.
- Deploy path works and generated code passes the gates.
- All five verification commands pass.

## Do NOT in Phase 2

- Do not introduce a new HTTP layer; mount via Typert RPC gateway.
- Do not invent a parallel permission system; the typed ToolPolicy is additive over `@deepseek-ai/dsh-permission-presets` and `@deepseek-ai/dsh-sandbox-policy`.
- Do not skip the per-package obligations.

## Report

Report: new packages + versions, API surface mounted, snapshot scenarios, Agent Notes, gate results. Do NOT proceed to Phase 3 until this is accepted.
