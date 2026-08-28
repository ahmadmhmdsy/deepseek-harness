# Step 14 — Gap analysis: plan vs. reality

> Status: COMPLETE. Phase alignment: the bottom-line for rewriting the plan into a phase-correct roadmap.

## Headline finding

**The plan under-estimates the foundation and over-estimates the greenfield work.** dsh already ships most of what the plan describes as future phases. The plan also misnames two structural concepts (apps/control-plane + apps/worker vs. dsh's existing bundle architecture; packages/plugins vs. dsh's capability groups) and ignores the verification gates entirely.

## What the plan calls for vs. what exists

### Phase 0 — Baseline

| Plan item | Reality | Action |
|---|---|---|
| Install dsh (`npx @deepseek-ai/dsh web`) | The repo IS dsh. No upstream package to install. | Reframe: 'pin the version we ship'; record `package.json` `version: 0.1.1-rc.2`. |
| Verify Node 22.19+ | Confirmed in `engines`. | Add an env-check to phase-0 acceptance. |
| Verify coding agent runs a 'hello-world' prompt | dsh does this today; `examples/headless-agent` is the canonical fixture. | Run `pnpm dsh --profile headless 'create a hello-world app'` with `DEEPSEEK_API_KEY`. |
| Configure model (DeepSeek V4-Flash as worker) | Already default in `@deepseek-ai/dsh-llm-deepseek`. | Document; do not build. |
| Pin the exact dsh version | Already `0.1.1-rc.2` in root `package.json` AND every workspace package. | Document the version and release cadence (root `AGENTS.md` notes 'breaking changes expected'). |
| Scaffold the monorepo | Repo exists with 52 packages + 2 apps + 3 bundles. | Reframe: 'add new app and plugin packages alongside'. |

### Phase 1 — Single-user MVP

| Plan item | Reality | Action |
|---|---|---|
| 1.1 Scaffold plugin (Next.js/Svelte + Tailwind) | Composable over `dsh-tool-fs` + `dsh-tool-bash`. ~150 LOC. | Build `@deepseek-ai/dsh-app-builder-scaffold`. |
| 1.2 Preview plugin (dev server + readiness + screenshot) | `dsh-tool-bash` background + `dsh-tool-jobs` covers dev server. **Readiness probe and headless screenshot are greenfield.** | Build `@deepseek-ai/dsh-app-builder-preview`. |
| 1.3 Model tiering (V4-Pro planner / V4-Flash worker) | Already per-agent via `ctx.agents.installModelSelection()` + `agents[].provider/model` config. Multi-agent already exists via `subagent` + `workflow`. | Ship `examples/app-builder/cordis.yml` that wires two agents. |
| 1.4 Event-sourced sessions (persist, resume, fork, replay) | Fully implemented (`dsh-session`, `dsh-session-persistence-jsonl`, `dsh-session-projection`, `dsh-session-query-sqlite`, `dsh-session-stats`, `dsh-session-title`). | Nothing to build for the events themselves. Bind to `Project` instead. |

### Phase 2 — Productize the control plane

| Plan item | Reality | Action |
|---|---|---|
| 2.1 Data model + API (User, Project, Session, Event, Deployment, ToolPolicy) | Session/Event/Project(partial via `cwd`) exist. User/Deployment do not. | Build `@deepseek-ai/dsh-app-builder-project` (Project entity) + `@deepseek-ai/dsh-app-builder-deployment` (Deployment entity). |
| 2.2 ToolPolicy manifest (typed schema + enforcer) | `permission-presets` + `sandbox-policy` + `tools/pre-execute` + `tools/guard` cover the runtime. Typed schema is additive. | Build `@deepseek-ai/dsh-app-builder-tool-policy` with typed schema + a `tools/pre-execute` listener that consults it. |
| 2.3 Deploy tool (git init + push) | Greenfield. | Build `@deepseek-ai/dsh-app-builder-deploy` with deterministic gates (SAST/SCA/secrets). |
| 2.4 Input validation + structured outputs | Already there: schemastery config validation; tool schemas via `ctx.tools.register()`. | Add explicit `output` schema validation gates for the new tools. |

### Phase 3 — Multi-user scale

| Plan item | Reality | Action |
|---|---|---|
| 3.1 Auth + isolation | Sandbox exists. Auth is greenfield. | Build `@deepseek-ai/dsh-app-builder-auth` (the control plane becomes the auth boundary; per-project non-privileged user; restricted network via egress proxy). |
| 3.2 Worker pool | Not a separate app — bundle patches over dsh-base. | Wire dsh invocation as the worker (one process per project). |
| 3.3 Memory isolation | Per-session scoping already exists (`dsh-scope`). | Per-user memory partitioning at the storage layer. |
| 3.4 Preview proxying + quotas | dsh has `dsh-host-apiproxy`. Quotas are greenfield. | Build a per-project preview proxy with rate limiting; build a `quota` package. |
| 3.5 Deployment pipeline | Greenfield. | Bind the deploy tool to CI per project behind approval. |

