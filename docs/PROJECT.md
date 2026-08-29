# PROJECT.md — App Builder on DeepSeek Harness

English | [中文](PROJECT.zh.md)

> Canonical source of truth for the project's architecture, data model, and API. The agent MUST read this before starting a phase and MUST update it when behavior, schema, or API changes. This document supersedes `planning/PROJECT.md`, which is kept only as a redirect.

## 1. Mission

Turn DeepSeek Harness (dsh) — already a working developer preview of a coding-agent harness — into a self-hosted, local-first AI application builder: a user types a natural-language prompt and gets a working, previewable, deployable full-stack app. dsh IS the App Builder; the work here extends dsh as plugins and bundles, not a parallel product.

## 2. Constraints

1. **Local + single-user first.** Design every seam for later multi-user scale, but do not build multi-user features yet.
2. **Extend dsh via plugins. NEVER fork it.** Pin the version (0.1.1-rc.2); dsh ships breaking changes and does not accept external PRs.
3. **Safety is a system property, not a model property.** Landlock/bwrap/Seatbelt/Windows-ACL sandboxing, least privilege, and approval gates are required, not optional.
4. **Never expose dsh's local RPC to end users.** The control plane is the auth boundary.
5. **All work stays inside the authorized workspace.** Never touch credentials, home-dir config, or other projects.
6. **Treat all dsh catalog gates as binding.** Every new package MUST satisfy verify-cordis-config, verify-export-jsdoc, verify-package-invariants, verify-tool-catalog, verify-config-catalog, verify-persistence-catalog, verify-module-graph, verify-scoped-events, verify-doc-budgets, verify-doc-site-fragments, verify-runtime-closure, verify-client-packages, verify-node-next-types, verify-md-links, verify-doc-refs, and the per-file 100% coverage gate.

## 3. Architecture

Two planes, mirroring dsh's existing model:

- **Control plane** — `apps/web` (the GUI we are sitting in) + a new `packages/bundle/app-builder` that patches over `packages/bundle/base`. Owns the chat UI, project list, deployment status, and preview iframe. Future multi-tenancy lives here.
- **Data plane** — one dsh runtime per project, driven by the App Builder bundle. The agent edits files, runs shell, starts the dev server. We proxy the dev-server port to the preview pane.

```
+-----------------------------------------------------+
|  Control Plane  (apps/web + bundle/app-builder)     |
|  Chat UI · Projects · Sessions · Auth · Deploy       |
|  Event log (source of truth) -> session-query FTS5  |
+---------------------------+-------------------------+
                            | REST + SSE (via Typert RPC gateway)
+---------------------------v-------------------------+
|  Data Plane  (dsh runtime per project)               |
|  Per-project sandbox (bwrap > Landlock > Seatbelt)  |
|  dsh session · scaffold · preview · deploy plugins   |
|  Models: V4-Pro (planner) / V4-Flash (worker)        |
+-----------------------------------------------------+
```

### Tech stack (real, not aspirational)

- **Monorepo**: dsh pnpm workspace (`packages/*/*`, `vendor/*`, `native/landlock-run`, `apps/*`, `examples/`, `website`).
- **Build**: TypeScript 6, tsdown bundler, two TS faces (`host` + `client`).
- **Frontend**: React 18, Vite, served by `dsh-host-frontend-static`.
- **Event log**: append-only JSONL with zstd compression (`@deepseek-ai/dsh-session-persistence-jsonl`).
- **Session index**: dedicated SQLite FTS5 database (`@deepseek-ai/dsh-session-query-sqlite`).
- **Plugin framework**: vendored Cordis at `vendor/cordis`.
- **Sandbox**: `@deepseek-ai/node-addon-landlock-run` (Linux Landlock), `@deepseek-ai/dsh-bash-sandbox` + `dsh-pwsh-sandbox` consumers, `dsh-fs-sandbox` mode fence.
- **Wire transport**: JSON-RPC 2.0 over stdio (`@deepseek-ai/dsh-sdk-protocol`) + Typert RPC HTTP gateway (`@deepseek-ai/dsh-api-gateway` + `dsh-api-remotes`).

