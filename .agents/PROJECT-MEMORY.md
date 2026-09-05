# Project Memory

> **Canonical, always-current project state for resuming agents.**
> Read this file first after [AGENTS.md](../AGENTS.md). Update it whenever a structural fact changes — branches landing, stack SHAs moving, a decision being made, a follow-up being closed, or a known failure being fixed.
>
> This is **not** an Agent Note (which captures one decision's rationale) and **not** a session handoff (which captures one session's trail). It is the live state of the project, structured for fast lookup.

## 1. Active stack

The App Builder stack on fork `ahmadmhmdsy/deepseek-harness-work` (PR author/committer: `ahmadmhmdsy`; tokens of `ahmadmhmdsy` are PATs of record in `.env`).

| Layer | Branch | Tip | PR | Status |
|---|---|---|---|---|
| Base (fork master) | `master` | `1a4f4412c3` (squash-merge of #21) | — | public |
| Phase 1.5 → 2.4 stack | `feat/phase2-4-projection-ui` | `9f31af1d6d` (squash-merge of #16) | **#16** | **merged** |
| Phase 2.5 (deployments + preview-iframe panes + project memory) | `feat/phase2-5-ui-eventsource` | `66696e4aed` (squash-merge of #17) | **#17** | **merged** |
| Handoff (multi-session narrative) | `phase2-5-handoff-draft` | `a14df0d7c2` | — | open, pending merge once 2.5 lands |
| Wiring-fix stack (5 bugs blocking `dsh --profile app-builder-web`) | `fix/app-builder-api-remotes-de-dup-rebased` | `1a4f4412c3` (squash-merge into `master`) | **#21** | **merged** — admin-override squash on 2026-09-05; 8 files / +338 / −24; 3 cherry-picked commits + PROJECT-MEMORY; pre-existing `snapshot-bridge` tests + `verify-cordis-config` Phase-2.5 errors documented in PR body |
| Wiring-fix stack (pre-Phase 2.5 base `8994998859`) | `fix/app-builder-api-remotes-de-dup` | `2d5c972043` | #21 (closed) + #18/#20 (against `adopt/api-gateway-cluster`, merged 2026-09-05 06:39Z / 07:40Z) | **superseded** — same 3 wiring-fix commits were cherry-picked onto `master` and squash-merged via #21 (rebased); the api-gateway-cluster merges predated the rebased PR |

Stack rule: each phase lands on the previous phase's branch; the upstream-most PR (#16) merges first; GitHub auto-retargets dependents. Never rewrite to drop ancestor commits unless they introduce a known regression.

PR numbering note: the original PRs #14 + #15 were opened with a token that authenticated as a different GitHub account (`alshahia`); they were closed unmerged and re-opened as #16 + #17 to attribute the PRs to the actual repo owner `ahmadmhmdsy`. The underlying branches (`feat/phase2-4-projection-ui` @ `32b10fda0d`, `feat/phase2-5-ui-eventsource` @ `b6fdfcf29b`) are unchanged; only the PR authorship differs.

PR #16 + #17 + #21 were squash-merged via admin override into `master` (`9f31af1d6d`, `66696e4aed`, `1a4f4412c3` respectively). Origin/master is now at `1a4f4412c3`. PRs #18 + #20 from the original wiring-fix stack landed in `adopt/api-gateway-cluster` (not `master`); PR #21 was closed unmerged and its number reused for the rebased-on-master branch, which then merged.

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
- **App Builder work runs under `$DSH_HOME=~/.appbuilder`** (configurable via `DSH_HOME` env var). The running DSH harness keeps its default `$DSH_HOME=~/.dsh`; an App Builder profile, session, projection, or credential added under that tree would clobber the running DSH's home. Profile dir at `$DSH_HOME/profiles/app-builder-web/` links the three workspace bundles (`@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-web-app`, `@deepseek-ai/dsh-app-builder`). Rationale, alternatives, consequences in [app-builder-dsh-home-isolation](notes/implemented/process/2026-09-05-app-builder-dsh-home-isolation.md).
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

1. **PR #21 squash-merged into master at `1a4f4412c3` (2026-09-05).** 5 host-scope wiring bugs are now on master: dropped duplicate `api-remotes` + `api-session-controller` from `bundle/app-builder` (web-app already declares them); `app-builder-persona` now `disabled: true`; `app-builder-snapshot-bridge` row has `inject: [webServer, appBuilderProjects]` AND `provide: [appBuilderSnapshotBridge]`; source uses `ctx.provide(...)` + `export const provide` and no `export default apply`; `defaultProfile: app-builder` on `app-builder-project`; `snapshotUrl` on `app-builder-projects` is a plain string. PR #18 + #20 from the original wiring-fix stack are already merged into `adopt/api-gateway-cluster` (06:39Z / 07:40Z 2026-09-05), so all 3 PR numbers in the lineage are now closed.
2. **Post-merge live-boot verification** on `DSH_HOME=~/.appbuilder` using `dsh --profile app-builder-web`. Last verified before #21, in a separate worktree; the master squash now has identical wiring to that state. Optional smoke: `pnpm dsh --profile app-builder-web` (REPL), `GET http://localhost:3080/__dsh/app-builder/snapshot.json` returning cached snapshot, `pnpm test` snapshot suite passing keyless cases. Not run yet this session.
3. **Land `phase2-5-handoff-draft`** (optional, recommended). Tip `a14df0d7c2`. Captures the multi-session narrative plus carry-forward items. Worth a PR.
4. **Outstanding follow-ups** (each a separate PR; not blocked on each other):
   - Per-area 1.5.x: shell children-table fix (runtime gating for 2.5 panes).
   - Option A: typert-emitter structural fix (move emitter to `lib/types/typert.*`, retire Option B bypass).
   - One-line `readonly kind: 'approval'` on `packages/client/ui-approval/src/client/contract/slots.ts:71`.
   - `getTranscript` test fixture realignment in `packages/app-builder/api/tests/api-methods.host.spec.ts`.
   - `verify-cordis-config` errors on `app-builder-deployments` + `app-builder-preview-iframe` Client UI rows (Phase 2.5 added rows without tsconfig path mappings or `apps/cli/package.json` deps).
   - `snapshot-bridge/tests/loader-composition-invariant.spec.ts` 2 failing tests: pre-existing on Phase-2.5 master (verified at `66696e4aed`); test path uses direct `ctx.plugin()` and diverges from live-boot Loader semantics. Investigate whether to switch the test to the Loader path or to record the divergence as expected.
5. **Pre-existing issues carried in PR #21 body**: snapshot-bridge 2/2 tests fail (also fail on `66696e4aed`); verify-cordis-config 4 errors (also on `66696e4aed`). Both confirmed by running the same checks in a clean worktree at `66696e4aed`. Reviewers should not misattribute them.
6. **Phase 3 begins after wiring-fix lands.** Plan TBD; see `.agents/notes/implemented/architecture/` for what was deferred from 2.x.

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
- **2026-09-05 (squash-merge)** — `PUT /repos/ahmadmhmdsy/deepseek-harness-work/pulls/21/merge` returned `sha=1a4f4412c30d11c399696f3824864ffe0ce0ff20, merged=true`. Origin/master advanced `66696e4aed` → `1a4f4412c3`. Squash commit lands 8 files / +338 / −24 across `packages/bundle/{app-builder,web-app}/cordis.patch.yml`, `packages/app-builder/snapshot-bridge/src/index.ts`, `.agents/PROJECT-MEMORY.md`, plus the bilingual [`app-builder-dsh-home-isolation`](notes/implemented/process/2026-09-05-app-builder-dsh-home-isolation.md) triplet and a plan artifact (`plan-app-builder-web-boot-wiring.md`). PRs #18 + #20 (original wiring-fix stack against `adopt/api-gateway-cluster`) already merged pre-this-session at 06:39Z / 07:40Z, so no orphans required closing. §1 updated to mark master tip + #21 merged, orphan-row re-explained, §3 links to the new DSH_HOME isolation agent note, §5 in-flight rewritten to mark squash-merge done and add post-merge live-boot verification + pre-existing-issues notes, §8 this entry.
