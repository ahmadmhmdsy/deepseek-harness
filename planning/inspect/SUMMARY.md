# SUMMARY — DeepSeek Harness App Builder: Plan vs. Reality

> Inspection complete. 15 step-by-step documents in `planning/inspect/01..14-*.md`. This summary is the executive view.

## TL;DR

The plan in `planning/{goal,mission,plan,PROJECT}.md` describes an App Builder on top of DeepSeek Harness. The repo IS DeepSeek Harness — a developer preview of exactly this product, not a library to wrap. **~70% of what the plan asks for already exists.** The actual greenfield work is: a Project entity, a typed ToolPolicy schema, a deploy tool, an HTTP/SSE API layer, the App Builder persona, the preview-pane UI, and the multi-user hardening (auth boundary + per-project worker + egress proxy + quotas).

## Step-by-step inspection index

| Step | File | Topic |
|---|---|---|
| 1 | `01-repo-overview.md` | Repo at a glance: pnpm 11.7.0, Node 22.19+, vendored Cordis, 52 packages, 2 apps, 3 bundles, native Landlock addon, ~25 mechanical verifiers. |
| 2 | `02-apps.md` | `apps/cli` (the `dsh` bin) + `apps/web` (the GUI we're in). Plan's `apps/control-plane` and `apps/worker` do not exist as concepts; they map onto existing pieces. |
| 3 | `03-core-packages.md` | Event-sourced sessions, agent runtime, subagent delegation, workflow orchestration, plan/goal/todo/permission are already mature. |
| 4 | `04-capabilities.md` | shell/bash/pwsh, fs/sandbox, web (3 search + 1 fetch), skill, terminal, lsp, storage, MCP, code-runtime, host, client. Sandbox-local selects bwrap > Landlock > Seatbelt > Windows ACL. |
| 5 | `05-orchestration.md` | workflow + subagent + presets + hooks. No `self-modification` group (AGENTS.md claim is aspirational). |
| 6 | `06-interfaces.md` | ACP, JSON-RPC SDK (TS + Python), Typert RPC gateway, web/connection transport. App Builder's REST/SSE mounts via Typert, not on a parallel HTTP layer. |
| 7 | `07-session-event-system.md` | Event log, JSONL persistence (zstd), projection registry + cache, session-query SQLite FTS5, session-stats, session-title. |
| 8 | `08-tool-policy.md` | `permission-presets`, `sandbox-policy`, `tools/pre-execute`, `tools/guard`, `ctx.tools.restrict()`, `ctx.approval`, `ctx.userQuestions`, `ctx.commands`. Additive typed schema is the new work. |
| 9 | `09-sandbox.md` | Landlock native addon (musl, fail closed, no env-var overrides), `sandbox-local` (bwrap > Landlock > Seatbelt > Windows ACL), `bash-sandbox` consumer with structured denial facts. Phase 3 work is binding, not building. |
| 10 | `10-web.md` | All three credentialed providers use `redirect: 'error'` (PASS per `packages/web/AGENTS.md`); anonymous fetch uses `redirect: 'manual'` with same-origin limit. SSRF not protected — flag for App Builder deployment. |
| 11 | `11-skills.md` | Registry + filesystem provider (5 roots ranked) + bundled (disabled) badge + model-facing `skill` tool with auto-injected catalog. |
| 12 | `12-build-test-hygiene.md` | Unit + coverage (per-file 100%) + e2e + snapshot + web browser snapshot + doc-sync + hygiene + typecheck. ~225 package tests dirs. Catalog + invariant + verification gates apply to every new package. |
| 13 | `13-examples.md` | `examples/acp-agent`, `headless-agent`, `jsonrpc-agent`, `mcp-memory`, `web-cordis`, `web-schedule`. Each has keyless + with-key smokes; mapping convention `examples/<agent>/tests/fixtures/<group>/<package>/cordis.yml`. |
| 14 | `14-gap-analysis.md` | Full plan-vs-reality delta; restructured phase plan. |
| 15 | `15-phase0-pre-existing-failures.md` | Path B action plan: vendor-rescope drift + 9 Windows thread-safe test fixes + two Phase 0 prompt gaps, with actionable fix steps and verification commands. |
| 16 | `16-plan-fix-report.md` | Plan-rewrite record: what changed between the original `planning/{PROJECT,mission,goal,plan,Phase 0..3 prompt}.md` and the dsh-reality-aligned versions. |
| 17 | `17-phase0-acceptance-results.md` | Phase 0 acceptance evidence (commit `519da740a2`): per-task outcomes, gate pass/fail, residual failures (8 in 3 files, all out-of-scope environmental or known intermittent), git state, deferred work. |
| 18 | `18-phase1-start-record.md` | Phase 1 kickoff log on `app-builder-web-reskin` (post `abc87d4df1`): per-package status, decisions carried from Phase 0, residual items inherited, git state. |

## What already exists (top-line)

**Capabilities that the plan describes as future phases:**

- Event-sourced session log + persistence + projection + query + cache + stats + title.
- Per-agent model/provider/reasoning-effort selection.
- Multi-agent delegation (spawn / fork / acp / claude-code / codex / dsh-sdk; background + continuable modes).
- Workflow orchestration (worker-thread engine).
- Agent preset composition + persona shadow.
- Tool pipeline with allow/deny/ask gate + monotonic guard + per-tool timeout + repeat-tool-reminder.
- Permission presets + sandbox policy + approval seam + user questions + slash commands.
- Bash + PowerShell executors with mode-aware sandboxing (bwrap / Landlock / Seatbelt / Windows ACL).
- Filesystem backend with mode fence (canonicalize-then-contain, TOCTOU-narrowing re-check).
- Web capability seam with 3 search providers + 1 anonymous fetch provider.
- Skill registry with project + user + custom roots + Chokidar watcher.
- LSP seam + stdio provider + tool.
NaN- Session telemetry (OpenTelemetry).
- JSON-RPC SDK (TypeScript + Python) over stdio.
- ACP server.
- Typert RPC + HTTP gateway; HMR + WebServer + API proxy hosts.
- Browser-side runtime with ~36 UI slot packages (chat, plan, goal, todo, subagent, skill, settings, theme, layout, etc.).
- Native Landlock binary (musl, fail-closed, no env-var overrides).
- Python SDK + bundled single-exe runtime.
- Hooks bridge for Claude Code / Codex.
- MCP client.
- Examples with snapshot tests (acp-agent, headless-agent, jsonrpc-agent, mcp-memory, web-cordis, web-schedule).

## What is genuinely greenfield

**Categories of new work:**

1. **Project entity** — first-class wrapper around sessions with metadata (name, stack, git_url, dsh_profile, events).
2. **App Builder persona + preset** — coding-persona for the App Builder agent.
3. **Scaffold tool** — composes `dsh-tool-fs` + `dsh-tool-bash` to copy templates + run `npm install`.
4. **Preview tool** — composes `dsh-tool-bash` background + a readiness probe (NEW) + a headless-browser screenshot helper (NEW).
5. **Deploy tool** — git init + push (or ZIP export) + deterministic gates (SAST/SCA/secrets).
6. **Typed ToolPolicy manifest** — typed schema + `tools/pre-execute` listener that consults it; falls back to `ctx.permissionPresets.current(events)`.
7. **REST/SSE API surface** — Typert Remote service exposing projects / sessions / events / fork / resume / preview / deploy endpoints.
8. **App Builder web UI** — project list pane + chat pane + preview iframe pane + deployment status.
9. **Egress proxy** (Phase 3) — Landlock cannot restrict network; need an HTTP proxy.
10. **Quota / rate-limit package** (Phase 3) — per-user token / cost / retry / session budgets.
11. **Auth boundary** (Phase 3) — control-plane becomes the auth boundary.
12. **Per-project worker pool** (Phase 3) — one dsh process per project (current model is one process per workspace).

## Plan mismatches (consolidated)

| Plan claim | Reality | Severity |
|---|---|---|
| 'Scaffold the monorepo' | Repo exists with 52 packages | High |
| 'apps/control-plane' + 'apps/worker' | apps/web IS the control plane; worker concepts live in libs | High |
| 'packages/plugins' | Existing groups under packages/ + new groups under packages/ | High |
| 'Install dsh via npx' | We are dsh | High |
| 'Event-sourced sessions' | Already built | High |
| 'ToolPolicy manifest' | Mostly built; typed schema is additive | Medium |
| 'Landlock sandbox' (Phase 3) | Already built; native addon ships | High |
| 'Postgres for control-plane index' | SQLite + dedicated derived FTS5 works | Medium |
| 'Web capabilities (search/fetch)' | Already built | Medium |
| 'Skill system' | Already built | Medium |
| 'Model tiering' | Already per-agent | Medium |
| Plan ignores verification gates | Per-file 100% coverage + snapshot tests + Agent Notes + bilingual docs | High |
| Plan ignores bundle architecture | `packages/bundle/{base,web-app,headless}` is the pattern | High |
| Plan ignores Typert RPC | `packages/api/{remotes,gateway}` is the API surface | High |
| Plan ignores `self-modification` claim in root AGENTS.md | No `packages/self-modification` exists | Low (doc bug) |

## Revised phase plan

**Phase 0 (revised) — Acceptance gate, no new code (0.5 day)**

- Pin version (0.1.2-alpha.1` post-Phase-1.5; the original Phase 0 pin of `0.1.1-rc.2` is obsolete) + record release cadence in PROJECT.md.
- Verify Node 22.19+ + pnpm 11.7.0.
- Run `pnpm dsh --profile headless 'create a hello-world app'` with `DEEPSEEK_API_KEY`. Capture the JSONL.
- Run `pnpm run doc-sync` to confirm zero gate failures on the current tree.
- Move `planning/PROJECT.md` to `docs/PROJECT.md` per the phase prompts' references.
- Decision point: where does the App Builder bundle live? Recommend `packages/bundle/app-builder/`.

**Phase 1 (revised) — App Builder MVP (1–2 weeks)**

- New bundle `packages/bundle/app-builder/cordis.patch.yml` over base.
- New packages (under `packages/app-builder/`):
  - `dsh-app-builder-project` (Project entity + projection unit).
  - `dsh-app-builder-scaffold` (~150 LOC; composes fs + bash + str-replace-editor).
  - `dsh-app-builder-preview` (readiness probe + headless screenshot; composes bash + jobs).
  - `dsh-app-builder-persona` (App Builder persona).
- New example `apps/cli/config/examples/app-builder/` (relocated from `examples/app-builder/` in Phase 1.5 per the upstream retirement PR #2977):
  - `cordis.yml` + `cordis.snapshot.yml`.
  - `tests/e2e/keyless-smoke.spec.ts` (boots via `dsh-loader-smoke`).
  - `tests/e2e/with-key-smoke.spec.ts` (sends a real prompt, verifies scaffold + preview).
- Update `apps/web` (or a new `apps/app-builder-web`) to expose the App Builder UI:
  - Project list pane (uses `ctx.sessionProjections` for the `projects` unit).
  - Chat pane (re-uses `dsh-client-ui-conversation`).
  - Preview iframe pane (binds to the per-project dev server URL).
- Agent Notes: `scaffold-plugin`, `preview-plugin`, `project-entity`.
- Snapshot scenarios: `cordis.yml`, `scaffold-hello-world`, `preview-dev-server`, `preview-iterate`.
- Status: in progress on `app-builder-web-reskin`; four packages shipped, shell + projects pane shipped; web reskin pending (lands in Phase 1.5).

**Phase 1.5 (revised) — Upstream sync to `dsh-v0.1.2-alpha.1` (3–7 days)**

Inserted between Phase 1 and Phase 2. Synchronizes the fork to upstream's `dsh-v0.1.2-alpha.1` release (`cd5ef81481`) so Phase 2 starts on top of upstream's chosen app shape (`apps/cli` + `apps/web`) and the up-to-date API / projection infrastructure.

- **Sub-phase 1.5.1 — B2 merge.** `git merge --no-ff upstream/master` on a new branch. Resolves the 25 shared paths (see [`inspect/19-upstream-v0.1.2-alpha.1-adoption-plan.md §3`](19-upstream-v0.1.2-alpha.1-adoption-plan.md)). Regenerates `pnpm-lock.yaml` via `pnpm install`. All 5 gates green. Native stacked PR.
- **Sub-phase 1.5.2 — Examples relocation.** Move `examples/app-builder/` → `apps/cli/config/examples/app-builder/`. Re-record keyless/with-key snapshots at the new path. 5 gates green. Update `planning/Phase 1 prompt.md §6` and `planning/inspect/18-phase1-start-record.md`. Stacked on 1.5.1.
- **Sub-phase 1.5.3 — Apps/web reskin.** Integrate `packages/client/ui-app-builder-shell` + `packages/client/ui-app-builder-projects` into upstream's rebuilt `apps/web/` (183 files, 56 first-parent merges past `b150a551b8`). Add slot declarations (`app-builder-shell`, `app-builder.projects`, `app-builder.preview`, `app-builder.conversation`) to upstream's host. Update `apps/web/index.html` title. Re-record web browser snapshots. Stacked on 1.5.2.
- **Sub-phase 1.5.4 — Projection cache adoption.** Cherry-pick `xtr/projection-per-session-cache` (PR #2781, `53c8f64eed`). Wire `packages/session/session-projection-cache/` into `packages/app-builder/project/` (Phase 2 §4: project projection unit + cache). 5 gates green. Stacked on 1.5.3.
- **Sub-phase 1.5.5 — API gateway adoption.** Cherry-pick the `worktree-apire-*` cluster (PRs #2911, #2968, #3082, #3083, #3085, #3086, #3217, #3235 + #3148). Scaffold `packages/app-builder/api/` with the 11 methods from Phase 2 §3. Mount via `@deepseek-ai/dsh-api-gateway` + `@deepseek-ai/dsh-api-remotes`. 5 gates green. Stacked on 1.5.4.
- **Sub-phase 1.5.6 — Subagent provider.** Cherry-pick PR #2663 (`f76a225a7d`). Re-apply our `721c1d6fe1 fix(subagent): route spawned children through parent's live model selection` if the B2 merge clobbered it. 5 gates green. Stacked on 1.5.5.
- **Sub-phase 1.5.7 — Planning artifacts.** Update `planning/plan.md`, `planning/goal.md`, `planning/Phase 2 prompt.md`, `planning/inspect/INDEX.md` (this entry), `planning/inspect/SUMMARY.md`, `docs/PROJECT.md`. Land 1.5.5-introduced cordis-catalog regression fixes (unique symbol + unknown in Typert Remote boundary, JSDoc completeness on Cordis events, type-link exemptions, SERVICE_PAGE/EVENT_SCOPE_PAGE entries, gen-doc-graphs SERVICE_ROLES entries, gen-config-catalog `as const` unwrap, new `docs/subsystems/app-builder.{md,zh.md,i18n.yaml}`). Stacked on 1.5.6.

**Phase 1.5 status — accepted.** Sub-phases 1.5.1 (`f7386f0f97`), 1.5.2 (`58ad73791e`), 1.5.3 (`098f7cad1c`), 1.5.4 (`8a28421e02`), 1.5.5 (`8994998859`), 1.5.6 (`1bc7a6b9f7`) all merged via native GitHub stacked PRs atop `origin/adopt/api-gateway-cluster`. 1.5.7 lands as the docs-only commit on `docs/phase1.5-record`. `pnpm run doc-sync` returns 25 PASS / 7 FAIL; the 7 FAIL are documented §9 backlog (translation pairing divergences in `capability-seams`/`event-producer-consumer`/`config-catalog` from 1.5.4/1.5.5 adoption + pre-existing 1.5.1-inherited gates that were failing before this branch).

Detailed per-file conflict map and resolution plan: [`inspect/19-upstream-v0.1.2-alpha.1-adoption-plan.md`](19-upstream-v0.1.2-alpha.1-adoption-plan.md). Task brief: [`Phase 1.5 prompt.md`](../Phase%201.5%20prompt.md).

**Phase 2 (revised) — Productize control plane (2–4 weeks) — in progress**

- New packages:
  - `packages/app-builder/deployment` (Deployment entity + `deploy` tool + SAST/SCA/secrets gates).
  - `packages/app-builder/tool-policy` (typed `ToolPolicy` schema + `tools/pre-execute` listener).
  - `packages/app-builder/api` (Typert Remote service: REST + SSE).
- Mount the API via existing `dsh-api-gateway` + `dsh-api-remotes` (no new HTTP layer).
- Add a `Project` projection unit + projection cache for the projects list pane.
- Update `apps/web` with project list, deployment status pane, preview iframe with `EventSource` for live updates.
- Agent Notes: `deployment-pipeline`, `tool-policy-typed-schema`, `control-plane-api`.
- Snapshot scenarios: `deploy-local`, `tool-policy-allow`, `tool-policy-deny`, `api-list-projects`.

**Phase 3 (revised) — Multi-user scale (2–4 weeks)**

- New packages:
  - `packages/app-builder/auth` (control-plane auth boundary using `dsh-anonymous-user-id` as base).
  - `packages/app-builder/egress-proxy` (HTTP egress per project with rate limit).
  - `packages/app-builder/quota` (per-user token / cost / retry / session budgets).
- Wire per-project dsh worker processes (one process per project).
- Per-user memory partitioning at the storage layer (separate `DSH_HOME` per user).
- Per-project preview proxying via `dsh-host-apiproxy`.
- CI deploy path gated by approval.
- Agent Notes: `multi-tenant-isolation`, `quota-enforcement`, `egress-proxy`.
- Snapshot scenarios: `multi-tenant-isolation`, `quota-enforced`, `deploy-gated`.

## Risks to track

1. **Cost** — each scaffold + `npm install` is a real LLM call + real network. The plan does not model this. Recommend: per-session budgets + cache-aware pricing + alerts (already supported by `dsh-token-meter`; needs UI + opt-in enforcement).
2. **SSRF** — `web-fetch-http` explicitly does not protect against SSRF (per its source). App Builder's fetch tool can be tricked into probing internal services. Recommend: egress proxy in Phase 3; document for Phase 1/2.
3. **Cordis plugin safety** — root AGENTS.md warns 'No installing plugins/skills/MCP servers without inventory + review (unsigned dsh plugins are the risk).' New App Builder plugins are unsigned Cordis plugins; review them.
4. **Landlock coverage** — on Linux, Landlock is the fallback when bwrap is missing. The default composition prefers bwrap first; verify the App Builder's deployment expectation (some distros ship bwrap, some don't).
5. **Windows ACL coverage** — sandbox per-session private temp SID is correct; cross-project isolation on Windows needs explicit testing.
6. **WebSocket vs SSE** — plan calls for SSE; existing transport is WebSocket via `dsh-host-apiproxy`. Plan should clarify: SSE for the API surface, WebSocket for the existing projection push.
7. **Cost control with peak pricing** — root AGENTS.md notes 'enforce cost controls so an unbounded loop can't drain your DeepSeek bill (remember the new peak pricing)'. Phase 3 quota package must enforce.
8. **Landlock coverage in CI** — Linux CI runs Landlock; macOS runs Seatbelt; Windows runs ACL. The App Builder snapshot tests must cover all three.

## Documentation moves needed

1. Move `planning/PROJECT.md` to `docs/PROJECT.md` (per phase prompt references).
2. Update `apps/cli/composition.md` once the new App Builder bundle exists.
3. Add a generated `tool-catalog.md` entry for each new tool (`scaffold`, `preview`, `deploy`).
4. Add an Agent Note for each non-trivial change (per AGENTS.md policy).
5. Bilingual docs: every new user-facing doc ships `zh.md` + `i18n.yaml`.
6. Update `packages/README.md` (≤ 600 words budget) with the new app-builder group.
7. Add a new subsystem page in `docs/subsystems/` for App Builder.

## Open questions for the user

1. **App Builder bundle location.** New group `packages/app-builder/` (recommended) or under existing groups?
2. **App Builder UI shell.** Re-skin `apps/web` (recommended) or new `apps/app-builder-web`?
3. **Project entity location.** Plugin in `packages/app-builder/project` (recommended) or alongside `dsh-session` (`packages/core/session` extension)?
4. **REST API style.** Typert RPC + JSON-RPC (consistent with the rest of dsh) or REST + SSE as the plan describes? Recommend Typert-mounted REST + SSE.
5. **Headless driver.** Drive App Builder from CLI via `dsh --profile headless` (no UI for headless automation) or via web UI only? Recommend both.
6. **Egress proxy.** Build a small Node-based proxy or integrate with an external one (e.g., Squid)? Recommend small Node proxy in `packages/app-builder/egress-proxy`.
7. **Quota package scope.** Wrap `dsh-token-meter` or build fresh? Recommend wrap + extend.

## Next step

Confirm: do you want me to start Phase 0 (revised acceptance gate)? It is read-mostly + verification + `PROJECT.md` relocation + a decision on the open questions above.