### Model tiering (real, not aspirational)

Already per-agent via `agents[].provider` + `agents[].model` in `cordis.yml` or `ctx.agents.installModelSelection()` at runtime. DeepSeek V4-Pro and V4-Flash ship via `@deepseek-ai/dsh-llm-deepseek`. The orchestrator/worker composition uses either `ctx.subagents` (in-process providers: spawn, fork, acp, claude-code, codex, dsh-sdk) or `ctx.workflowEngine` (worker-thread engine with a typed `agent()` hook).

Cache-aware cost tracking: `@deepseek-ai/dsh-token-meter` records per-session `prompt_cache_hit_tokens`. Phase 3 enforces quotas on top.

## 4. Data model

dsh already has Session (event log) and Event (the append-only entries). The App Builder adds two first-class entities:

| Entity | dsh equivalent | Notes |
| --- | --- | --- |
| User | none | Anonymous identity via `@deepseek-ai/dsh-anonymous-user-id` for Phase 1/2. Phase 3 introduces real auth. |
| Project | partial — Session carries `cwd` | New entity wrapping one or more sessions with metadata (name, stack, git_url, dsh_profile). |
| Session | `@deepseek-ai/dsh-session` Session | One per chat thread; the event log is the source of truth; `SessionHeader` carries cwd/lineage/seedLength/delegationDepth/agentPreset. |
| Event | `@deepseek-ai/dsh-session` SessionEvent | Closed-union event types. |
| Deployment | none | New; lifecycle events `deployment_started/succeeded/failed` are appended to the Session log. |
| ToolPolicy | partial — `permission-presets` + `sandbox-policy` + `tools/pre-execute` + `tools/guard` | New typed schema (`@deepseek-ai/dsh-app-builder-tool-policy`); runtime enforcement already exists. |

### Event types (used by App Builder; all defined by dsh)

`session/created`, `session/disposed`, `turn/start`, `turn/end`, `step/start`, `step/end`, `tool/call`, `tool/result`, `user/message`, `assistant/message`, `assistant/chunk`, `approval/asked`, `approval/decided`, `permissionPresets/preset`, `sandbox/mode`, `command/run`, `command/done`, `session/title`, `session/inbox/spliced`, `agent/created`, `agent/disposed`, `agent/session-start`. New App Builder events: `deployment/started`, `deployment/succeeded`, `deployment/failed`, `project/created`, `toolPolicy/decision`.

## 5. API

App Builder API surfaces mount on dsh's existing transport stack — not on a parallel HTTP layer.

**Wire layer** (existing): `@deepseek-ai/dsh-sdk-protocol` (JSON-RPC 2.0 over stdio) + `dsh-sdk-client` (TS) + Python SDK + ACP server.

**HTTP layer** (new for App Builder): Typert RPC gateway at `packages/api/gateway` + `packages/api/remotes` exposes the App Builder methods. SSE is an addition over the existing `session/projection` push frame.

### Endpoints (Typert Remote service `@deepseek-ai/dsh-app-builder-api`)

```
POST   /projects                          create project (spawns dsh sandbox)
GET    /projects                          list projects
GET    /projects/:id                      project + session list
POST   /projects/:id/sessions             start a session
POST   /sessions/:id/messages             send a prompt -> agent
GET    /sessions/:id/events              SSE stream of the live event log
GET    /sessions/:id/transcript           full conversation projection
POST   /sessions/:id/fork                 fork the log into a new session
POST   /sessions/:id/resume               resume a paused session
GET    /projects/:id/preview             current preview URL + screenshot
POST   /projects/:id/deploy               deploy (gated: SAST/SCA/secrets)
GET    /users/:id/usage                   token + cost, cache-aware
```

## 6. Plugin spec (dsh Cordis plugins)

