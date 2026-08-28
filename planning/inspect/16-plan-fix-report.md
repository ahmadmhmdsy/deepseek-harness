# 16 — Plan-fix report

> Captured during the plan-fix pass. Records what changed, why, and the residual open questions.

## Trigger

Inspection of `planning/{PROJECT,mission,goal,plan,what_to_do_what_to_not_do,Phase 0..3 prompt}.md` against the actual dsh repo revealed that the plan framed dsh as a library to wrap, not the product it already is. ~70% of the plan's Phase 1/2/3 work is already shipped as dsh packages. The plan was rewritten to reflect dsh reality.

## Files changed

| Path | Change | New bytes |
|---|---|---|
| `docs/PROJECT.md` | CREATED — canonical source of truth, rewritten to match dsh reality | 16,977 |
| `planning/PROJECT.md` | REWRITTEN — now a redirect to `docs/PROJECT.md` with the original text preserved for traceability | 7,135 |
| `planning/Phase 0 prompt.md` | REWRITTEN — acceptance gate, no new code | 2,374 |
| `planning/Phase 1 prompt.md` | REWRITTEN — bundle + 4 new packages + example + UI re-skin | 5,066 |
| `planning/Phase 2 prompt.md` | REWRITTEN — deployment + tool-policy + api + projection | 4,466 |
| `planning/Phase 3 prompt.md` | REWRITTEN — auth + egress-proxy + quota + worker pool + memory isolation | 3,883 |
| `planning/plan.md` | REWRITTEN — full plan aligned with dsh reality | 12,189 |
| `planning/mission.md` | REWRITTEN — high-level alignment, references canonical docs/PROJECT.md | 9,290 |
| `planning/goal.md` | REWRITTEN — per-phase goals + avoid-list + rule of thumb | 6,160 |

## Files NOT changed

| Path | Reason |
|---|---|
| `planning/AGENTS.md` | Roles + operating rules for the project; not the plan. The role list (Planner / Architect / Builder / Reviewer / Tester / Previewer) and the do/don't rules are still valid. |
| `planning/Enhanced add-on prompt.md` | The "operating system" prompt for the App Builder agent itself; it defines how an App Builder agent should behave, not the plan. Should be reviewed separately; for now kept as-is. |
| `planning/what_to_do_what_to_not_do.md` | The do/don't list (safety, design rules, anti-patterns). The principles still hold; the original framing was generic enough to survive. Worth a future pass to add App Builder-specific items. |

## What changed conceptually

### 1. PROJECT.md moved to docs/

The phase prompts reference `docs/PROJECT.md`. The canonical source of truth is now there, alongside `architecture.md`. `planning/PROJECT.md` redirects to it.

### 2. Architecture rewritten

- **Removed**: `apps/control-plane`, `apps/worker`, `packages/plugins`.
- **Added**: `packages/bundle/app-builder` (new bundle over `base`), `packages/app-builder/*` (new group under `packages/`).
- **Reality-checked**: tech stack, model tiering, data model, API surface, plugin spec, security, phases.

### 3. Phases reframed

- **Phase 0**: now an acceptance gate with NO new code. Verifies dsh boots + version pins + gates pass + `docs/PROJECT.md` is canonical.
- **Phase 1**: 4 new packages under a new group + 1 new bundle + 1 new example + UI re-skin. Snapshot scenarios + Agent Notes + per-package obligations.
- **Phase 2**: 3 new packages (deployment, tool-policy, api) + projection unit + cache + UI integration. ToolPolicy named as the most important Phase 2 item.
- **Phase 3**: 3 new packages (auth, egress-proxy, quota) + per-project worker pool + memory isolation + preview proxy + CI deploy path. Egress proxy explicitly required because Landlock cannot restrict network.

### 4. Verification gates named

Every phase now lists the five verification commands the work must pass:

- `pnpm run typecheck`
- `pnpm run test:coverage`
- `pnpm run test:snapshot`
- `pnpm run doc-sync`
- `pnpm run hygiene`

### 5. Per-package obligations named

Every new package ships:

