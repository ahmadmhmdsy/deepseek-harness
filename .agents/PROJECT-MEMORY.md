# Project Memory

> **Canonical, always-current project state for resuming agents.**
> Read this file first after [AGENTS.md](../AGENTS.md). Update it whenever a structural fact changes — branches landing, stack SHAs moving, a decision being made, a follow-up being closed, or a known failure being fixed.
>
> This is **not** an Agent Note (which captures one decision's rationale) and **not** a session handoff (which captures one session's trail). It is the live state of the project, structured for fast lookup.

## 1. Active stack

The App Builder stack on fork `ahmadmhmdsy/deepseek-harness-work` (PR author/committer: `ahmadmhmdsy`; tokens of `ahmadmhmdsy` are PATs of record in `.env`).

| Layer | Branch | Tip | PR | Status |
|---|---|---|---|---|
| Base (fork master) | `master` | `66696e4aed` (Phase 2.5 squash-merge of #17) | — | public |
| Phase 1.5 → 2.4 stack | `feat/phase2-4-projection-ui` | `9f31af1d6d` (squash-merge of #16) | **#16** | **merged** |
| Phase 2.5 (deployments + preview-iframe panes + project memory) | `feat/phase2-5-ui-eventsource` | `66696e4aed` (squash-merge of #17) | **#17** | **merged** |
| Handoff (multi-session narrative) | `phase2-5-handoff-draft` | `a14df0d7c2` | — | open, pending merge once 2.5 lands |
| Wiring-fix stack (5 bugs blocking `dsh --profile app-builder-web`) | `fix/app-builder-api-remotes-de-dup-rebased` | `db51020f95` | **#21** | **open** — branch created from origin/master, 3 cherry-picked wiring commits + PROJECT-MEMORY update; lefthook typecheck PASS; ready for squash-merge via admin override |
| Wiring-fix stack (orphaned, base = Phase 1.5 / 1.5.5) | `fix/app-builder-api-remotes-de-dup` | `2d5c972043` | #18 / #20 / #21 | **abandoned** — superseded by rebased branch above; branches retained for reference |

Stack rule: each phase lands on the previous phase's branch; the upstream-most PR (#16) merges first; GitHub auto-retargets dependents. Never rewrite to drop ancestor commits unless they introduce a known regression.

PR numbering note: the original PRs #14 + #15 were opened with a token that authenticated as a different GitHub account (`alshahia`); they were closed unmerged and re-opened as #16 + #17 to attribute the PRs to the actual repo owner `ahmadmhmdsy`. The underlying branches (`feat/phase2-4-projection-ui` @ `32b10fda0d`, `feat/phase2-5-ui-eventsource` @ `b6fdfcf29b`) are unchanged; only the PR authorship differs.

PR #16 + #17 were squash-merged via admin override into `master` and re-targeted origin/master to `66696e4aed`. PRs #18 + #20 + #21 (wiring-fix stack) were opened against an earlier base (`8994998859` Phase 1.5 / 1.5.5) and never landed; they are now superseded by `fix/app-builder-api-remotes-de-dup-rebased`.

## 2. PR scope and what landed where

| Phase | Scope | Diff vs prev | Commits | Notes |
|---|---|---|---|---|
| 1.5 | App Builder Host BFF cluster, tool policy, deployment registry | foundation | many | landed on local `cc317420c369`; not yet on fork master |
| 2.1, 2.2, 2.3 | Project lifecycle, deployments host, preview-stream host | incremental | stacked on 1.5 | included in #16's diff |
| 2.4 | Projection cache wiring + `sessionCounts` from projection to projects pane | incremental | stacked on 2.3 | PR #16 head |
| 2.5 | `ui-app-builder-deployments` + `ui-app-builder-preview-iframe` Client panes + BFF `./typert`/`./remote` exports + project memory | +4,080 / −36, 52 files, 6 commits | stacked on 2.4 | PR #17 head |

PR #16 carries the entire Phase 1.5 → 2.4 stack as a single 1,095-commit diff vs `master` per the option-(d) trade-off agreed in session 7. PR #17 carries Phase 2.5 as a focused 6-commit diff vs PR #16's branch (5 Phase-2.5 commits + 1 docs commit for `.agents/PROJECT-MEMORY.md` and the AGENTS.md pointer).

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

1. **PR #21 opened** (head `fix/app-builder-api-remotes-de-dup-rebased` @ `db51020f95` → `master`). mergeable=True. Three commits cherry-picked from `fix/app-builder-api-remotes-de-dup` onto `origin/master` (`66696e4aed`); two conflict hunks resolved manually (kept Phase 2.1 / 2.2 rows in app-builder patch; chose `ctx.provide` over `ctx.reflect.provide` in snapshot-bridge source). Lefthook typecheck PASS (69.05s).
2. **Squash-merge PR #21 via admin override** (`PUT /repos/ahmadmhmdsy/deepseek-harness-work/pulls/21/merge`).
3. **Close orphaned PRs #18 + #20** with a comment linking to PR #21 (the OLD PR #21 was closed earlier in this session and the number was reused for the new rebased PR).
4. **Land `phase2-5-handoff-draft`** (optional, recommended) to capture the multi-session narrative on `master`.
5. **Outstanding follow-ups** (each is a separate PR):
   - Per-area 1.5.x shell children-table fix (unblocks runtime)
   - Option A typert-emitter structural fix (cleans up the Option B bypass)
   - One-line `readonly kind: 'approval'` fix on `ui-approval`
   - `getTranscript` test fixture realignment
   - `verify-cordis-config` errors on `app-builder-deployments` + `app-builder-preview-iframe` Client UI rows (Phase 2.5 added rows without tsconfig path mappings or `apps/cli/package.json` deps)
6. **After wiring-fix lands**: Phase 3 work begins. Plan TBD; see `.agents/notes/implemented/architecture/` for what was deferred from 2.x.

## 6. Working environment facts

- **Repo path**: `D:\my_deepseek_harness\deepseek-harness\`
- **Remote**: `https://github.com/ahmadmhmdsy/deepseek-harness-work.git` (origin)
- **Credentials** (in order of preference):
  1. `.env` file at the repo root — `GITHUB_TOKEN_ahmadmhmdsy` is the canonical token for `ahmadmhmdsy` operations (PRs, pushes, GitHub API). Authenticates as `ahmadmhmdsy` (id 35102575) with `admin: true, push: true, triage: true, pull: true`.
  2. Windows Credential Manager — `git credential fill` with input `protocol=https\nhost=github.com\n` retrieves a token authenticating as `alshahia` (id 118257197) with `push: true, triage: true, pull: true, pull_requests: write`. **Use only when `.env` is unavailable** — prefer `.env` so PR author/committer is `ahmadmhmdsy`, the actual repo owner.
- **GitHub API**: `curl -H "Authorization: Bearer ${GITHUB_TOKEN_ahmadmhmdsy}" -H "Accept: application/vnd.github+json"`; payloads via `--data-binary "@<file>"`. No `gh` CLI on this Windows env.
- **PowerShell gotchas**: no `head`/`tail` aliases (use `Select-Object -First`); heredoc `<<<` fails in `-Command` (use files); `/tmp/` doesn't exist (use `$env:TEMP`); CRLF endings on Windows files trip `git diff --cached --check` "new blank line at EOF" — strip to single LF before committing Markdown touched by append operations.
- **`run_code` CWD gotcha**: `node:fs` resolves paths relative to worker CWD `D:\deepseek_harness\deepseek-harness\`; use absolute paths starting with `D:\my_deepseek_harness\deepseek-harness\` for the actual repo. `process.env.TEMP` resolves to `/tmp/` here even on Windows — use literal `C:\Users\AHMADM~1\AppData\Local\Temp\` paths when writing via node `fs`.
- **Lefthook pre-push runs only `pnpm run typecheck`** (~60s); pre-commit runs whitespace + vendor-manifest-guard + translation-pairing + archived-agent-notes + lint + third-party-notices (most skip when staged files don't match).
- **DSH file policy**: `danger-full-access`; approval prompts disabled.

## 7. How to use this file

- **Resuming agent**: read top-to-bottom on session start. Confirm stack SHAs in §1 are still current (`git fetch origin && git rev-parse origin/<branch>`). If a SHA moved, update §1.
- **Mid-session agent**: when you change a structural fact (open a PR, merge one, decide an architecture, document a known failure), edit the relevant section and append a one-line entry under §8 "Change log" with date and reason. Keep prose direct and concrete — no session transcripts, no design-citation residue.
- **Closing agent**: if a follow-up in §5 is resolved, move it to §4 or delete it; if a stack SHA changes, update §1; if a decision in §3 is reversed, mark it `[replaced by ...]` and link the replacement.

## 8. Change log

- **2026-09-04** — Initial creation. Captures state at end of session 8 (PR #15 stacked on PR #14, both open; handoff branch advanced to `a14df0d7c2`). Author: session 8 agent per user request to make project memory durable.
- **2026-09-04 (same day)** — Token correction: original PRs #14 + #15 were opened using a token that authenticated as `alshahia`. Closed unmerged; re-opened as **PR #16** (Phase 2.4, +335,985 / −128,231, 6,554 files, 1,095 commits) and **PR #17** (Phase 2.5, +4,080 / −36, 52 files, 6 commits) using `GITHUB_TOKEN_ahmadmhmdsy` from `.env`. Authorship now correctly attributed to `ahmadmhmdsy` (repo owner). Updated §1 / §2 / §5 / §6 to reflect new PR numbers, token preference, and the added project-memory commit (`b6fdfcf29b`) in the 2.5 tip.
- **2026-09-05 (later)** — Phase 2.4 + 2.5 landed: PR #16 squash-merged (`9f31af1d6d`), PR #17 squash-merged (`66696e4aed`); origin/master advanced to `66696e4aed`.
- **2026-09-05 (later)** — Discovered the wiring-fix stack (PRs #18 + #20 + #21, branch `fix/app-builder-api-remotes-de-dup` @ `2d5c972043`) had been authored against an old base (`8994998859` Phase 1.5 / 1.5.5) and never reached origin/master. origin/master carries the same 4 wiring bugs PR #21 was created to fix. PRs #18 + #20 + #21 are now superseded.
- **2026-09-05 (later)** — Created `fix/app-builder-api-remotes-de-dup-rebased` from origin/master HEAD `66696e4aed` to re-apply the 3 wiring-fix commits on Phase 2.5. Stash created (empty `.tmp/`) prior to checkout; popped after branch creation.
- **2026-09-05 (later)** — Cherry-picked `6804e3d946` (auto-merge) and `58a81cdd43` (auto-merge); manually resolved 2 conflict hunks on `2d5c972043` (kept Phase 2.1 / 2.2 deployment + tool-policy rows in `bundle/app-builder/cordis.patch.yml`; chose `ctx.provide` over `ctx.reflect.provide` in `snapshot-bridge/src/index.ts`). Lefthook pre-commit gates PASS.
- **2026-09-05 (later)** — Branch pushed (`db51020f95`, 4 commits ahead of origin/master); lefthook pre-push typecheck PASS (69.05s); opened **PR #21** (https://github.com/ahmadmhmdsy/deepseek-harness-work/pull/21, mergeable=True).
- **2026-09-05 (later)** — Confirmed two pre-existing issues NOT introduced by this PR: (1) `snapshot-bridge/tests/loader-composition-invariant.spec.ts` 2/2 tests fail identically on origin/master; (2) `verify-cordis-config` reports 4 errors identically on origin/master (Phase 2.5 added `app-builder-deployments` + `app-builder-preview-iframe` Client UI rows without tsconfig path mappings).