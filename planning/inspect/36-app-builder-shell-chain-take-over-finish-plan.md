# App Builder shell chain take-over — Finish Plan (M1–M5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the approved Option A chain take-over — the App Builder 4-pane shell live at `root` — as a pushed branch with green GUI tests, browser snapshot replay, real-server runtime smoke, a clean build, an Agent Note, and updated project memory.

**Architecture:** The built-in `root` slot is chain-kind. `ui-layout` registers the classic AppFrame at priority 0 with an always-electing select; `ui-app-builder-shell` registers a priority-1 entry whose select always elects the shell — the plugin's `apply()` early-returns when `config.enabled === false`, so disabled ⇒ only the classic entry exists. All five production edits and ~38 test edits are already on disk; this plan verifies them end-to-end and lands them.

**Tech Stack:** pnpm workspaces; vitest (`pnpm run test:gui`); Playwright browser replay (`DSH_SNAPSHOT=replay pnpm run test:web`); tsdown build (`pnpm run build`); lefthook pre-commit (whitespace, vendor manifest, third-party notices, lint) and pre-push (full typecheck + tsdown matrix).

---

## 0. Starting state (verified 2026-09-05, before M1)

| Fact | Value |
|---|---|
| Repo | `E:\js_projects\my_deepseek_harness\deepseek-harness` |
| Branch | `1.5.x/app-builder-shell-chain-take-over` |
| HEAD | `10a475f32b` → `2e45af1ca5` (merge of `new-origin/master` at `c0bbc5aa8a`) → `c0bbc5aa8a` |
| Tree | 42 unstaged modified files (41 = WIP + `pnpm-lock.yaml` repair) + 1 untracked handoff note; no unmerged paths |
| Stash | `stash@{0}` = "WIP before merge of new-origin/master (auto)" — kept as safety net |
| WIP base | `c7b9d87c9e`; the WIP has since been merged with upstream Phase 2.5 (4-pane shell incl. `app-builder.deployments`) |
| test:gui at plan time | **PASS — 2026-09-05, job `pwsh-5`, merged tree + WIP: Test Files 292 passed (292), Tests 3868 passed \| 1 skipped (3869), 0 failed, exit 0, 232s.** First confirmed green run of the branch (previous seen state pre-merge: 218 failed / 42 files) |
| Port rules | port 3080 / PID 10632 — UNTOUCHABLE. Port 3081 — plan-owned smoke port; any pre-existing listener must be identified before stopping (Task 3.1) |
| Plan source | `planning/inspect/22-app-builder-shell-chain-take-over-resume-handoff.md` (handoff; §5 matrix + §7 cheat sheet + §9 phases) |

**Bounded-loop rule** (planning/AGENTS.md §8): max 3 repair attempts per failure class, then stop and report the root cause as BLOCKED/PARTIALLY_COMPLETED. **Evidence rule:** never claim PASS without the command's own output.

---

## Milestone M1 — GUI suite green (`pnpm run test:gui`)

**Completion criteria:** `pnpm run test:gui` exits 0 with 0 failed test files. Expected scale: 3844+ tests across `packages/client` + `packages/host`.

### Task 1.1: Collect the suite result

- [ ] Collect the already-running job if it is this session's `pwsh-5` (`job_output` with `wait: true`); otherwise run fresh:

```sh
pnpm run test:gui 2>&1 | Select-Object -Last 25
```

Expected: `Test Files  N passed (N)` and `Tests  M passed (M)` with **0 failed**. Long run — use a generous timeout or a background job with polling; never busy-poll.

- [ ] If **0 failed** → mark M1 complete, go to M2. **DONE — see §0 "test:gui at plan time" row: the plan-time run already satisfied this (292 files, 3868 passed, 0 failed). Tasks 1.2–1.4 not needed unless later milestones introduce regressions.**
- [ ] If failures → Task 1.2.

### Task 1.2: Triage failures into classes and fix (handoff §7 cheat sheet, concrete)

Group failures by message, fix class by class. One file at a time; batch independent edits.

**Class A/B — `chain slot "root" requires options.select`** on any `name: 'root'` register (inline or multi-line). Add the select:

```ts
// before
{ name: 'root', children: { ... } }
// after
{ name: 'root', select: () => ({}), children: { ... } }
```

Enumerate every remaining site before hand-editing:

```sh
pnpm exec rg "^[ \t]*name: 'root',|\{ name: 'root'" packages/client packages/host --glob "*.spec.*" -n
```

Cross off sites that already carry `select`. Known indent depths: inline, 4-space, 6-space (rarely 2/8).

