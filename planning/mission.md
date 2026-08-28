# PROJECT MISSION: DeepSeek Harness -> App Builder (revised)

> Revised to reflect dsh's actual state. The canonical source of truth is [docs/PROJECT.md](../docs/PROJECT.md). The phase-by-phase task prompts are [Phase 0 prompt.md](Phase 0 prompt.md), [Phase 1 prompt.md](Phase 1 prompt.md), [Phase 2 prompt.md](Phase 2 prompt.md), [Phase 3 prompt.md](Phase 3 prompt.md).

## Mission

You are extending DeepSeek Harness (`dsh`) — already a working developer preview of a coding-agent harness — into a self-hosted, local-first AI application builder (Replit/Lovable/Bolt style). A user types a natural-language prompt and gets a working, previewable, deployable full-stack app.

**Key insight**: dsh IS the App Builder. The repo at `E:\js_projects\my_deepseek_harness\deepseek-harness` is dsh source. We are not building a new product on top of dsh; we are extending dsh with one new bundle, several new packages, one new example, and a re-skinned web UI.

## Non-negotiable constraints

1. **Local + single-user first.** Design every seam for later multi-user scale, but do NOT build multi-user features in Phase 1.
2. **Extend dsh via plugins + bundles. NEVER fork dsh.** Pin the version (0.1.1-rc.2). dsh ships breaking changes.
3. **Safety is a system property, not a model property.** Landlock/bwrap/Seatbelt/Windows-ACL sandboxing, least privilege, approval gates, fail-closed invariants are required, not optional.
4. **Never expose dsh's local RPC to end users.** The control plane is the auth boundary.
5. **All work stays inside the authorized workspace.** Never touch credentials, home-dir config, or other projects.
6. **No `apps/control-plane` + `apps/worker`.** dsh's mental model is one app (`apps/web`) + bundle patches. New App Builder work is a new bundle (`packages/bundle/app-builder/`) over `packages/bundle/base/`.
7. **No `packages/plugins`.** dsh's plugin namespace is the existing capability groups under `packages/`. New App Builder work is a new group (`packages/app-builder/`).

## Architecture

Two planes:

- **Control plane** (our product): web UI (chat, projects, sessions, deployment, preview iframe), auth, project/session store, event log index. Mounts over `apps/web` + a new `packages/bundle/app-builder/`.
- **Data plane** (dsh runtime per project): one isolated dsh session per project. The agent edits files, runs shell, starts the dev server. The preview pane proxies the dev-server port.

Recommended stack (real, not aspirational):

- TypeScript monorepo (matches dsh), Node 22.19+, pnpm 11.7.0.
- React frontend (existing `packages/client/*` UI slot packages).
- Append-only JSONL event log + dedicated SQLite FTS5 index (existing).
- Landlock/bwrap/Seatbelt/Windows-ACL sandbox isolation (existing + new egress proxy in Phase 3).
- dsh as the worker (pinned version).

Recommended model tiering: DeepSeek V4-Pro as planner (existing `agents[].provider: 'deepseek-official'`, `model: 'deepseek-v4-pro'`), V4-Flash as the worker (`model: 'deepseek-v4-flash'`).

## Execute in this order

### PHASE 0 — Acceptance gate, no new code (0.5–1 day)

- Confirm dsh version pinned (0.1.1-rc.2).
- Run `pnpm dsh --profile headless 'create a hello-world app'` with `DEEPSEEK_API_KEY`. Capture JSONL.
- Verify all four gates pass on the current tree: `pnpm run typecheck && pnpm run test:coverage && pnpm run doc-sync && pnpm run hygiene`.
- Confirm `docs/PROJECT.md` is canonical.

ACCEPT: version pinned, hello-world prompt completes, gates clean. Keep approvals on and run inside the sandbox.

### PHASE 1 — App Builder MVP (1–2 weeks)

Goal: prompt -> running app with live preview, locally, no auth.

1. New bundle `packages/bundle/app-builder/cordis.patch.yml` over `packages/bundle/base/`.
2. New packages under `packages/app-builder/`:
   - `dsh-app-builder-project` (Project entity + projection unit).
   - `dsh-app-builder-scaffold` (~150 LOC; composes `dsh-tool-fs` + `dsh-tool-str-replace-editor` + `dsh-tool-bash`).
   - `dsh-app-builder-preview` (readiness probe + optional headless screenshot; composes `dsh-tool-bash` background + `dsh-tool-jobs`).
   - `dsh-app-builder-persona` (App Builder persona via `dsh-persona`).
3. New example `examples/app-builder/` with keyless + with-key smokes (boots via `dsh-loader-smoke`).
4. Update `apps/web` with project list + chat + preview iframe.
5. Per-package obligations: `tests/`, `./invariant`, README + JSDoc with `Model Experience` + `Known Limitations and Deferred Work`, real-composition test, per-file 100% coverage on `src`, bilingual README, catalog registration, Agent Note.
6. Snapshot scenarios: `cordis.yml`, `scaffold-hello-world`, `preview-dev-server`, `preview-iterate`.

