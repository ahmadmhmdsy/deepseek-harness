# DeepSeek Harness -> App Builder: Full Implementation Plan (revised)

> This plan reflects dsh's actual state, not an aspirational fresh-build view. The canonical source of truth is [docs/PROJECT.md](../docs/PROJECT.md); the inspection findings that drove these revisions live in `planning/inspect/01..14-*.md` + `SUMMARY.md`.

## 0. Vision & scope (revised)

Goal: extend the existing DeepSeek Harness (`dsh`) into a self-hosted, prompt-to-app builder (Replit/Lovable/Bolt style). A user types a prompt and gets a running, previewable, deployable full-stack app.

Constraints (real, not aspirational):

- dsh IS the App Builder. ~70% of the infrastructure the original plan described already exists as dsh packages.
- Local + single-user first. Design every seam for later multi-user scale, but do not build multi-user features in Phase 1.
- Extend dsh via plugins + bundles; NEVER fork dsh. Pin the version (0.1.1-rc.2) — dsh ships breaking changes.
- Safety is a system property: bwrap > Landlock > Seatbelt > Windows-ACL sandboxing, least privilege, approval gates, fail-closed invariants are non-negotiable.

Success criteria: a prompt -> scaffold -> run -> preview -> iterate -> export -> deploy loop that works reliably on one machine, then scales to isolated tenants.

## 1. Architecture overview (revised)

Two planes, mirroring dsh's existing model:

- **Control plane** — `apps/web` (the GUI) + a new `packages/bundle/app-builder` that patches over `packages/bundle/base`. Owns the chat UI, project list, deployment status, preview iframe. Future multi-tenancy lives here.
- **Data plane** — one dsh runtime per project, driven by the App Builder bundle. The agent edits files, runs shell, starts the dev server. The preview pane proxies the dev-server port.

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