## What the plan MISJUDGES

1. **Phase 0 is essentially already done.** The plan asks to install, pin, and scaffold — all three exist. Phase 0 should be 'pin the version + verify hello-world + add first new package'.
2. **The plan frames dsh as a library.** It isn't — it's a developer preview of the product the App Builder is supposed to be. The plan over-estimates greenfield by ~50%.
3. **The plan invents 'apps/control-plane' and 'apps/worker'.** Both dsh concepts map cleanly to existing pieces: the control plane IS `apps/web` (plus a new bundle); the worker is a `dsh-subagent-spawn-in-process` (plus optional `dsh-workflow-worker-thread`).
4. **The plan invents 'packages/plugins'.** dsh's plugin namespace is the existing capability groups under `packages/`. New App Builder plugins land under existing groups or new groups under `packages/` (e.g., `packages/app-builder/`).
5. **The plan ignores the bundle architecture.** dsh has `packages/bundle/{base,web-app,headless}`. The App Builder is best expressed as a NEW bundle that patches over `base`: `packages/bundle/app-builder`.
6. **The plan ignores Typert RPC.** dsh's HTTP/JSON-RPC transport goes through `packages/api/{remotes,gateway}`. The App Builder's REST/SSE API mounts there, not on a parallel HTTP layer.
7. **The plan ignores the verification gates.** Every new package triggers `pnpm run hygiene`, `pnpm run typecheck`, `pnpm run test`, `pnpm run test:coverage`, `pnpm run test:snapshot`, `pnpm run doc-sync`. The plan estimates phases by user-visible milestones without counting these.
8. **The plan calls Landlock Phase 3 work; the native addon ships.** Phase 3 should be 'wire the existing native addon to per-project workers + add network restrictions'.
9. **The plan says 'Postgres for the control-plane index'; SQLite + dsh-session-query-sqlite already provide this.** Adopting Postgres is orthogonal to the MVP and could be deferred or skipped.
10. **The plan says 'every plugin tool declares allowed actions, read/write scope, network scope, credential access'.** Today this is implicit per-provider config. Making it explicit is the additive work — call it out as a single package, not a phase.
11. **The plan does not mention the package invariant companion requirement.** Every package ships `./invariant`.
12. **The plan does not mention the snapshot test requirement.** Every non-trivial model-visible change adds a snapshot.
13. **The plan does not mention the Agent Note requirement.** Every non-trivial change ships one.
14. **The plan does not mention the bilingual doc contract.** Every user-facing doc ships zh.md + i18n.yaml.
15. **The plan does not mention the cordis.yml loader convention.** New plugins register as Cordis plugins; the loader enforces their visibility.
16. **The plan does not mention that the Landlock binary is statically linked musl, fails closed, and cannot be replaced by a non-enforcing binary (no env-var overrides).** This is a load-bearing safety property.
17. **The plan does not mention that dsh has a Python SDK.** App Builder automation tests could use it.
18. **The plan does not mention that dsh has ACP integration.** Editor/agent interop is wired.

## What the plan MISSES

1. **Two new types of work the plan doesn't name:**
   - **Project entity** — wraps one or more sessions with metadata (name, stack, git_url, dsh_profile). The plan lists this as Phase 2.1 data, but it's a first-class concept, not just a row.
   - **App Builder persona** — a coding persona for the App Builder agent. dsh has `dsh-persona` for exactly this.

2. **Three categories of work the plan under-sizes:**
   - **Documentation**: every new package, every user-facing change, every safety invariant needs bilingual docs + Agent Note + catalog entry. This is ~30% of total work.
   - **Snapshot tests**: the App Builder's MVP will need 5+ snapshot scenarios (keyless boot, keyless scaffold, keyless preview, keyless preview-iterate, keyless deploy plan).
   - **Real-composition tests**: every plugin needs Loader-driven tests, not unit-style mocks.

3. **The plan does not name the credential-redirect policy** for web search providers. Verify it (Step 10 confirms PASS).

4. **The plan does not name SSRF protection** for `web-fetch-http`. Important for the App Builder's deployment.

5. **The plan does not consider what 'scaffold a project from a template' means for the App Builder's cost model.** Each scaffold = a real LLM call + `npm install` (real network). Cache-aware pricing matters.