ACCEPT: prompt a full-stack app -> it scaffolds -> dev server runs -> preview renders -> iterate conversationally -> resume after restart. Sandbox enforced (mode = `workspace-write`); approvals gate destructive ops. No credentials in the sandbox; cost limits on (`dsh-token-meter`). All five verification commands pass.

### PHASE 2 — Productize the control plane (2–4 weeks)

Goal: a real product around dsh, still single-user but scale-ready.

1. Add `packages/app-builder/deployment` (Deployment entity + `deploy` tool + SAST/SCA/secrets gates).
2. Add `packages/app-builder/tool-policy` (typed `ToolPolicy` schema + `tools/pre-execute` listener; falls back to `ctx.permissionPresets`; emits `toolPolicy/decision`).
3. Add `packages/app-builder/api` (Typert Remote service exposing REST + SSE; mount via existing `dsh-api-gateway` + `dsh-api-remotes`).
4. Add a `project` projection unit + cache (`dsh-session-projection-cache`).
5. Update `apps/web` with project list, deployment status pane, preview iframe with `EventSource` for live updates.
6. Snapshot scenarios: `deploy-local`, `deploy-blocked-by-gates`, `tool-policy-allow`, `tool-policy-deny`, `api-list-projects`.
7. Update `docs/PROJECT.md` with schema/API changes.

ACCEPT: chat UI drives the full loop end-to-end; sessions resume/fork/replay; every tool call policy-checked and logged with traceability; deploy path works and passes gates. All five verification commands pass.

### PHASE 3 — Multi-user scale (2–4 weeks)

Goal: isolated tenants on one deployment. **Do NOT start until Phases 0–2 are accepted.**

1. Add `packages/app-builder/auth` (control-plane auth boundary).
2. Add `packages/app-builder/egress-proxy` (HTTP egress per project with allow-list + rate limit; required because Landlock cannot restrict network).
3. Add `packages/app-builder/quota` (per-user budgets; wrap + extend `dsh-token-meter`; cache-aware pricing).
4. Wire per-project dsh worker processes (one process per project, started/stopped by the control plane).
5. Per-user memory partitioning at the storage layer.
6. Per-project preview proxying via `dsh-host-apiproxy`.
7. CI deploy path gated by approval.
8. Snapshot scenarios: `multi-tenant-isolation`, `quota-enforced`, `egress-proxy-blocked`, `deploy-gated`.
9. Update `docs/PROJECT.md` with final architecture.

ACCEPT: two concurrent users build apps in isolated sandboxes with no cross-talk; quotas enforced; deployments gated and auditable. All five verification commands pass.

## Agent design rules (apply in every phase)

DO:

- Use planner/orchestrator + worker agents, not one big agent.
- Validate and sanitize all model input; use structured outputs with schemas.
- Apply least privilege per tool; separate reads from writes.
- Run in isolated disposable sandboxes; keep secrets outside the agent filesystem.
- Log everything with traceability; run deterministic gates before deploy.
- Get human approval on deploy, credentials, destructive ops.
- Bound every loop and enforce cost limits.

DON'T:

- No wildcard/unrestricted tool access.
- No trusting external content (prompt injection).
- No arbitrary code without sandboxing; never full-access mode.
- No plaintext secrets or PII in logs.
- No unbounded loops or retries.
- No connecting production tools before staging.
- No 'the model will be careful' as a control.
- No installing plugins/skills/MCP servers without inventory + review.

## Testing & evaluation

- Build a test harness: run the agent against a fixed suite of prompts (todo app, CRUD, auth, API integration); assert the app builds, runs, and passes basic checks.
- Trace which tools/strategies the agent picks; measure quality over time.
- Run adversarial tests (prompt injection, malicious uploads, resource exhaustion, SSRF, redirect smuggling) after every prompt/tool/memory/model change.
- Track per-session token + cost, cache-aware, with alerts.

## Definition of done

- Phase 0: version pinned; hello-world prompt completes; gates clean.
- Phase 1: prompt -> scaffold -> run -> preview -> iterate -> resume works locally, sandboxed.
- Phase 2: full chat loop, event-sourced sessions, ToolPolicy enforcement, deploy path with gates, REST/SSE API.
- Phase 3: isolated multi-tenant sandboxes, quotas, gated deploys, auditable.

## Your first action

Start with PHASE 0. Inspect the environment (OS, Node version, dsh availability, disk, git state), verify the gates, confirm version pinning, and confirm `docs/PROJECT.md` is canonical. Report what you find and your decisions before making substantial changes. Do not jump ahead to Phase 1 until Phase 0 is accepted.