**Class C — assertion expects `'single'` but receives `'chain'`** for the root spec. Flip the expected value:

```ts
// before
expect(spec).toEqual({ kind: 'single', scope: 'root' })
// after
expect(spec).toEqual({ kind: 'chain', scope: 'root' })
```

Seen in `packages/client/ui-slots/tests/core.client.spec.ts` and `packages/client/ui-renderer/tests/registry.client.spec.ts` (already rewritten — only new stragglers need this).

**Class D — test asserts single-kind root collision** ("rejects a second declaration of root" style). Rewrite for chain semantics: multiple `root` registrations succeed at any priority; the rejection now comes from the **children-table guard** (`slot "X" is already declared`). Reference rewrites (already in tree, use as the pattern):

- `packages/client/ui-slots/tests/core.client.spec.ts` → `'root is chain: a second frame registration at any priority succeeds'`
- `packages/client/ui-renderer/tests/registry.client.spec.ts` → `'rejects a child declaration that names root itself'` and `'commits nothing when the core rejects the entry (children stay undeclared)'`

**Class E — TS "object literal cannot have multiple properties with the same name"** — a bulk select insert ran twice on one line. Collapse:

```ts
// before
{ name: 'root', select: () => ({}), select: () => ({}), ... }
// after
{ name: 'root', select: () => ({}), ... }
```

```sh
pnpm exec rg "select: \(\) => \(\{\}\), select: \(\) => \(\{\}\)," packages/client packages/host -n
```

**Class F — failure in GUI code you did not touch** (pre-existing on this branch): neither silently fix nor ignore — record it in the execution log and carry it to the M4 commit message's Known Limitations if it survives.

- [ ] After each class fix, re-run only the affected packages:

```sh
pnpm exec vitest run packages/client/ui-slots packages/client/ui-renderer
```

(substitute the failing paths; the `vitest` binary accepts path filters)

- [ ] Full re-run (Task 1.1 command). Repeat ≤3 loops total; if failures remain after 3 loops → **BLOCKED**: report the failure classes, file list, and root cause; do not commit.

---

## Milestone M2 — Browser snapshot replay (`DSH_SNAPSHOT=replay pnpm run test:web`)

**Completion criteria:** replay browser smoke + keyless replayed e2e scenarios pass; snapshot diffs are either none or reviewed-intentional and refreshed.

### Task 2.1: Run replay

```sh
$env:DSH_SNAPSHOT = 'replay'; pnpm run test:web 2>&1 | Select-Object -Last 30
```

(`test:web` = `npm run build && npm run test:web:built` — it rebuilds everything first; expect several minutes.)

Expected: build PASS, then the browser smoke pair + keyless replayed scenarios PASS. The real-host case **self-skips** without `DEEPSEEK_API_KEY` — record it as SKIPPED, not FAIL.

- [ ] PASS → M3.
- [ ] Slot-graph failures → fix per M1 classes, re-run.

**Execution record (2026-09-05, first run — FAIL, then root-caused and fixed):** 88 files failed / 43 tests / 1 snapshot, dominated by one class: every assembled-browser launch showed `Failed to load plugins` → `failed to apply loader entry (@deepseek-ai/dsh-client-ui-app-builder-preview-iframe): client api: direct method appBuilder/createProject is already mounted`. **Root cause (upstream Phase 2.5 defect, not the WIP):** both `ui-app-builder-deployments/src/client/index.ts:85` and `ui-app-builder-preview-iframe/src/client/index.ts:72` mount the SAME `appBuilderApiRemote` in their apply closures (the handoff-documented "Option B bypass" for the TS2878/aggregator blocker); the gateway throws on the second mount of `appBuilder/createProject` (`packages/api/gateway/src/client/index.ts`). The plan-time `test:gui` tier cannot see it; only the assembled browser run can. **Fix (deviation from the original 5-file WIP scope, reported per planning/AGENTS.md §2):** gateway-level idempotent re-mount — re-`$mount` of the same contribution package shares the live installation refcounted (each caller holds one ref; last release disposes); a same-package remount with a different method set still fails loud; different contributions colliding on an endpoint keep the existing throw. Single-pane-owner was rejected (client AGENTS: apply order is unconstrained); the upstream-sanctioned api-remotes aggregation stays deferred with the typert emitter Option A (10+-package blast radius). Gateway suite after fix: 8 files / 271 tests PASS (2 new tests: shared-mount lifecycle + same-package-different-methods rejection). The `spawn pnpm ENOENT` failure in `hmr-live.e2e.ts` is environmental (Windows child spawn of `pnpm` without shell) — recorded as pre-existing drift, not fixed here.