Plugins are Cordis plugins: a module that declares needed services and registers tools, with tracked side effects. Service packages default-export their service class; function plugins named-export `name` / `inject` / `Config` / `apply` and have NO default export.

### Scaffold tool (`@deepseek-ai/dsh-app-builder-scaffold`)

Composes `@deepseek-ai/dsh-tool-fs` + `@deepseek-ai/dsh-tool-str-replace-editor` + `@deepseek-ai/dsh-tool-bash`. Inputs: `template`, `name`, `stack`, `features`. Validate with Zod (via schemastery Config). Restrict writes to the project's `cwd`. Optional `npm install` step.

### Preview tool (`@deepseek-ai/dsh-app-builder-preview`)

Starts the project's dev server on a free port via `dsh-tool-bash` `run_in_background: true`; waits for readiness (HTTP poll helper — NEW); returns URL + console tail. Optional headless-browser screenshot (Playwright or similar — NEW). Bind to localhost only. Tool-managed job via `dsh-tool-jobs`.

### Deploy tool (`@deepseek-ai/dsh-app-builder-deploy`)

`git init -> commit -> push` (or ZIP export). **Deterministic gates** run before any deploy: SAST (`dsh-tool-bash` calling a bundled scanner), SCA (dependency audit), secrets scan (greps / pattern matchers). Approval via `ctx.approval`. Append `deployment/{started,succeeded,failed}` to the Session log.

### ToolPolicy manifest (`@deepseek-ai/dsh-app-builder-tool-policy`)

Typed schema:

```ts ignore-check
interface ToolPolicy {
  id: string
  tool: string                      // tool name as registered in ctx.tools
  allow: ('read' | 'write' | 'execute' | 'network' | 'credential')[]
  ask:   ('read' | 'write' | 'execute' | 'network' | 'credential')[]
  scope?: {
    paths?: string[]                 // restricted paths for fs tools
    commands?: string[]              // allowed command prefix list
    hosts?: string[]                 // allowed host:port for network tools
    credentials?: string[]           // declared credential references
  }
}
```

Enforcer: a `tools/pre-execute` listener that consults `ctx.toolPolicy.for(toolName)` and converts the typed policy into a `PreToolDecision`. Falls back to `ctx.permissionPresets.current(events)`. Audit: every decision becomes a `toolPolicy/decision` event (log-only).

**Important**: like `ctx.tools.restrict()`, this is intent + audit, NOT authority. Real authority comes from sandbox-mode fences and capability seams.

### Bundle (`packages/bundle/app-builder`)

A new bundle that patches over `packages/bundle/base`. Adds: App Builder persona, the new tools (scaffold/preview/deploy/tool-policy), the new entities (project/deployment) as Cordis plugins, the API surface mount, the web UI hook. Ships `cordis.patch.yml` that references the new packages. Profiles that select `app-builder` get it on top of base.

## 7. Security & guardrails (real, not aspirational)

- **Least privilege per tool** via the existing `tools/pre-execute` + `tools/guard` pipeline; the new ToolPolicy package adds a typed schema on top.
- **Three-mode sandbox vocabulary** (`read-only | workspace-write | danger-full-access`) is the canonical authority boundary; the App Builder enforces it per-project via `@deepseek-ai/dsh-sandbox-policy`.
- **Sandbox provider** is selected by `@deepseek-ai/dsh-sandbox-local`: bwrap > Landlock > Seatbelt > Windows ACL. **Fail closed**: no silent unconfined fallback.
- **Landlock binary** (`@deepseek-ai/node-addon-landlock-run`) is statically linked musl; NO env-var overrides for which binary confines; NO install-time build fallback.
- **Credentialed web requests reject redirects before contact** (`redirect: 'error'` per `packages/web/AGENTS.md`); anonymous fetch follows same-origin redirects up to 5 hops.
- **Web fetch SSRF**: `@deepseek-ai/dsh-web-fetch-http` explicitly does NOT protect against SSRF. App Builder deployments MUST be behind an egress proxy (Phase 3).
- **All tool output is untrusted model output** until validated through the tool's declared output schema (`ctx.tools.register`); `dsh-tool-fs-observation-policy` adds read-before-write/edit.
- **Deterministic deploy gates**: SAST, SCA, secrets scan before any push.
- **Bound every loop**: `dsh-tool-call-timeout-policy` + `dsh-repeat-tool-reminder`; Phase 3 adds `dsh-app-builder-quota`.
- **Never install plugins/skills/MCP servers without inventory + review** (per root AGENTS.md).
- **Human approval** on deploy, credential changes, destructive operations.