- `tests/` directory (NOT `src/__tests__/`)
- `src/invariant.ts` exporting `@deepseek-ai/dsh-<name>/invariant`
- README + JSDoc with `Model Experience` + `Known Limitations and Deferred Work` sections
- Real-composition test (Loader-driven `cordis.yml` boot)
- Per-file 100% coverage on `src`
- Bilingual README (`README.md` + `README.zh.md` + `README.i18n.yaml`)
- Catalog registration (cordis, client, tool, config, persistence)
- `tsconfig.json` extending `tsconfig.base.json` (Client: `tsconfig.base.client.json`)
- Agent Note for non-trivial changes

### 6. Safety invariants explicit

- Three-mode sandbox vocabulary (`read-only | workspace-write | danger-full-access`).
- Sandbox provider selection: bwrap > Landlock > Seatbelt > Windows ACL.
- Landlock binary is statically linked musl, fail-closed, NO env-var overrides, NO install-time build fallback.
- Credentialed web requests reject redirects before contact (`redirect: 'error'` per `packages/web/AGENTS.md`).
- Web fetch SSRF: NOT protected by `dsh-web-fetch-http`; Phase 3 must add an egress proxy.
- ToolPolicy is intent + audit, NOT authority. Real authority is sandbox-mode fences.
- Per the original plan: never install unsigned dsh plugins, never expose local RPC, human approval on deploy + credentials + destructive ops.

### 7. Tests + adversarial coverage

- Per-file 100% coverage on `packages/*/*/src` (CI gate).
- Snapshot tests for every non-trivial model- or product-visible change.
- Real-API e2e self-skips without keys.
- Adversarial tests: prompt injection, TOCTOU via symlinks, redirect smuggling, resource exhaustion, cost runaway.

## Decisions log (resolved)

The following six decisions were resolved after the initial plan-fix pass. Each is now captured in `docs/PROJECT.md` §11 (Decisions) and in the relevant phase prompt.

| # | Decision | Resolution | Rationale | Re-evaluation trigger |
|---|---|---|---|---|
| 1 | UI shell | Branch in git, NOT a permanent workspace copy. Tag `apps-web-classic-pre-app-builder` immediately before the reskin. | Branch + tag = atomic restore; zero workspace debt; existing web snapshot tests are the safety net. | If side-by-side rollout is needed later, copy `apps/web` to `apps/app-builder-web` (Option B) with a deprecation timeline: `apps/web` -> `apps/web-classic` in Phase 2; delete in Phase 3. |
| 2 | Workspace group | `packages/app-builder/` (new group under `packages/`). | Clean namespace; doesn't entangle existing groups. | None. |
| 3 | API style | Typert RPC + JSON-RPC. REST + SSE mounts on Typert; underlying transport is JSON-RPC 2.0 over stdio. | Consistent with the rest of dsh; reuses `dsh-api-gateway` + `dsh-api-remotes` + the existing SDK wire. | If browser-native WebSocket is needed (not SSE), add WebSocket transport through `dsh-api-remotes` without breaking JSON-RPC clients. |
| 4 | Egress proxy | Small Node-based proxy in `packages/app-builder/egress-proxy/`. | Stays in monorepo; in-process tests; same event log; same deployment; reuses `dsh-token-meter` + `dsh-host-apiproxy` patterns. | Migrate to external Squid if any of: (a) need for TLS termination, (b) need for ICAP, (c) throughput ceiling, (d) compliance requirement. |
| 5 | Quota package | Wrap and extend `@deepseek-ai/dsh-token-meter`. The wrapper is a `tools/post-execute` listener (NOT a passive observer); it calls `meter.record(...)` + `checkBudget(...)` synchronously. | Reuses tested accounting; single source of truth for usage; smaller package. | If dsh-token-meter's API becomes inadequate (e.g., per-tool token accounting), either extend dsh-token-meter upstream or build the quota package fresh. |
| 6 | Headless driver | `pnpm dsh --profile headless`. `examples/headless-agent` is the canonical pattern. | Already shipped; used by snapshot tests today. | None. |

## Residual open questions

None. The six original open questions are resolved above. New questions will be raised as Phase 0 / Phase 1 execution surfaces real constraints.

## Residual work