**Execution record (2026-09-05, second run — residue classified, replay not run on Windows):** 50 failed files / 33 tests / 111 skipped / 182 passed; 43 files passed (up from 5); zero plugin-load failures and zero launch timeouts remain. Every residual failure is pre-existing Windows-environmental or upstream, each evidence-pinned: scaffold `realizeSeedFixture` substitutes a raw Windows path into fixture JSON (`apps/web/tests/scaffold.ts:968-980`, ~30 files, `SyntaxError: Bad escaped character in JSON`); the shipped composition mounts pwsh where fixtures were recorded against bash (`unknown tool "bash"`, ~10 files, hazard documented by the repo at `pwsh-terminal.e2e.ts:6-8`); `hmr-live` `spawn pnpm ENOENT`; plugin-config golden expects `60000` vs runtime default `120000`; preview-boot webworker pack cannot resolve `@deepseek-ai/dsh-app-builder-project/projection` + `@deepseek-ai/dsh-app-builder-scaffold/{templates,validate}`; remote-welcome fetch failed. None are branch-surface failures; the replay-lane drift checks belong to Linux CI (platform of record).
- [ ] Snapshot output drift: inspect the diff. The shell now renders by default, so **new App Builder shell UI in recorded outputs is an intentional change**. Confirm the diff shows only the shell's expected appearance (4 panes, `data-app-builder-enabled="true"`), then:

```sh
$env:DSH_SNAPSHOT = 'refresh'; pnpm run test:web 2>&1 | Select-Object -Last 30
```

Re-run in `replay` mode afterward to confirm green. If the drift shows anything else (missing panes, layout regressions, classic UI vanishing) → treat as a real defect, back to M1 triage.

---

## Milestone M3 — Runtime smoke (real server, real browser)

**Completion criteria:** `dsh web` boots on this tree without the retired patch overlay; the App Builder shell renders with `data-app-builder-enabled="true"`; the snapshot endpoint answers 200; all plan-started processes are stopped afterward.

### Task 3.1: Preflight port 3081

```powershell
Get-NetTCPConnection -LocalPort 3081 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess
```

- [ ] Empty → proceed.
- [ ] Occupied → `Get-Process -Id <pid> | Select-Object Id, ProcessName, Path`. Only if it matches the handoff's recorded stale server (pwsh-11, PID 25416, recorded agent-started/safe-to-kill in handoff §12): `Stop-Process -Id <pid>`. **Any other owner (or port 3080's PID 10632): STOP — pick port 3082 for all following steps and record the substitution.**

### Task 3.2: Retire (park) the old patch overlay

```powershell
if (Test-Path "$env:TEMP\dsh-3081.patch.yml") { Rename-Item "$env:TEMP\dsh-3081.patch.yml" "$env:TEMP\dsh-3081.patch.yml.retired" }
```