## 8. Phases (revised to match reality)

### Phase 0 — Acceptance gate, no new code (0.5 day)

- Pin the dsh version (`0.1.1-rc.2`); record release cadence.
- Verify Node 22.19+ + pnpm 11.7.0.
- Run `pnpm dsh --profile headless 'create a hello-world app'` with `DEEPSEEK_API_KEY`. Capture the JSONL.
- Run `pnpm run doc-sync` + `pnpm run hygiene` to confirm zero gate failures on the current tree.
- Relocate this file: `planning/PROJECT.md` -> `docs/PROJECT.md` (already done).
- Decide bundle location: `packages/bundle/app-builder/` (recommended).

### Phase 1 — App Builder MVP (1–2 weeks)

Goal: prompt -> running app with live preview, locally, no auth.

- New bundle `packages/bundle/app-builder/cordis.patch.yml` over `base`.
- New packages under `packages/app-builder/`:
  - `dsh-app-builder-project` (Project entity + projection unit).
  - `dsh-app-builder-scaffold` (~150 LOC; composes fs + bash + str-replace-editor).
  - `dsh-app-builder-preview` (readiness probe + headless screenshot; composes bash + jobs).
  - `dsh-app-builder-persona` (App Builder persona via `dsh-persona`).
- New example `examples/app-builder/`:
  - `cordis.yml` + `cordis.snapshot.yml`.
  - `tests/e2e/keyless-smoke.spec.ts` (boots via `dsh-loader-smoke`).
  - `tests/e2e/with-key-smoke.spec.ts` (sends a real prompt, verifies scaffold + preview).
- Wire `apps/web` to show the App Builder UI (project list + chat + preview iframe).
- Snapshot scenarios: `cordis.yml`, `scaffold-hello-world`, `preview-dev-server`, `preview-iterate`.
- Agent Notes: one per non-trivial package.

### Phase 2 — Productize the control plane (2–4 weeks)

Goal: a real product around dsh, still single-user but scale-ready.

- Add `packages/app-builder/deployment` (Deployment entity + `deploy` tool + SAST/SCA/secrets gates).
- Add `packages/app-builder/tool-policy` (typed `ToolPolicy` schema + `tools/pre-execute` listener).
- Add `packages/app-builder/api` (Typert Remote service: REST + SSE).
- Mount the API via existing `dsh-api-gateway` + `dsh-api-remotes`.
- Add a `Project` projection unit + projection cache for the projects list pane.
- Update `apps/web` with project list, deployment status pane, preview iframe with `EventSource` for live updates.
- Snapshot scenarios: `deploy-local`, `tool-policy-allow`, `tool-policy-deny`, `api-list-projects`.

### Phase 3 — Multi-user scale (2–4 weeks)

Goal: isolated tenants on one deployment.

- Add `packages/app-builder/auth` (control-plane auth boundary).
- Add `packages/app-builder/egress-proxy` (HTTP egress per project with rate limit; required because Landlock cannot restrict network).
- Add `packages/app-builder/quota` (per-user token / cost / retry / session budgets).
- Wire per-project dsh worker processes (one process per project).
- Per-user memory partitioning at the storage layer.
- Per-project preview proxying via `dsh-host-apiproxy`.
- CI deploy path gated by approval.
- Snapshot scenarios: `multi-tenant-isolation`, `quota-enforced`, `deploy-gated`.

## 9. Definition of done (per phase)

