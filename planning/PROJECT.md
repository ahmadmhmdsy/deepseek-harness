# PROJECT.md — DEPRECATED

> **This document has moved to [docs/PROJECT.md](../../docs/PROJECT.md).**
> The canonical source of truth for the App Builder project is now in `docs/PROJECT.md`. This file is kept only as a redirect so existing links do not break.

## Why this moved

Phase 0/1/2/3 task prompts in `planning/Phase*.prompt.md` reference `docs/PROJECT.md` as the document the agent MUST read before starting a phase. The planning folder is for planning-only artifacts (mission, plan, phase prompts, role rules); the project source of truth belongs in `docs/` alongside `architecture.md` and the subsystem pages.

## What changed in the move

1. **Restructured** to match dsh reality, not the aspirational App Builder-from-scratch framing.
2. **Refs the real dsh package names** (`@deepseek-ai/dsh-*`) instead of inventing `apps/control-plane` + `apps/worker` + `packages/plugins`.
3. **Names the gates** that apply to every new package (catalog verifiers, per-file 100% coverage, snapshot tests, Agent Notes, bilingual docs).
4. **Reframes phases** as additive over the existing repo (new bundle + new packages + new example), not a fresh monorepo.
5. **States the safety properties explicitly** (Landlock fail-closed, credentialed-redirect rejection, SSRF caveat, sandbox-mode vocabulary).

## Original content

The original text of this document is preserved below for traceability. It describes an earlier framing that assumed dsh was a library to wrap and the App Builder would be built from scratch. The new document supersedes it.

---

## 1. Mission

Turn DeepSeek Harness (`dsh`) into a self-hosted, local-first AI application builder (Replit / Lovable / Bolt style):
a user types a natural-language prompt and gets a working, previewable, deployable full-stack app.

## 2. Constraints

1. Local + single-user first; design every seam for later multi-user scale, but do not build multi-user features yet.
2. Extend dsh via plugins. NEVER fork it. Pin the version (it ships breaking changes).
3. Safety is a system property, not a model property. Sandboxing, least privilege, and approval gates are required.
4. Never expose dsh's local RPC to users. The control plane is the auth boundary.
5. All work stays inside the authorized workspace. Never touch credentials, home-dir config, or other projects.

## 3. Architecture

Two planes:

- CONTROL PLANE (our product): web UI (chat, projects, sessions), project/session store, event-log index, deployment. Owns UX and future multi-tenancy.
- DATA PLANE (dsh workers): one isolated dsh session per project. The agent edits files, runs shell, starts the dev server. We proxy the dev-server port to a preview pane.

### Tech stack (original aspirational)
- TypeScript monorepo (matches dsh), Node 22.19+
- React frontend
- Postgres for the control-plane index
- Docker/systemd for sandbox isolation
- dsh as the worker (pinned version)

### Model tiering (original aspirational)
- Planner/orchestrator: DeepSeek V4-Pro
- Worker coding agent: DeepSeek V4-Flash
- Track `prompt_cache_hit_tokens` per session for real cost.

## 4. Data model (original)

| Entity | Fields | Notes |
|---|---|---|
| User | id, email, api_key_ref, quota, plan | auth boundary; never expose dsh RPC |
| Project | id, user_id, name, stack, git_url, dsh_profile | one dsh sandbox per project |
| Session | id, project_id, status, event_log_ref, created_at | points at the dsh event stream |
| Event | id, session_id, seq, type, payload, ts | append-only log (mirrored/indexed) |
| Deployment | id, project_id, target, status, url | git push -> CI -> host |
| ToolPolicy | tool_id, permission, scope | per-tool permission manifest |

## 5. API (original)

```
POST   /projects                          create project (spawns dsh sandbox)
GET    /projects/:id                      project + session list
POST   /projects/:id/sessions             start a session
POST   /sessions/:id/messages             send a prompt -> agent
GET    /sessions/:id/events              SSE stream of the live event log
GET    /sessions/:id/transcript           full conversation projection
POST   /sessions/:id/fork                 fork the log into a new session
POST   /sessions/:id/resume               resume a paused session
GET    /projects/:id/preview             current preview URL + screenshot
POST   /projects/:id/deploy               export -> git push -> target
GET    /users/:id/usage                   token + cost, cache-aware
```

## 6. Plugin spec (dsh) — original

Plugins are Cordis plugins: a module that declares needed services and registers tools, with tracked side effects.

### scaffold tool
- Copies a template (Next.js/Svelte + Tailwind) into the project dir; runs `npm install`.
- Inputs: template, name, stack, features. Validate with Zod. Restrict writes to the project dir.

### preview tool
- Starts the dev server on a free port; waits for readiness; returns URL + console tail.
- Optional headless screenshot. Bind to localhost only.

### deploy tool
- git init -> commit -> push (or ZIP export). Route through deterministic gates before deploy.

### ToolPolicy manifest
- Every tool declares: allowed actions, read/write scope, network scope, credential access.
- Enforced at the tool-call level, not in the prompt.

## 7. Security & guardrails (original)

- Least privilege per tool; reads separated from writes; different tool sets per trust level.
- Isolated disposable sandboxes; secrets outside the agent filesystem.
- Log everything with traceability; deterministic gates (SAST, dependency scan, secrets scan) before deploy.
- Human approval on deploy, credentials, destructive ops.
- Bound every loop (retries, tool chains, recursion); enforce cost limits.
- Treat all external content as untrusted (prompt injection).
- Never install plugins/skills/MCP servers without inventory + review (unsigned dsh plugins are the risk).

## 8. Phases (original)

### Phase 0 — Baseline (0.5-1 day)
Install dsh, verify hello-world prompt, pin version, scaffold monorepo.

### Phase 1 — Single-user MVP (1-2 weeks)
Prompt -> scaffold -> run -> preview -> iterate -> resume, locally, sandboxed.

### Phase 2 — Productize control plane (2-4 weeks)
Data model + API, ToolPolicy manifest, deploy/export, input validation.

### Phase 3 — Multi-user scale (2-4 weeks)
Auth + isolation, worker pool, memory isolation, preview proxying + quotas, deploy pipeline.

## 9. Definition of done

- Phase 0: dsh boots; version pinned; monorepo compiles.
- Phase 1: prompt -> scaffold -> run -> preview -> iterate -> resume works locally, sandboxed.
- Phase 2: full chat loop, event-sourced sessions, ToolPolicy enforcement, deploy path with gates.
- Phase 3: isolated multi-tenant sandboxes, quotas, gated deploys, auditable.

## 10. Testing & evaluation

- Test harness: fixed prompt suite (todo app, CRUD, auth, API integration); assert build + run + basic checks.
- Trace which tools/strategies the agent picks; measure quality over time.
- Adversarial tests (prompt injection, malicious uploads, resource exhaustion) after every change.
- Track per-session token + cost, cache-aware, with alerts.