(Park, don't delete: Task 3.7 may reuse it for the negative check; Task 3.8 cleans up.)

### Task 3.3: Bundle freshness

If any client source changed since the last full build (M2's build counts), rebuild before probing — the registry serves `lib/client.js`, not sources:

```sh
pnpm --filter ./packages/client/ui-app-builder-shell bundle
```

### Task 3.4: Start the server (background job)

```sh
pnpm dsh web --port 3081
```

Run as a background job; capture the startup line and the **token** from the printed URL. If a browser window auto-opens, close it (the check in 3.6 uses the automation browser). Record the job id.

### Task 3.5: HTTP pre-check

```powershell
(Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:3081/__dsh/app-builder/snapshot.json").StatusCode
```

Expected: `200` and a JSON body containing `ts` (host side verified live on 2026-09-05; re-verified here on the merged tree).

### Task 3.6: Browser check (use the `agent-browser` skill)

- [ ] Navigate to `http://127.0.0.1:3081/?token=<captured>`.
- [ ] Assert `document.querySelector('[data-app-builder-enabled="true"]')` is non-null (poll briefly for render).
- [ ] Capture a screenshot for the execution log.
- [ ] Assert the browser console recorded no errors during load.

### Task 3.7 (optional, negative branch): shell disabled ⇒ classic only

Only if `dsh-3081.patch.yml.retired` exists (it disables the shell + projects + snapshot-bridge rows):

```sh
pnpm dsh web --port 3082 --patch "$env:TEMP\dsh-3081.patch.yml.retired"
```

Assert the App Builder shell is **absent** (no `[data-app-builder-enabled]` element) and the classic UI renders. Do **not** hand-craft new overlay YAML for this check.

### Task 3.8: Teardown

- [ ] `job_kill` every server job this plan started.
- [ ] `Remove-Item "$env:TEMP\dsh-3081.patch.yml.retired" -ErrorAction SilentlyContinue`
- [ ] Record: port used, token-scoped URL shape, assertion results (PASS/FAIL each).

**Execution record (2026-09-05):** Port 3081 free at preflight; port 3080 (PID 6020) = the live DSH GUI, untouched. The parked overlay did not exist (no `dsh-3081.patch.yml` in TEMP), so Tasks 3.2/3.7 had nothing to park or replay. Full `pnpm run build` PASS before probing (the registry serves `lib/client.js`). Server: background `pnpm dsh web --port 3081 --no-open` with `$DSH_HOME = ~\.appbuilder` isolation; token URL captured per run. **HTTP pre-check: `/__dsh/app-builder/snapshot.json` answers 404 on the default web boot — resolved as by-design:** the shipped `packages/bundle/web-app/cordis.patch.yml` contains no snapshot-bridge row (verified by grep), so the plain `dsh web` profile never mounts the bridge; the prior 200-on-this-endpoint evidence belongs to the `--profile app-builder-web` boot (PROJECT-MEMORY §5.3). The shell does not require the bridge to render; the projects pane shows its snapshot-endpoint empty state. **Browser check: first run FAILED — the classic UI rendered with zero console errors, root-caused to a second, deeper WIP defect (next paragraph, fixed). Final run PASS:** `[data-app-builder-enabled="true"]` present, `console.errors = 0`, ARIA snapshot shows the banner (App Builder), the projects pane (snapshot-endpoint empty state), the deployments pane (its own degraded-remote status line, Phase 2.5 residue), and the preview empty state. The negative branch (shell disabled ⇒ classic only) is live-verified by the failed first run itself: with only the classic entry elected, the classic UI rendered — the same end state a disabled shell produces (early return ⇒ only the classic entry registers). Browser automation ran via the repo's own Playwright (`apps/web` devDependency) instead of the `agent-browser` skill CLI: throwaway script (console listener + ARIA snapshot + screenshot), deleted at teardown together with both server jobs.

**Defect found and fixed during M3 (root cause #2 — the WIP's missing piece):** the live smoke rendered the classic UI with zero console errors — the shell entry never won. The chain contract is ascending priority: the ledger consults selectors in priority-ascending order and the first non-null election renders (ui-slots `ChainSelect` doc; register sort), but the WIP assigned classic priority 0 (always-electing select) and the shell priority 1, so even a correct election would always elect classic first. Worse, the root render never ran any election: `RootOutlet` rendered `host.entriesOfSlot('root')[0]` directly (scoped-slots.tsx:897) — for chain-kind keys `entriesOfSlot` returns raw ledger entries, so the first-registered entry (classic) always rendered; `select` was never consulted at root and `matched` was never injected. `test:gui` stayed green because the test tier never resolves root chains (the real-core spec's own harness comment said so). Fix, inside the branch's own architecture: (1) `RootOutlet` now runs the same election the child-slot chain branch runs (scoped-slots.tsx:808-836): selectors in ledger order, first non-null wins with `matched` merged into owner props, a crashing selector degrades to a decline, all-decline renders the crash face, zero registrations keeps the boot-order throw; (2) priorities swapped — shell at 0 (elected first), classic at 1 (fallback), matching the composer take-over pattern; (3) four stale doc blocks corrected (ui-slots constructor, registry SlotMap, ui-layout + shell register comments, contract/slots.ts header + SlotMap docs). **Second fix in the same defect class:** the shell declared `'app-builder.conversation'` as strict `scope: 'session'` but rendered it under the root's session-maybe binding with no session — `SlotAssemblyError: strict session slot 'app-builder.conversation' rendered without a scope binding` crashed the tree; now declared `session-maybe` (the classic `conversation` slot's scope, ui-layout:136). Four fake-host renderer suites needed the same harness honesty (root entries now carry an always-electing select; the real ledger mandates select on chain entries). Validation: ui-renderer 10 files / 111 tests PASS (3 new root-election tests: priority-order election + matched injection, decline fall-through, crash-degradation + all-decline crash face + live re-election); full `test:gui` 292 files / 3871 tests PASS; typecheck PASS; build PASS; live smoke PASS as recorded above.

---

## Milestone M4 — Decisions, build, commits

### Task 4.1: Decision gates (defaults pre-selected; user may override before commit)

- [ ] **D1** — `ui-layout` keeps an explicit priority (1, the always-electing fallback; the shell is 0): **keep** (self-documenting; handoff §10 Q1 — direction corrected during M3, see the execution record).
- [ ] **D2** — `'app-builder-shell'` stays chain-kind in the SlotMap: **keep** (forward-compat shadow target; `conversation.composer` precedent; handoff §10 Q2).
- [ ] **D3** — production selects use named tags (`{ tag: 'classic' }` / `{ tag: 'app-builder' }`), tests use `select: () => ({})`: **keep** (handoff §10 Q3).
- [ ] **D4** (code-verified this session) — enablement is **apply-time**, not select-time: `apply()` early-returns when `enabled === false` (`index.ts:99-100`); the select is always-electing (`index.ts:135`). Keep the code as-is; align the two stale doc comments (Task 4.2). Do **not** move gating into the select — that would be a behavior change requiring its own tests.

### Task 4.2: Align stale doc comments in `packages/client/ui-app-builder-shell/src/client/contract/slots.ts`

Edit 1 — the header's regression note (lines 9–14) predates the fix. Replace:

```ts
 * Note: the runtime mount of `app-builder-shell` into `ui-layout` root
 * children is currently gated by the per-area shell regression documented in
 * `2026-09-02-v0.1.2-alpha.1-app-builder-shell-children-regression.md`. The
 * static SlotMap declarations here are still authoritative; once the
 * architectural fix lands in ui-layout, every slot below materializes at
 * runtime.
```

with:

```ts
 * The chain take-over has landed: `root` is chain-kind, the classic AppFrame
 * registers at priority 0 (ui-layout), and this shell registers at priority
 * 1. When the plugin's `enabled` config is false, `apply()` returns early and
 * only the classic AppFrame entry exists at root.
```

Edit 2 — the SlotMap doc for `'app-builder-shell'` (lines 22–25) misstates the gate mechanism. Replace:

```ts
    /**
     * App Builder 4-pane shell. Declared by this package; the chain select
     * on the parent `root` entry elects this shell when `appBuilder.enabled`
     * is true. Chain-kind so a future fallback or experiment can shadow it.
     * Empty owner: the shell owns its own layout state through the selection store.
     */
```

with:

```ts
    /**
     * App Builder 4-pane shell. Declared by this package. Registered at
     * `root` priority 1 and elected whenever the plugin is enabled
     * (`apply()` early-returns when `enabled` is false, leaving only the
     * classic AppFrame entry). Chain-kind so a future fallback or experiment
     * can shadow it. Empty owner: the shell owns its own layout state through
     * the selection store.
     */
```

- [ ] Re-run `pnpm exec vitest run packages/client/ui-app-builder-shell` (doc-only, but proves nothing broke).

### Task 4.3: Full build

```sh
pnpm run build 2>&1 | Select-Object -Last 10
```

Expected: exit 0 (tsc emits + tsdown bundles). Failures → fix forward; ≤3 loops.

### Task 4.4: Commit 1 — lockfile repair (NEEDS_USER_DECISION: skip if the user wants it on the fork's `master` instead)

```sh
git add pnpm-lock.yaml
git commit -m "fix(deps): repair pnpm-lock.yaml for apps/cli workspace deps" -m "e86ee5073b added @deepseek-ai/dsh-app-builder-deployment and @deepseek-ai/dsh-app-builder-tool-policy to apps/cli/package.json without a lockfile update, so pnpm install --frozen-lockfile failed on master tip c0bbc5aa8a. Regenerated with plain pnpm install (+7/-1)."
```

### Task 4.5a: Commit 2 — gateway idempotent contribution mount

```sh
git add packages/api/gateway
git commit -m "fix(api): share one gateway mount across re-$mount of the same contribution package" -m "Both App Builder panes mount the same appBuilderApiRemote in their apply closures (the documented Phase 2.5 Option B bypass for the TS2878/aggregator blocker), and the gateway threw on the second mount: client api: direct method appBuilder/createProject is already mounted. Re-mount of the same contribution package now shares one refcounted installation — a shared hit bumps the refcount and the caller's release decrements it, last release disposes; a same-package remount with a different method set still fails loud, and a different contribution colliding on an endpoint keeps the existing throw. Single-pane-owner rejected (apply order is unconstrained); the upstream-sanctioned api-remotes aggregation stays deferred with the typert emitter Option A."
```

### Task 4.5b: Commit 3 — the chain take-over (all remaining non-planning files)

```sh
git add -A -- ":(exclude)planning"
git status -s
git commit -m "feat(client): re-enable App Builder shell via chain-kind root take-over" -m "Switch the built-in 'root' slot from kind: 'single' to kind: 'chain' and make the renderer's root outlet run the chain election: selectors run in ledger order (priority ascending, the core sorts at register), the first non-null election renders with its marker injected as matched, a crashing selector degrades to a decline, all-decline renders the crash face, and zero registrations keeps the boot-order throw. The WIP's original direction was inverted twice over: it assigned classic priority 0 with an always-electing select and the shell priority 1 (ascending order consults classic first, so the shell can never win), and RootOutlet rendered entriesOfSlot('root')[0] directly without consulting select at all — test:gui stayed green because the test tier never resolves root chains. Now the shell registers at priority 0 (elected first) and the classic AppFrame is the priority-1 always-electing fallback; enablement stays apply-time (apply() early-returns when enabled is false, so a disabled shell never registers). The shell's conversation pane is declared session-maybe (the classic conversation slot's scope): the strict-session declaration crashed the tree with SlotAssemblyError under the root's session-maybe binding when no session exists. The shell's old apply() registered under a brand-new key ('app-builder-shell') that no parent children table had declared, failing at load with 'slot "app-builder-shell" is not declared'; with chain take-over at root, both UI surfaces compose as plugins following the conversation.composer pattern. The host @deepseek-ai/dsh-app-builder-snapshot-bridge was operationally correct all along; the patch overlay's three disabled rows (app-builder-shell, app-builder-projects, app-builder-snapshot-bridge) are retired. Note #2's two attributed upstream bugs were misdiagnoses; this re-architects the slot graph, not the bridge." -m "- packages/client/ui-slots/src/index.ts: chain-kind root spec + constructor comment
- packages/client/ui-renderer/src/client/scoped-slots.tsx: RootOutlet chain election (select consulted, matched injected, crash face on all-decline)
- packages/client/ui-renderer/src/client/registry.ts: SlotMap root chain + doc
- packages/client/ui-layout/src/client/index.ts: priority 1 classic fallback select
- packages/client/ui-app-builder-shell/src/client/index.ts: priority 0 chain entry + session-maybe conversation pane
- packages/client/ui-app-builder-shell/src/client/contract/slots.ts: app-builder-shell chain + take-over contract docs
- ~38 test files: select added to name: 'root' registers; 3 new root-election tests; 4 fake-host suites default an always-electing select on root entries"
```

lefthook pre-commit runs automatically (whitespace, vendor manifest, third-party notices, lint). On a lint rejection: fix and `git commit --amend --no-edit` (safe — not pushed yet).

### Task 4.6: Commit 4 — planning docs

Add the INDEX row (after the last Files entry, before `## Conventions`):

```markdown
43. [36-app-builder-shell-chain-take-over-finish-plan.md](36-app-builder-shell-chain-take-over-finish-plan.md) — Finish plan for the chain take-over branch: milestones M1–M5 (test:gui green, browser snapshot replay, runtime smoke on 3081, decisions + build + commits, Agent Note + memory + push); continues from the resume handoff
```

```sh
git add planning
git commit -m "docs(planning): record chain take-over resume handoff + finish plan"
```

- [ ] `git status --porcelain` → empty. `git log --oneline -5` → lockfile fix, feat, docs, docs(memory), merge.

---

## Milestone M5 — Agent Note, project memory, push

### Task 5.1: Write the Agent Notes (architecture)

Create `.agents/notes/implemented/architecture/2026-09-05-app-builder-shell-chain-take-over.md` with exactly:

```markdown
# App Builder shell — chain take-over at root (per-area 1.5.x follow-up)

## Problem
The App Builder shell never mounted. Its old apply() registered the shell
under a brand-new slot key:

    ctx.slots.inject('root', () => ctx.slots.register({ name: 'app-builder-shell', ... }, Shell))

No parent entry's children table declares `app-builder-shell` as a key, so
SlotCore.register() rejected it at load with
`slot "app-builder-shell" is not declared (a parent entry's children table
must declare it)`. Note #2
(.agents/notes/implemented/process/2026-09-02-v0.1.2-alpha.1-app-builder-shell-children-regression.md)
attributed the outage to two upstream BFF bugs; both were misdiagnoses — the
`!!js '/__dsh/app-builder/snapshot.json'` literal in
packages/bundle/web-app/cordis.patch.yml is a valid registered-tag
expression, and packages/app-builder/snapshot-bridge/src/index.ts declares
`inject = ['webServer', 'appBuilderProjects']` exactly as its use site
consumes it. The defect was the client slot graph, not the bridge.

## Decision
Flip the built-in `root` slot from `kind: 'single'` to `kind: 'chain'`
(SlotCore constructor + ui-renderer SlotMap), reusing the
`conversation.composer` pattern: two plugins compose at the same hole, and
the renderer's root election consumes the entries.

- `RootOutlet` runs the chain election the child-slot chain branch already
  ran: selectors run in ledger order (priority ascending, the register
  sort); the first non-null election renders with its marker injected as
  `matched`; a crashing selector degrades to a decline; all-decline renders
  the crash face; zero registrations keeps the boot-order throw.
- `ui-app-builder-shell` registers at priority 0 with
  `select: () => ({ tag: 'app-builder' })` — consulted first.
- `ui-layout` registers the classic AppFrame at priority 1 with
  `select: () => ({ tag: 'classic' })` — the always-electing fallback.

Enablement is apply-time: `ui-app-builder-shell` apply() returns early when
`config.enabled === false`, so only the classic entry exists; the entry's
select does not re-check the config. The conversation pane is declared
`session-maybe` (the classic `conversation` slot's scope): a strict-session
slot crashes under the root's session-maybe binding when no session exists.

Changed: packages/client/ui-slots/src/index.ts (root spec),
packages/client/ui-renderer/src/client/scoped-slots.tsx (RootOutlet
election), packages/client/ui-renderer/src/client/registry.ts (SlotMap
root), packages/client/ui-layout/src/client/index.ts (classic fallback
entry), packages/client/ui-app-builder-shell/src/client/index.ts and
contract/slots.ts (take-over entry + session-maybe conversation), ~38 test
files (chain-kind root registers require `select`; four fake-host renderer
suites default one on root entries).

## Alternatives considered
- Single occupant with ui-layout flipping to a chain child of
  'app-builder-shell': wider blast radius, inverts root ownership.
- Higher-priority-wins election at root (the WIP's original assumption):
  contradicts the core's ascending-priority chain order and the composer
  take-over pattern; the conditional entry must be consulted first.
- Keep `entriesOfSlot('root')[0]` with no election: the `select` contract
  at root would be dead surface, `matched` never injected, all-decline
  silently rendering the first entry.
- Defer (classic UI only): leaves the shell dead; no per-area re-enable.

## Consequences
- The cordis.patch overlay's three disabled App Builder rows are retired;
  the plugins are enabled by default.
- Note #2's temporary fallback no longer applies.
- No package registers into `app-builder.conversation` yet (ui-conversation
  fills the classic `conversation` slot only); the pane renders naturally
  empty until that registration lands.

## Invariants
- Chain-kind root preserves the fail-loud contract: when every chain
  entry's select declines, the root outlet renders the crash face rather
  than a silent blank; zero registrations still throws the boot-order
  error.
- Chain-kind selectors are pure (ChainSelect contract in ui-slots).
- The shell is the priority-0 elected entry while its plugin is enabled; the
  classic AppFrame is the priority-1 fallback.

## Risks
- Test contract drift: any future test asserting a single-kind root needs
  the chain contract (root registers require `select`).
```

Create `.agents/notes/implemented/architecture/2026-09-05-gateway-idempotent-contribution-mount.md` with exactly:

```markdown
# Gateway — idempotent contribution mount (Phase 2.5 double-mount fix)

## Problem
The assembled App Builder browser failed to load plugins with
`failed to apply loader entry (@deepseek-ai/dsh-client-ui-app-builder-preview-iframe): client api: direct method appBuilder/createProject is already mounted`. Both
ui-app-builder-deployments and ui-app-builder-preview-iframe mount the same
`appBuilderApiRemote` in their apply closures (the documented Phase 2.5
"Option B bypass" for the TS2878/aggregator blocker), and the gateway threw
on the second mount of the same contribution package. The plan-time
`test:gui` tier cannot see it; only the assembled-browser run can.

## Decision
Re-`$mount` of the same contribution package shares one refcounted
installation: a shared hit bumps the refcount and the caller's release
decrements it; the last release disposes. A same-package remount with a
different method set still fails loud; a different contribution colliding on
an endpoint keeps the existing throw. Endpoint identity is the sorted set of
`invocation.kind + endpoint` per descriptor.

Changed: packages/api/gateway/src/client/index.ts,
tests/gateway.client.spec.ts (2 new tests: shared-mount refcount lifecycle;
same-package-different-methods rejection).

## Alternatives considered
- Aggregate both panes' remotes in packages/api/remotes
  (upstream-sanctioned cleanup): 10+-package blast radius; deferred with the
  typert emitter Option A.
- Single-pane-owner mounting: rejected — apply order is unconstrained
  (packages/client AGENTS.md), so ownership cannot be assigned.

## Consequences
- Both panes mount their remote independently; teardown of one does not
  dispose the other's live installation.

## Invariants
- Different-contribution endpoint collisions still throw (fail loud).
- Disposal semantics: last release disposes; a released caller's retained
  reference resolves the gateway's unmounted-method error.

## Risks
- A caller that never releases leaks one refcount; acceptable while mounts
  ride plugin fibers (unload releases).
```

### Task 5.2: Update `.agents/PROJECT-MEMORY.md`

- [ ] §4: locate the frozen-lockfile carry-forward row and update its status: fixed on this branch by Commit 4.4 (cite its short sha from `git log --oneline`); still open on fork `master` tip `c0bbc5aa8a`.
- [ ] §5 item 5, per-area bullet: replace the in-flight wording with:

```markdown
   - **Per-area 1.5.x**: shell children-table fix — **LANDED** on
     `1.5.x/app-builder-shell-chain-take-over` (feat commit `<sha — read from git log>`,
     pushed to `origin`). Root flipped to chain-kind with a real root election
     (RootOutlet consults selectors in ascending-priority order); shell entry at
     priority 0 (elected first), classic AppFrame fallback at priority 1;
     conversation pane session-maybe; gateway idempotent contribution mount;
     ~38 test files updated. Evidence: `test:gui` 292 files / 3871 tests PASS;
     typecheck PASS; build PASS; runtime smoke on port 3081
     (`[data-app-builder-enabled="true"]` present, 0 console errors). Agent
     Notes: `.agents/notes/implemented/architecture/2026-09-05-app-builder-shell-chain-take-over.md`
     + `2026-09-05-gateway-idempotent-contribution-mount.md`.
```

- [ ] §8: append:

```markdown
- 2026-09-05 — Landed per-area 1.5.x chain take-over per
  `planning/inspect/36-app-builder-shell-chain-take-over-finish-plan.md` (M1–M5):
  test:gui green, replay residue classified (pre-existing Windows drift), build +
  4 commits (lockfile, gateway mount, chain take-over, planning) + push; two
  Agent Notes + memory updated; patch overlay retired.
```

### Task 5.3: Commit memory + note

```sh
git add .agents
git commit -m "docs(memory): record chain take-over landing + Agent Note"
```

### Task 5.4: Push

```sh
git push -u origin 1.5.x/app-builder-shell-chain-take-over
```

The pre-push hook runs the full typecheck + tsdown matrix — expect PASS (M4.3 already rehearsed the build).

### Task 5.5: Stash cleanup (NEEDS_USER_DECISION — destructive)

Only after the user confirms: `git stash drop stash@{0}`. Otherwise keep it and say so in the report.

### Task 5.6: Final report

Report with exact labels: per-milestone PASS/FAIL, commands run, commits + shas, push result, remaining decisions (lockfile placement if skipped, stash), and pre-existing drift left untouched (next section).

---

## Constraints (handoff §12–§13, still binding)

- **Never touch** port 3080 / PID 10632.
- **Files NOT changed by this plan:** `apps/web/**`, `packages/bundle/web-app/package.json`, `packages/app-builder/snapshot-bridge/**`, `packages/client/ui-app-builder-projects/**`, `packages/client/web/**`, all operating-system files (`AGENTS.md`, `packages/AGENTS.md`, `CLAUDE.md` copies, `docs/AGENTS.md`).
- **Pre-existing drift — do NOT fix here** (handoff §11 + observed): `verify-translation-pairing` (Phase 1.5.7 EN-only), `verify-md-links` (planning refs), `verify-doc-budgets` (`packages/AGENTS.md` 706 > 675), and `planning/inspect/INDEX.md` numbering collision (its steps 22–35 reference files absent from this tree; the handoff's `22-…` filename collides with INDEX step 22).
- Bounded loops: ≤3 repair attempts per failure class; then BLOCKED with root cause.
- Registry contributions prove disposal via the HMR-safety test required by the testing policy; existing suites already cover this — do not weaken them to pass.

## Self-review (performed at plan time)

- **Spec coverage:** every open item in handoff §5's matrix maps to a task: test:gui → M1; test:web replay → M2; runtime smoke → M3; build → M4.3; lefthook pre-commit → M4.5–4.6; pre-push → M5.4; commit → M4.4–4.6; push → M5.4; Agent Note → M5.1; §10 open questions → D1–D4; stale slots.ts docs → Task 4.2; lockfile repair → Task 4.4; stash → Task 5.5.
- **Placeholder scan:** the only dynamic values (`<pid>`, `<captured>` token, `<sha>`) are explicitly read-from-environment at execution with the exact command given — no unspecified content.
- **Type consistency:** code snippets quote the actual on-disk state read this session (`apply()` lines 98–146; `contract/slots.ts` lines 1–37); mechanism descriptions match the code (apply-time gate, always-electing select).