- Monorepo: pnpm workspace (vendor/*, packages/*/*, native/landlock-run, apps/*, examples/, website).
- Frontend: React 18 + Vite + `@deepseek-ai/dsh-client-ui-*` slot packages.
- Event log: append-only JSONL with zstd compression (`@deepseek-ai/dsh-session-persistence-jsonl`).
- Session index: dedicated SQLite FTS5 database (`@deepseek-ai/dsh-session-query-sqlite`).
- Plugin framework: vendored Cordis at `vendor/cordis`.
- Sandbox: `@deepseek-ai/node-addon-landlock-run` + `@deepseek-ai/dsh-sandbox-local` (provider selection).
- Wire transport: JSON-RPC 2.0 over stdio (`@deepseek-ai/dsh-sdk-protocol`) + Typert RPC HTTP gateway (`@deepseek-ai/dsh-api-gateway`).
- Python SDK: `deepseek-harness` (mirror of TS SDK, same wire protocol).

## 2. Phase 0 — Acceptance gate, no new code (0.5–1 day)

Tasks:

- Pin dsh version (0.1.1-rc.2) in PROJECT.md and README.
- Verify Node 22.19+ + pnpm 11.7.0.
- Run `pnpm dsh --profile headless 'create a hello-world app'` with `DEEPSEEK_API_KEY`. Capture JSONL.
- Verify the four gates are green on the current tree:
  - `pnpm run typecheck`
  - `pnpm run test:coverage`
  - `pnpm run doc-sync`
  - `pnpm run hygiene`
- Confirm `docs/PROJECT.md` is the canonical source of truth; `planning/PROJECT.md` redirects.

Acceptance criteria:

- dsh version pinned and recorded.
- Hello-world prompt completes (or self-skips without key).
- All four gates pass.
- `docs/PROJECT.md` is canonical.

Guardrails: no new packages in this phase.

### Status — accepted with caveats (commit `519da740a2`)

Per-task evidence lives in [`inspect/17-phase0-acceptance-results.md`](inspect/17-phase0-acceptance-results.md); the inline digest lives at the bottom of [`Phase 0 prompt.md`](Phase%200%20prompt.md).

- **Version pinned** at `0.1.1-rc.2`.
- **Hello-world smoke** self-skipped without `DEEPSEEK_API_KEY` (CLI boots a mock fallback and the agent responds with a clarifying question — gate not failed).
- **Gates** (`build` + `typecheck` + `hygiene` + `doc-sync`) all PASS. `pnpm run hygiene` requires `NODE_OPTIONS=--max-old-space-size=8192` on this machine; `knip`'s `oxc-parser` exhausts the default V8 ArrayBuffer pool. Document the windows dev setup once a follow-up agent lands it.
- **`docs/PROJECT.md`** is canonical with the bilingual pair; `planning/PROJECT.md` is a redirect.
- **Git state:** tag `apps-web-classic-pre-app-builder` pinned at `9306f9371b`; branch `app-builder-web-reskin` at `519da740a2` ready for Phase 1 UI reskin.
- **Path B closure:** `519da740a2 test(windows): clear residual contention flakes and stale rescope markers` cleared the in-scope flake category and dropped the two stale `rescope-vendor` markers.

Residual `pnpm run test` failures (8 in 3 files, all out-of-scope per `inspect/15-phase0-pre-existing-failures.md §6.7`):

| Count | File | Bucket |
|---|---|---|
| 6 | `packages/sandbox/sandbox-windows-acl/tests/runner.spec.ts` | Environmental (PowerShell 7 not installed at the resolver's standard location; the AppX variant under `WindowsApps\` is invisible to the ACL-segregated runner) |
| 1 | `packages/shell/pwsh-sandbox/tests/sandbox.spec.ts > wraps the exact pwsh argv` | Same root cause |
| 1 | `scripts/change-scope.spec.ts > renders deterministic versioned JSON` | Intermittent contention flake (passes in isolation in 2.04s) |

User owes the acceptance decision: accept the 8 deferred failures as out-of-scope and proceed to Phase 1, OR install PowerShell 7 to clear the 7 environmental failures before Phase 1 begins.

## 3. Phase 1 — App Builder MVP (1–2 weeks)

Goal: prompt -> running app with live preview, locally, no auth.

### 3.1 Bundle

New bundle `packages/bundle/app-builder/` patches over `packages/bundle/base`. References the four new packages. Listed in `examples/package.json` per `verify-cordis-config`.

### 3.2 Project entity

`packages/app-builder/project/` — Cordis plugin that registers a `Project` entity + projection unit. Wire to `ctx.sessions` and `ctx.sessionQuery`. Emit `project/created`.

### 3.3 Scaffold tool

`packages/app-builder/scaffold/` — composes `dsh-tool-fs` + `dsh-tool-str-replace-editor` + `dsh-tool-bash`. Zod-validated inputs (`template`, `name`, `stack`, `features`). Writes restricted to project `cwd`. Optional `npm install`.

### 3.4 Preview tool

`packages/app-builder/preview/` — starts dev server via `dsh-tool-bash` `run_in_background`; waits for readiness (NEW HTTP-poll helper); optional headless screenshot (NEW). Localhost bind. Job lifecycle via `dsh-tool-jobs`.

### 3.5 App Builder persona

`packages/app-builder/persona/` — uses `dsh-persona` to scope an App Builder agent.

### 3.6 Example

`examples/app-builder/` — `cordis.yml`, `cordis.snapshot.yml`, `tests/e2e/keyless-smoke.spec.ts` (boots via `dsh-loader-smoke`), `tests/e2e/with-key-smoke.spec.ts` (real prompt + verify scaffold + preview).

### 3.7 Web UI

`apps/web` — project list pane (uses new projection unit), re-use chat pane from `dsh-client-ui-conversation`, preview iframe pane bound to per-project dev server URL.

### 3.8 Snapshot scenarios

`cordis.yml`, `scaffold-hello-world`, `preview-dev-server`, `preview-iterate`.

### 3.9 Per-package obligations

Every new package ships: `tests/`, `./invariant`, README + JSDoc with `Model Experience` + `Known Limitations and Deferred Work`, real-composition test, per-file 100% coverage on `src`, bilingual README, catalog registration, tsconfig extending `tsconfig.base.json` (or `.client.json`), Agent Note.

### Acceptance criteria

- Prompt a full-stack app -> scaffolds -> dev server runs -> preview renders.
- Iterate conversationally; edits apply and preview updates.
- Resume a session after restart.
- Sandbox enforced (mode = `workspace-write`); approvals gate destructive ops.
- All five verification commands pass.

Guardrails: no credentials in the sandbox; cost limits on (via `dsh-token-meter`); single-user only.

## 4. Phase 2 — Productize the control plane (2–4 weeks)

Goal: a real product around dsh, still single-user but scale-ready.

### 4.1 Deployment package

`packages/app-builder/deployment/` — `Deployment` entity + `deploy` tool + SAST/SCA/secrets gates. Approval via `ctx.approval`. Emit `deployment/{started,succeeded,failed}`.

### 4.2 ToolPolicy manifest

`packages/app-builder/tool-policy/` — typed `ToolPolicy` schema + `tools/pre-execute` listener. Falls back to `ctx.permissionPresets.current(events)`. Audit event `toolPolicy/decision`. **Intent + audit, not authority** — real authority is sandbox-mode fences.

### 4.3 API surface

`packages/app-builder/api/` — Typert Remote service exposing REST + SSE endpoints. Mount via existing `dsh-api-gateway` + `dsh-api-remotes`. **Do not add a new HTTP layer.**

### 4.4 Projection unit + cache

Add a `project` projection unit in `packages/app-builder/project/` (extends Phase 1). Wire cache via `dsh-session-projection-cache`.

### 4.5 Web UI

Update `apps/web` with project list pane, deployment status pane, preview iframe with `EventSource`.

### 4.6 Snapshot scenarios

`deploy-local`, `deploy-blocked-by-gates`, `tool-policy-allow`, `tool-policy-deny`, `api-list-projects`.

### 4.7 Acceptance criteria

- Chat UI drives the full loop end-to-end.
- Sessions resume/fork/replay from the event log.
- Every tool call is policy-checked and logged with traceability.
- Deploy path works and generated code passes gates.
- All five verification commands pass.

Guardrails: approval gate on deploy; secrets never reach the agent filesystem.

## 5. Phase 3 — Multi-user scale (2–4 weeks)

Goal: isolated tenants on one deployment.

### 5.1 Auth

`packages/app-builder/auth/` — control plane becomes the auth boundary. Use `dsh-anonymous-user-id` as base; add real auth.

### 5.2 Egress proxy

`packages/app-builder/egress-proxy/` — per-project HTTP egress with allow-list + rate limit. **Required** because Landlock cannot restrict network.

### 5.3 Quota

`packages/app-builder/quota/` — per-user budgets (tokens, cost, retries, sessions). Wrap + extend `dsh-token-meter`. Cache-aware pricing. Alerts + hard-stop.

### 5.4 Worker pool

One `dsh` process per project. Started/stopped by the control plane via the existing `dsh` CLI bin.

### 5.5 Memory isolation

Per-user `$DSH_HOME`; per-user `session-query-sqlite` derived index; per-project session directory under user's home.

### 5.6 Preview proxying

Per-project preview proxying via `dsh-host-apiproxy`. Rate-limited per user.

### 5.7 Deployment pipeline

`git push -> CI -> target` per project behind approval.

### 5.8 Snapshot scenarios

`multi-tenant-isolation`, `quota-enforced`, `egress-proxy-blocked`, `deploy-gated`.

### 5.9 Acceptance criteria

- Two concurrent users build apps in isolated sandboxes with no cross-talk.
- Quotas enforced.
- Deployments gated and auditable.
- All five verification commands pass.

## 6. Agent design rules (apply in every phase)

Do:

- Planner/orchestrator + worker agents, not one big agent.
- Validate and sanitize all model input; structured outputs with schemas.
- Least privilege per tool; reads separated from writes.
- Isolated disposable sandboxes; secrets outside the agent filesystem.
- Log everything with traceability; deterministic gates before deploy.
- Human approval on deploy, credentials, destructive ops.
- Bound every loop (retries, tool chains, recursion); enforce cost limits.

Don't:

- No wildcard/unrestricted tool access.
- No trusting external content (prompt injection).
- No arbitrary code without sandboxing.
- No plaintext secrets or PII in logs.
- No unbounded loops or retries.
- No connecting production tools before staging.
- No installing plugins/skills/MCP servers without inventory + review.
- No 'the model will be careful' as a control.

## 7. Testing & evaluation

- Test harness: run the App Builder against a fixed suite of prompts (todo app, CRUD, auth, API integration); assert the app builds, runs, and passes basic checks.
- Snapshot tests via `examples/app-builder/` (keyless + with-key smokes + per-package fixtures).
- Per-file 100% coverage on `packages/*/*/src`.
- Adversarial tests: prompt injection, malicious uploads, resource exhaustion, SSRF, redirect smuggling.
- Track per-session token + cost, cache-aware, with alerts.

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| dsh breaking changes | Pin version; extend via plugins; track release notes |
| Unsigned plugins / no permission model | Build ToolPolicy manifest; review plugins before install |
| dsh RPC has no auth | Never expose it; control plane is the auth boundary |
| Prompt injection from external content | Sanitize inputs; isolate context |
| Cost runaway (peak pricing) | Per-session budgets, cache-aware pricing, alerts |
| Security incident at multi-user | Hard sandboxing (Landlock fail-closed), least privilege, approvals, adversarial testing |
| SSRF on web fetch | Egress proxy in Phase 3; document for Phase 1/2 |
| Credentialed redirect smuggling | `redirect: 'error'` (already enforced); regression tests |

## 9. Definition of done (per phase)

- Phase 0: version pinned; hello-world prompt completes; gates clean.
- Phase 1: prompt -> scaffold -> run -> preview -> iterate -> resume works locally, sandboxed.
- Phase 2: full chat loop, event-sourced sessions, ToolPolicy enforcement, deploy path with gates, REST/SSE API.
- Phase 3: isolated multi-tenant sandboxes, quotas, gated deploys, auditable.

## 10. Inspect artifacts

Step-by-step inspection: `planning/inspect/01..14-*.md`.
Executive summary: `planning/inspect/SUMMARY.md`.
Gap analysis (the source of this revision): `planning/inspect/14-gap-analysis.md`.
Plan-fix report (what changed in this rewrite): `planning/inspect/16-plan-fix-report.md`.