- **Phase 0**: version pinned; hello-world prompt completes; `pnpm run doc-sync` clean; this document relocated.
- **Phase 1**: prompt -> scaffold -> run -> preview -> iterate -> resume works locally, sandboxed.
- **Phase 2**: full chat loop, event-sourced sessions, ToolPolicy enforcement, deploy path with gates, REST/SSE API.
- **Phase 3**: isolated multi-tenant sandboxes, quotas, gated deploys, auditable.

## 10. Testing & evaluation

Per `docs/testing.md`:

- **Unit**: `pnpm run test` (vitest over package `tests/**` + `scripts/**/*.spec.ts`).
- **Coverage gate**: `pnpm run test:coverage` (per-file 100% on `packages/*/*/src`).
- **Real-API e2e**: `pnpm run test:e2e` (self-skips without `DEEPSEEK_API_KEY`).
- **Snapshot**: `pnpm run test:snapshot` (ACP + headless JSONL scenarios).
- **Web browser snapshot**: `pnpm run test:web` (Chromium compares replayed browser output; Linux PR gate).
- **Doc sync**: `pnpm run doc-sync`.
- **Hygiene**: `pnpm run hygiene` (knip + publint + workspace constraints + NodeNext consumer check).

Per-package invariants:

- Real-composition tests (Loader-driven `cordis.yml` boots, not unit-style mocks).
- Snapshot test for every non-trivial model- or product-user-visible change.
- Agent Note for every non-trivial change (only mechanical/local edits exempt).
- Bilingual docs (zh.md + i18n.yaml).
- Per-package `./invariant` companion (registers manifest name + event/data relation check).

### Adversarial test suite

- Prompt injection (model input that bypasses ToolPolicy).
- TOCTOU via symlinks (fs-sandbox + bash-sandbox drift).
- Redirect smuggling (credentialed web providers).
- Resource exhaustion (unbounded loops, missing timeout-policy).
- Cost runaway (Phase 3 quota package).

## 11. Decisions

The following decisions are resolved. Re-evaluation triggers are noted where migration cost is bounded.

| Question | Decision | Re-evaluation trigger |
|---|---|---|
| Workspace group | New group `packages/app-builder/` (under `packages/`). | None — orthogonal to existing groups. |
| API style | Typert RPC + JSON-RPC. The control plane exposes REST + SSE endpoints through a Typert Remote service; the underlying transport is JSON-RPC 2.0 over stdio + the Typert RPC gateway. | If the App Builder needs browser-native WebSocket (not SSE), add WebSocket transport through the existing `packages/api/remotes` machinery without breaking JSON-RPC clients. |
| UI shell | Branch in git (NOT a permanent workspace copy). Create a tag `apps-web-classic-pre-app-builder` immediately before starting the reskin. The reskin happens on a feature branch; the tag is the safety net. | If the App Builder UI needs to run side-by-side with the classic UI for a multi-week staged rollout, copy `apps/web` to `apps/app-builder-web` (Option B) with a deprecation timeline: move `apps/web` to `apps/web-classic` in Phase 2; delete in Phase 3. |
| Headless driver | `pnpm dsh --profile headless` (existing dsh headless profile). The App Builder's automation tests + non-interactive flows run through this surface; `examples/headless-agent` is the canonical pattern. | None — already shipped. |
| Egress proxy (Phase 3) | Small Node-based proxy in `packages/app-builder/egress-proxy/`. Re-uses dsh primitives: `ctx.sessionQuery` for the allow-list snapshot, `dsh-token-meter` for rate-limit buckets, `dsh-host-apiproxy` as the model. Audit log goes through the dsh event log. | Migrate to external Squid if any of: (a) need for TLS termination in the proxy, (b) need for ICAP content scanning (secrets / DLP), (c) throughput ceiling (proxy becomes the bottleneck), (d) compliance requirement (Squid is the only approved egress in some orgs). Migration cost: replace the Node server with Squid config; the allow-list store + rate-limit logic stays in dsh as a control-plane API that Squid calls via `external_acl_type`; the audit log stays in dsh. |
| Quota package (Phase 3) | Wrap and extend `@deepseek-ai/dsh-token-meter` in `packages/app-builder/quota/`. The wrapper is NOT a passive observer; it is a `tools/post-execute` listener that calls `meter.record(...)` + `checkBudget(...)` synchronously. dsh-token-meter does accounting; the wrapper does enforcement (budgets, alerts, hard-stops). | Re-evaluate if `dsh-token-meter`'s API becomes inadequate for the App Builder's budget composition (e.g., per-tool token accounting). Either extend dsh-token-meter upstream, or build the quota package fresh and have it own the accounting too. |