6. **The plan does not mention the headless profile** for non-interactive use. App Builder can drive `dsh --profile headless` directly.

7. **The plan does not mention that the web UI already has chat, plan, goal, subagent, todo, skill, settings UI slots.** App Builder reuses them.

8. **The plan does not mention that dsh already has privacy hooks**: `dsh-anonymous-user-id` is shipped; nothing else in the repo references user identity.

## What the plan OVERSTATES

1. **'Scaffold the monorepo'** is essentially a no-op. The monorepo exists.
2. **'Event-sourced sessions'** is essentially built. The session is already the event log.
3. **'ToolPolicy manifest'** is mostly built. The runtime enforcement is there; the typed schema is additive.
4. **'Landlock sandbox'** is built. The native addon ships; the providers wrap it; the policy resolver unifies bash/fs/terminal.
5. **'Web capabilities'** is built. Three search providers, one fetch provider, one tool layer.
6. **'Skill system'** is built. Registry + filesystem provider + model-facing tool + bundled (disabled) skill.
7. **'Subagent delegation'** is built. Four in-process providers, ACP, Claude Code, Codex, dsh-sdk.
8. **'Model tiering'** is built. Per-agent provider/model selection, retry policy, token meter.

## Suggested plan restructure

**Phase 0 (revised) — Acceptance gate, no new code (0.5 day)**
- Pin the version (`0.1.1-rc.2`) and record release cadence.
- Run `pnpm dsh --profile headless 'create a hello-world app'` with `DEEPSEEK_API_KEY`; capture the JSONL.
- Run `pnpm run doc-sync` to confirm zero gate failures.
- Move `PROJECT.md` from `planning/PROJECT.md` to `docs/PROJECT.md` per the phase prompts' references.

**Phase 1 (revised) — App Builder MVP (1–2 weeks)**
- New bundle `packages/bundle/app-builder` over `packages/bundle/base`.
- New packages: `dsh-app-builder-project` (Project entity), `dsh-app-builder-scaffold` (scaffold tool), `dsh-app-builder-preview` (preview tool, includes readiness probe + headless screenshot), `dsh-app-builder-persona` (App Builder persona).
- New example `examples/app-builder/` with keyless + with-key smokes.
- Wire `apps/web` to show the App Builder UI (project list + chat + preview iframe).
- Snapshot scenarios: `cordis.yml`, `scaffold-hello-world`, `preview-dev-server`, `preview-iterate`.
- Agent Notes: one per non-trivial package.

**Phase 2 (revised) — Productize control plane (2–4 weeks)**
- Add `packages/app-builder/deployment` (Deployment entity + deploy tool + SAST/SCA/secrets gates).
- Add `packages/app-builder/tool-policy` (typed `ToolPolicy` schema + `tools/pre-execute` enforcer).
- Add `packages/app-builder/api` (Typert Remote service exposing REST + SSE endpoints; mount via existing `dsh-api-gateway`).
- Add a `Project` projection unit + cache for the projects list pane.
- Update `apps/web` with project list, deployment status pane, preview iframe with `WebSocket`/`SSE` for live updates.
- Snapshot scenarios: `deploy-local`, `tool-policy-allow`, `tool-policy-deny`, `api-list-projects`.

**Phase 3 (revised) — Multi-user scale (2–4 weeks)**
- Add `packages/app-builder/auth` (control-plane auth boundary).
- Wire per-project dsh worker processes (one process per project; user identity boundary).
- Per-project egress proxy (Landlock cannot restrict network — need an HTTP proxy).
- Per-user quotas (token, cost, retries, sessions).
- Per-user memory partitioning in the storage layer.
- Sandbox per project = already enforced via `sandbox-policy`; confirm the cross-project isolation contract.
- Snapshot scenarios: `multi-tenant-isolation`, `quota-enforced`, `deploy-gated`.

## Plan corrections summary

1. **Phase 0** = version pin + acceptance gate. Don't reinvent the wheel.
2. **Phase 1** = new bundle + 4 new packages + 1 new example + UI re-skin. Don't build infra.
3. **Phase 2** = 3 new packages + 1 new API surface + projection unit + UI integration. Add depth, not architecture.
4. **Phase 3** = auth boundary + per-project workers + egress proxy + quotas. Add isolation, not new infra.
5. **All phases** = bilingual docs + Agent Notes + snapshot tests + real-composition tests. Plan for this load.
6. **Throughout** = plan for the catalog + invariant + verification gates. Every new package triggers them.
7. **Postgres can wait.** dsh's SQLite + dedicated derived SQLite FTS5 index is sufficient.
8. **Landlock is already there.** Wire, don't build.
