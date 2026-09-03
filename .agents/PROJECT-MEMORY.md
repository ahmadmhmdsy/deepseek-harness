# Project Memory

> **Canonical, always-current project state for resuming agents.**
> Read this file first after [AGENTS.md](../AGENTS.md). Update it whenever a structural fact changes — branches landing, stack SHAs moving, a decision being made, a follow-up being closed, or a known failure being fixed.
>
> This is **not** an Agent Note (which captures one decision's rationale) and **not** a session handoff (which captures one session's trail). It is the live state of the project, structured for fast lookup.

## 1. Active stack

The App Builder stack on fork `ahmadmhmdsy/deepseek-harness-work` (PAT authenticates as `alshahia`).

| Layer | Branch | Tip | PR | Status |
|---|---|---|---|---|
| Base (fork master) | `master` | `9b38f16feda` (web-reskin PR #2 merge) | — | public |
| Phase 1.5 → 2.4 stack | `feat/phase2-4-projection-ui` | `32b10fda0d` | **#14** | open, stacked on master |
| Phase 2.5 (deployments + preview-iframe panes) | `feat/phase2-5-ui-eventsource` | `68c6ed62d7` | **#15** | open, stacked on #14 |
| Handoff (multi-session narrative) | `phase2-5-handoff-draft` | `a14df0d7c2` | — | open, pending merge once 2.5 lands |

Stack rule: each phase lands on the previous phase's branch; the upstream-most PR (#14) merges first; GitHub auto-retargets dependents. Never rewrite to drop ancestor commits unless they introduce a known regression.

## 2. PR scope and what landed where

| Phase | Scope | Diff vs prev | Commits | Notes |
|---|---|---|---|---|
| 1.5 | App Builder Host BFF cluster, tool policy, deployment registry | foundation | many | landed on local `cc317420c369`; not yet on fork master |
| 2.1, 2.2, 2.3 | Project lifecycle, deployments host, preview-stream host | incremental | stacked on 1.5 | included in #14's diff |
| 2.4 | Projection cache wiring + `sessionCounts` from projection to projects pane | incremental | stacked on 2.3 | PR #14 head |
| 2.5 | `ui-app-builder-deployments` + `ui-app-builder-preview-iframe` Client panes + BFF `./typert`/`./remote` exports | +3,978 / −36, 50 files, 5 commits | stacked on 2.4 | PR #15 head |

PR #14 carries the entire Phase 1.5 → 2.4 stack as a single 1,095-commit diff vs `master` per the option-(d) trade-off agreed in session 7. PR #15 carries only Phase 2.5 as a focused 5-commit diff vs PR #14's branch.

## 3. Architectural decisions (in effect)

- **App Builder is a Host-side BFF + Client-side Cordis slot system.** Host exposes typed `@Remote` methods under namespace `appBuilder` via Typert; Client mounts Remote contributions into `ctx.remote.appBuilder.*` and reads via `useSnapshot` + slot props.
- **Phase 2.5 wires BFF → Client via Option B bypass** (`ctx.remote.$mount(appBuilderApiRemote)` inside each pane's `apply`). This is a workaround for the typert-emitter output-path mismatch (`lib/typert.*` vs consumer `outDir: lib/types`); the structural fix (Option A — move emitter to `lib/types/typert.*`) is tracked separately as a 10+-package blast-radius change.
- **Async-generator SSE pattern**: `AbortController` + `signal.addEventListener('abort')` + `finally` dispose. Canonical example: `packages/api/session-controller/src/history.ts:87` `follow()`.
- **Snapshot store factory** `createSnapshotStore<T>(INITIAL_STATE)` is the only state container pattern for Client panes.
- **Slot discipline**: `kind: 'single', scope: 'root'`, filled via `ctx.slots.inject(<slot>, () => ctx.slots.register({...}, Component))` — never `ctx.slots.register` direct when filling another package's slot.
- **Locale ownership** is per-pane via `ctx.locale.register(NS, { zh, en })` + typed `LocaleNamespaceMap`. `verify-client-ui-i18n` rejects hardcoded copy.
- **English-only Agent Notes since Phase 1.5.7** — no `.zh.md` siblings, no `.i18n.yaml` for new notes. Pre-1.5.7 notes keep their bilingual triplets (grandfathered).
- **PR history by deliberate stacking.** Use `--force-with-lease=<branch>:<observed-oid>` for rewrites; never raw `--force`. Use base-branch stacking (PR base = parent PR's head branch) for dependent layers; do not use `gh stack link` here (no `gh` CLI on Windows).
- **Labels per PR**: one `kind/*` + all material `area/*` + native Issue Type. Custom labels created via `POST /repos/.../labels`.

## 4. Known carry-forward failures (out of current phase scope)

Each phase's Agent Note documents these in its §9; do not silently bundle fixes.

| Failure | First observed | Owner | Note |
|---|---|---|---|
| `getTranscript returns a cold page through ctx.sessionController.page` in `packages/app-builder/api/tests/api-methods.host.spec.ts` | Phase 2.2 | pre-2.5 | Test fixture returns `{ meta }` without `events`; `getTranscriptRemote` reads `inspection.events.at(-1)`. Tracked for a future 2.x PR. |
| Runtime gating: `app-builder-shell` slot not declared in `packages/client/ui-layout/src/client/index.ts` children table → new 2.5 panes runtime-dead | v0.1.2-alpha.1 merge | per-area 1.5.x follow-up | Documented in `2026-09-02-v0.1.2-alpha.1-app-builder-shell-children-regression.md` |
| Latent `readonly kind: 'approval' = 'approval' as const` missing on `packages/client/ui-approval/src/client/contract/slots.ts:71` | Phase 2.3 | per-area 1.5.x | Triggers `verify-cordis-inspect-catalog` failure; one-line fix. |
| Pre-existing oxlint / verify-md-links / verify-doc-budgets baseline | Phase 1.5 | various | CI carries these; not blocking per-PR. |
| Web seed-map static-link regression | v0.1.2-alpha.1 merge | fixed in 2.5 (`7a4ee612d1`) | Promoted `zustand` + `immer` to `apps/web` devDependencies. |

## 5. In-flight work and next steps

1. **Merge PR #14** in GitHub UI.
2. **PR #15 auto-retargets** from `feat/phase2-4-projection-ui` to `master` after #14 lands.
3. **Merge PR #15** in GitHub UI.
4. **Land `phase2-5-handoff-draft`** (optional, recommended) to capture the multi-session narrative on `master`.
5. **Outstanding follow-ups** (each is a separate PR):
   - Per-area 1.5.x shell children-table fix (unblocks runtime)
   - Option A typert-emitter structural fix (cleans up the Option B bypass)
   - One-line `readonly kind: 'approval'` fix on `ui-approval`
   - `getTranscript` test fixture realignment
6. **After 2.5 lands**: Phase 3 work begins. Plan TBD; see `.agents/notes/implemented/architecture/` for what was deferred from 2.x.

## 6. Working environment facts

- **Repo path**: `D:\my_deepseek_harness\deepseek-harness\`
- **Remote**: `https://github.com/ahmadmhmdsy/deepseek-harness-work.git` (origin)
- **PAT retrieval**: `git credential fill` with input `protocol=https\nhost=github.com\n` → user `alshahia`, token in Windows Credential Manager
- **GitHub API**: `curl -H "Authorization: token ${GITHUB_TOKEN}" -H "Accept: application/vnd.github+json"`; payloads via `--data-binary "@<file>"`. No `gh` CLI on this Windows env.
- **Token permissions** (effective on `ahmadmhmdsy/deepseek-harness-work`): `push: true`, `triage: true`, `pull: true`, `pull_requests: write` (verified by successful PR creation in session 7).
- **PowerShell gotchas**: no `head`/`tail` aliases (use `Select-Object -First`); heredoc `<<<` fails in `-Command` (use files); `/tmp/` doesn't exist (use `$env:TEMP`); CRLF endings on Windows files trip `git diff --cached --check` "new blank line at EOF" — strip to single LF before committing Markdown touched by append operations.
- **`run_code` CWD gotcha**: `node:fs` resolves paths relative to worker CWD `D:\deepseek_harness\deepseek-harness\`; use absolute paths starting with `D:\my_deepseek_harness\deepseek-harness\` for the actual repo.
- **Lefthook pre-push runs only `pnpm run typecheck`** (~60s); pre-commit runs whitespace + vendor-manifest-guard + translation-pairing + archived-agent-notes + lint + third-party-notices (most skip when staged files don't match).
- **DSH file policy**: `danger-full-access`; approval prompts disabled.

## 7. How to use this file

- **Resuming agent**: read top-to-bottom on session start. Confirm stack SHAs in §1 are still current (`git fetch origin && git rev-parse origin/<branch>`). If a SHA moved, update §1.
- **Mid-session agent**: when you change a structural fact (open a PR, merge one, decide an architecture, document a known failure), edit the relevant section and append a one-line entry under §8 "Change log" with date and reason. Keep prose direct and concrete — no session transcripts, no design-citation residue.
- **Closing agent**: if a follow-up in §5 is resolved, move it to §4 or delete it; if a stack SHA changes, update §1; if a decision in §3 is reversed, mark it `[replaced by ...]` and link the replacement.

## 8. Change log

- **2026-09-04** — Initial creation. Captures state at end of session 8 (PR #15 stacked on PR #14, both open; handoff branch advanced to `a14df0d7c2`). Author: session 8 agent per user request to make project memory durable.