Each decision in this table is reflected in the relevant Phase prompt (Phase 1 prompt / Phase 2 prompt / Phase 3 prompt). When a decision changes, update this table AND the corresponding prompt in the same change.

## 12. Inspect artifacts

Step-by-step inspection findings for this plan are in `planning/inspect/01..17-*.md` + `SUMMARY.md` + `INDEX.md`. Every plan mismatch identified during inspection is tracked in `planning/inspect/14-gap-analysis.md`.

## 13. Phase 0 acceptance status

Phase 0 (the acceptance gate with no new code) is **accepted with caveats**. Evidence and per-task outcomes are in [`planning/inspect/17-phase0-acceptance-results.md`](../planning/inspect/17-phase0-acceptance-results.md); the inline digest is at the bottom of [`planning/Phase 0 prompt.md`](../planning/Phase%200%20prompt.md).

- **Version pinned:** `0.1.1-rc.2`. Every workspace package shares the version.
- **Hello-world smoke:** self-skipped without `DEEPSEEK_API_KEY` (CLI boots a mock fallback and the agent responds with a clarifying question — gate not failed).
- **Gates:** `pnpm install` PASS, `pnpm run build` PASS, `pnpm run typecheck` PASS, `pnpm run hygiene` PASS 13/13 in 97.81s (with `NODE_OPTIONS=--max-old-space-size=8192`), `pnpm run doc-sync` PASS 28/28 in 179.45s.
- **`docs/PROJECT.md` is canonical** with the bilingual pair; `planning/PROJECT.md` is a redirect.
- **Git anchors:** tag `apps-web-classic-pre-app-builder` pins the pre-Phase-1 UI state; branch `app-builder-web-reskin` carries the Phase 1 UI reskin.
- **Path B closure:** the in-scope flake category is cleared and the two stale `rescope-vendor` markers are dropped per the updated [`2026-08-28-rescope-marker-cleanup`](../.agents/notes/implemented/process/2026-08-28-rescope-marker-cleanup.md). The four test fixes + the path B broken-fix repair are in [`2026-08-29-windows-test-flake-fixes`](../.agents/notes/implemented/process/2026-08-29-windows-test-flake-fixes.md).

Residual `pnpm run test` failures (8 in 3 files, all out-of-scope per [`planning/inspect/15-phase0-pre-existing-failures.md §6.7`](../planning/inspect/15-phase0-pre-existing-failures.md)):

| Count | File | Bucket | Suggested fix |
|---|---|---|---|
| 6 | `packages/sandbox/sandbox-windows-acl/tests/runner.spec.ts` | Environmental (PowerShell 7 not installed at the resolver's standard location) | Install PowerShell 7 to `C:\Program Files\PowerShell\7\pwsh.exe` |
| 1 | `packages/shell/pwsh-sandbox/tests/sandbox.spec.ts > wraps the exact pwsh argv` | Same root cause | Same as above, or 1-line regex tolerance |
| 1 | `scripts/change-scope.spec.ts > renders deterministic versioned JSON` | Intermittent contention flake (passes in isolation) | Retry; if deterministic, follow path B pattern |

User owes the acceptance decision: accept the 8 deferred failures as out-of-scope for Phase 0 and proceed to Phase 1, OR install PowerShell 7 to clear the 7 environmental failures before Phase 1 begins.