- `planning/Enhanced add-on prompt.md` (1630 lines) should be reviewed against the rewritten plan for consistency. Not changed in this pass; flagged for a future review.
- `planning/what_to_do_what_to_not_do.md` should get an App Builder-specific pass to add items like 'no Postgres for the control-plane index in Phase 1/2; use SQLite + dsh-session-query-sqlite'.
- `planning/AGENTS.md` should mention `docs/PROJECT.md` as the canonical source of truth.
- The phase prompts' task lists assume the user's environment is `E:\js_projects\my_deepseek_harness\deepseek-harness`; Phase 0 explicitly records this.

## Post-Phase-0 follow-up (path B action plan)

Phase 0 acceptance ran on 2026-08-28 against `master` at `b150a551b8` (dsh `0.1.1-rc.2`). Two categories of pre-existing failures surfaced, plus two Phase 0 prompt gaps. The full actionable plan lives in [`15-phase0-pre-existing-failures.md`](15-phase0-pre-existing-failures.md). Summary:

### Pre-existing on master (NOT caused by Phase 0)

1. **`pnpm run hygiene` -> `rescope-vendor:check`** fails on 2 exact edits:
   - `knip-logger-console` (in `knip.json`)
   - `vendoring-cookbook-name-invariant-zh` (in `docs/cookbook/adding-a-vendored-package.zh.md`)
   - Neither file modified by Phase 0 (per `git diff --name-only HEAD`).
   - Owner: dsh maintainers.
   - Fix: run `pnpm run rescope-vendor` interactively to either `--apply` the missing edits or remove the markers; verify with `pnpm run rescope-vendor:check`.

2. **`pnpm run test` -> 9 Windows thread-safe failures** across 7 files. Total pass rate 99.94% (13967 / 14040 tests). Linux/macOS CI expected to be green.
   - Buckets: worker-thread timing (1), pwsh path normalization (1), LSP executable resolution (1), SQLite cross-platform differential (1), client lazy-load (1), script fixtures (4).
   - Owner: dsh maintainers + per-package authors.
   - Fix: classify each as wrong-test-on-Windows (fix the test), real-bug-on-Windows (fix the code), or Windows-observational (tag + skip). Reference root AGENTS.md `check:ci:windows-observational` for the existing CI signal.

### Phase 0 prompt gaps (patched in this follow-up)

1. **Hello-world needs `lib/` build first.** `pnpm dsh --profile headless 'create a hello-world app'` requires `packages/*/*/lib/typert.host.js` to exist; `pnpm install` does not build them. tsx's source-hook cannot redirect a `.js` import back to `.ts`. **Patched** in `planning/Phase 0 prompt.md` task 3 with a precondition line requiring `pnpm run typecheck` (or `pnpm run build`) first.

2. **`pnpm run hygiene` needs both faces built, not just typecheck.** `pnpm run typecheck` only emits the host face (`build:lib:host`); the client face typechecks without emitting, so `publint` and `verify-built-package-invariants` fail on 44 client-face packages. **Patched** in `planning/Phase 0 prompt.md` task 4 with a precondition line requiring `pnpm run build` first.

### Decision: path A vs path B

Phase 0 acceptance report offered the user a choice:

- **Path A**: accept Phase 0 as PASSED (pre-existing failures are upstream's responsibility); proceed to Phase 1.
- **Path B**: address pre-existing failures first; this follow-up enables path B.

The user's follow-up message ("update plan/task/memory/...etc and save your finding for 'B. Address pre-existing failures first'") chose path B. The follow-up is now captured here, in `15-phase0-pre-existing-failures.md`, in the patched `planning/Phase 0 prompt.md`, and in the updated `planning/inspect/INDEX.md`.

### Recommended next agent action (path B step 1)

1. Read `planning/inspect/15-phase0-pre-existing-failures.md` end-to-end.
2. Decide whether to fix `rescope-vendor` (in-repo, dsh maintainer) before starting Phase 1, or to record an Agent Note that defers it.
3. Re-run Phase 0 with the patched `planning/Phase 0 prompt.md`; expect zero NEW failures (the pre-existing ones remain until step 1+2 above).
4. Proceed to Phase 1 only after step 3.
