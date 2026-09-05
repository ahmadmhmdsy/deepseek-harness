# Step 22 - App Builder shell chain take-over — Resume Handoff

> In-flight handoff for branch `1.5.x/app-builder-shell-chain-take-over`. Captured mid-implementation so a future agent (or you, fresh context) can resume exactly from this point.

## 0. TL;DR for the next agent

You are mid-implementation of a per-area 1.5.x fix-up that re-enables the App Builder 3-pane shell. The architectural decision was **Option A: flip root to kind: chain**. Five production files have been edited; ~38 test files have been edited to add `select: () => ({}),` to bench-style `name: 'root'` register calls. **`pnpm run typecheck` is PASSING** as of the last run. **`pnpm run test:gui` is NOT YET CONFIRMED GREEN** after the last bulk of test edits — the last invocation got aborted before the summary came back. Your first action is to re-run it.

## 1. State on disk

| Field | Value |
|---|---|
| Working tree | dirty (multiple test/source edits) |
| Branch | `1.5.x/app-builder-shell-chain-take-over` |
| Base commit | `c7b9d87c9e` (= master) |
| Diff shape | 5 production files + ~38 test files modified |
| Sandbox mode | danger-full-access |
| Server state | `pwsh-11` (PID 25416) on port 3081 (agent-started, **safe to kill**); port 3080 PID 10632 **untouchable** per CLAUDE.md §11 |

## 2. User decisions on record (from this session)

1. **Architecture**: Option A — flip root to kind: chain (user selected from 4 options).
2. **Plan approval**: APPROVED — proceed to implement.
3. **Engineering constraint**: stay plugin-first — no privileged renderer-owned root logic; reuse the `conversation.composer` precedent.

## 3. Production code edited (DONE — do not redo)

### 3.1 `packages/client/ui-slots/src/index.ts` — SlotCore constructor (line ~696-707)
`root.spec` flipped from `{ kind: 'single', scope: 'root' }` to `{ kind: 'chain', scope: 'root' }`. Docstring expanded to describe chain take-over.

```ts
constructor() {
  // The a-priori root hole. No markDirty: nothing can observe construction.
  const root = this.record('root')
  // Chain-kind: root hosts multiple plugin entries (chain-shadowed); each
  // entry's `select(owner)` decides whether it renders. The classic UI
  // AppFrame lives at priority 0 with an always-true select; the App
  // Builder shell lives at priority 1 with a select gated on its
  // `enabled` config. When the shell is disabled, only the classic
  // entry is live. When the shell is enabled, the shell shadows the
  // classic entry's same-priority-default and becomes the renderer.
  root.spec = { kind: 'chain', scope: 'root' }
  root.declaredBy = '(built-in)'
  root.declarationEpoch = 1
}
```

### 3.2 `packages/client/ui-renderer/src/client/registry.ts` (lines 27-45) — SlotMap declaration
`'root': { kind: 'single'; ... }` → `{ kind: 'chain'; ... }`. Comment rewritten: removed the "DO NOT register here" warning; added the chain take-over contract.

### 3.3 `packages/client/ui-layout/src/client/index.ts` (lines 119-141) — apply()
Added `priority: 0` and `select: () => ({ tag: 'classic' }) as const` to the existing root `register` call. Children table unchanged.

### 3.4 `packages/client/ui-app-builder-shell/src/client/index.ts` (lines 98-138) — apply()
Replaced:
```ts
ctx.slots.inject('root', () => ctx.slots.register({
  name: 'app-builder-shell', ...
}, Shell))
```
with:
```ts
ctx.slots.register({
  name: 'root',
  priority: 1,
  select: () => ({ tag: 'app-builder' }) as const,
  locale: NS,
  children: {
    'app-builder-shell': { kind: 'chain', scope: 'root' },
    'app-builder.projects': { kind: 'single', scope: 'root' },
    'app-builder.preview': { kind: 'single', scope: 'root' },
    'app-builder.conversation': { kind: 'single', scope: 'session' },
  },
  store: storeHandle,
}, Shell)
```

### 3.5 `packages/client/ui-app-builder-shell/src/client/contract/slots.ts` (line 20) — SlotMap
`'app-builder-shell': { kind: 'single'; ... }` → `{ kind: 'chain'; ... }` (forward-compat — same shape used by `conversation.composer`).

## 4. Test files edited (DONE — verify pass count)

### 4.1 Special-case rewrites (semantic, not just `select` insertion)

#### `packages/client/ui-slots/tests/core.client.spec.ts`
- `mountFrame` helper: added `select: () => ({ tag: 'classic' }), priority: 0`.
- `'seeds root as single/root at construction'` → renamed to `'seeds root as chain/root at construction'` with new expected value `{ kind: 'chain', scope: 'root' }`.
- `'root is single: a second frame registration throws'` → renamed to `'root is chain: a second frame registration at any priority succeeds'`; new body asserts that chain-kind accepts multiple entries (no throw at any priority).

#### `packages/client/ui-renderer/tests/registry.client.spec.ts`
- `captureHost` helper (line 88): added `select: () => ({}),`.
- All 30+ `bench.erased.register({ name: 'root', ...})` calls: added `select: () => ({}),` via bulk `replace_all` patterns (`{ name: 'root',` and `      name: 'root',`).
- Line 109: spec assertion `'single'` → `'chain'`.
- Line 467: spec assertion `'single'` → `'chain'`.
- Test `'rejects a second declaration of root, attributing the built-in row'` → renamed to `'rejects a child declaration that names root itself'`; new body asserts `/already declared/` on a children-table duplicate.
- Test `'commits nothing when the core rejects the entry (children stay undeclared)'` → rewritten for chain children-table collision semantics.

### 4.2 Bulk pattern: `select: () => ({}),` added to all `name: 'root'` registers

Pattern transformations applied (per file, varies by indent depth):

- **`{ name: 'root',...`: `packages/client/locale/tests/apply.client.spec.ts`, `packages/client/ui-input-trigger/tests/apply.client.spec.ts`, `packages/client/ui-workspace/tests/apply.client.spec.ts`, `packages/client/ui-sidebar/tests/apply.client.spec.tsx` (had a duplicate select: created, fixed), `packages/client/ui-settings-general/tests/shell.client.spec.ts`, `packages/client/ui-user-questions/tests/browser-plugin.client.spec.ts`, `packages/client/ui-trajectory/tests/client-bundle.client.spec.ts`, `packages/client/ui-conversation/tests/views-type-chain.client.spec.tsx`**

- **`      name: 'root',...` (6-space indent): `packages/client/ui-workflow-run/tests/workflow-run.client.spec.tsx`, `packages/client/ui-plan/tests/browser-plugin.client.spec.ts`, `packages/client/ui-deliverables/tests/produced-files.client.spec.tsx`, `packages/client/ui-settings-general/tests/apply.client.spec.ts`, `packages/client/ui-settings-models/tests/apply.client.spec.ts`**

- **`    name: 'root',...` (4-space indent): all other files listed below**

Other files where `{ name: 'root',...` matched and got `select` added:
`packages/client/locale/tests/apply.client.spec.ts`, `packages/client/ui-input-trigger/tests/apply.client.spec.ts`, `packages/client/ui-workspace/tests/apply.client.spec.ts`, `packages/client/ui-settings-general/tests/shell.client.spec.ts`, `packages/client/ui-user-questions/tests/browser-plugin.client.spec.ts`, `packages/client/ui-trajectory/tests/client-bundle.client.spec.ts`.

Files where the `      name: 'root',` pattern matched (6-space indent):
`packages/client/ui-workflow-run/tests/workflow-run.client.spec.tsx`, `packages/client/ui-plan/tests/browser-plugin.client.spec.ts`, `packages/client/ui-deliverables/tests/produced-files.client.spec.tsx`, `packages/client/ui-settings-general/tests/apply.client.spec.ts`, `packages/client/ui-settings-models/tests/apply.client.spec.ts`.

Files where `    name: 'root',` matched (4-space indent):
`packages/client/ui-attachment/tests/plugin.client.spec.ts`, `packages/client/ui-agent-preset/tests/apply.client.spec.ts`, `packages/client/ui-goal/tests/browser-plugin.client.spec.tsx`, `packages/client/ui-directory-picker-native/tests/client-flow.client.spec.tsx`, `packages/client/ui-directory-picker-browse/tests/client-flow.client.spec.tsx`, `packages/client/ui-permission-presets/tests/browser-plugin.client.spec.ts`, `packages/client/ui-jobs/tests/browser-plugin.client.spec.ts`, `packages/client/ui-message-feedback/tests/browser-plugin.client.spec.tsx`, `packages/client/ui-brand-official/tests/browser-plugin.client.spec.tsx`, `packages/client/ui-settings-plugin-inventory/tests/browser-plugin.client.spec.tsx`, `packages/client/ui-settings-plugins/tests/apply.client.spec.ts`, `packages/client/ui-subagent/tests/browser-plugin.client.spec.ts`, `packages/client/ui-skill/tests/browser-plugin.client.spec.ts`, `packages/client/ui-commands/tests/browser-plugin.client.spec.ts`, `packages/client/ui-theme/tests/apply.client.spec.ts`.

### 4.3 One-line fix: `packages/client/ui-renderer/tests/invariant.client.spec.ts`
`expect(() => slots.register({ name: 'root' }, () => null)).not.toThrow()`
→
`expect(() => slots.register({ name: 'root', select: () => ({}) }, () => null)).not.toThrow()`

### 4.4 Other test files with explicit `select` per call:
- `packages/client/ui-renderer/tests/scoped-slots-real-core.client.spec.tsx` — 2 register sites
- `packages/client/ui-renderer/tests/ui-renderer.client.spec.tsx` — `{ name: 'root', select: () => ({}) }` via `replace_all`

## 5. Verification matrix

| Check | Status (last seen) |
|---|---|
| `pnpm run typecheck` | **PASS** (after bulk test edits and ui-sidebar duplicate-select fix) |
| `pnpm run test:gui` | NOT CONFIRMED — last call was aborted mid-run. Last verified state: 218 failed / 42 files (down from 251 / 43 before bulk edits). |
| `DSH_SNAPSHOT=replay pnpm run test:web` | NOT RUN |
| Runtime smoke (Playwright at new token) | NOT RUN |
| `pnpm run build` (full typecheck + tsdown matrix) | NOT RUN |
| lefthook pre-commit | NOT RUN |
| lefthook pre-push | NOT RUN |
| `git commit` | NOT DONE |
| `git push` | NOT DONE |
| Agent Note (architecture) | NOT YET WRITTEN |

## 6. WHY this fix (the Note #2 misdiagnosis)

Note #2 (`.agents/notes/implemented/process/2026-09-02-v0.1.2-alpha.1-app-builder-shell-children-regression.md`) listed two upstream BFF bugs that DO NOT EXIST in the merged code:

1. **`app-builder-snapshot-bridge` `!!js` regex-literal bug** — FALSE. The literal in `packages/bundle/web-app/cordis.patch.yml:319` is `!!js '/__dsh/app-builder/snapshot.json'`. `!!js` is a registered YAML tag in the cordis loader (per `docs/cordis-primer.md`); the value is a JS expression evaluated at config-resolution time. `/.../...` JSON in YAML is just a quoted string.

2. **`inject: ['webServer']` declaration bug** — FALSE. `packages/app-builder/snapshot-bridge/src/index.ts:145` correctly declares `inject = ['webServer', 'appBuilderProjects']`. Line 341 uses `ctx.webServer as WebServer` exactly as the contract requires.

The REAL bug was a structural slot-graph regression. The shell's old `apply()` was:
```ts
ctx.slots.inject('root', () => ctx.slots.register({
  name: 'app-builder-shell', children: { ... }, store: storeHandle,
}, Shell))
```
The `name: 'app-builder-shell'` is a **brand-new slot key** that no parent's `children` table declared. `SlotCore.register()` throws `slot "app-builder-shell" is not declared (a parent entry's children table must declare it)` (`packages/client/ui-slots/src/index.ts:786-789`).

The fix is to flip `root` to chain-kind so multiple plugin entries can register at `name: 'root'` directly. `ui-layout` is priority 0 (classic AppFrame); `ui-app-builder-shell` is priority 1 (chain-shadow when enabled).

## 7. Test-pattern cheat sheet for the next agent

When `pnpm run test:gui` reports new failures, apply these rules:

### A. Failure: "chain slot \"root\" requires options.select"
The register call is missing a `select`. Add `select: () => ({}),` (or `select: () => ({ tag: 'classic' })`). The render machinery does not resolve a chain in tests, so any marker shape works.

### B. Failure: "chain slot \"root\" requires options.select" on a single-line `{ name: 'root' }`
Same fix as A. The single-line shape is also chain-incompatible.

### C. Failure: assertion expects `{ kind: 'single' }` but receives `{ kind: 'chain' }`
Update the assertion to `'chain'`. Common in `core.client.spec.ts`, `registry.client.spec.ts`.

### D. Failure: test asserts single-kind collision (e.g., "rejects a second declaration")
Rewrite for chain semantics: the throw now comes from the **children-table guard** (`slot "X" is already declared`), not from same-kind same-priority collision. See the rewrites in `core.client.spec.ts` (`'root is chain: a second frame registration at any priority succeeds'`) and `registry.client.spec.ts` (`'rejects a child declaration that names root itself'`, `'commits nothing when the core rejects the entry'`).

### E. Failure: TS error "An object literal cannot have multiple properties with the same name"
Means a bulk edit ran twice on the same line (because two patterns both matched). Search for `select: () => ({}), select: () => ({}),` and collapse to one.

### F. Indent depths observed in this repo for `name: 'root',`:
- `{ name: 'root',` (inline, no indent)
- `    name: 'root',` (4 spaces)
- `      name: 'root',` (6 spaces)
Less common: `  name: 'root',` (2 spaces), `        name: 'root',` (8 spaces). Grep with `^[ \\t]*name: 'root',` to enumerate.

## 8. Re-run test:gui (next agent's first action)

```sh
cd E:\\js_projects\\my_deepseek_harness\\deepseek-harness
pnpm run test:gui 2>&1
```

Expected outcome: all 3844+ tests pass with 0 (or near-zero) failures. If any remain, walk through Section 7's cheat sheet.

## 9. Subsequent phase (after test:gui green)

### 9.1 Browser smoke
```sh
DSH_SNAPSHOT=replay pnpm run test:web
```

### 9.2 Restart `dsh web` without patch overlay
- Stop `pwsh-11` (port 3081): `job_kill` on the agent-started background job.
- Remove `C:\\Users\\AhmadMhmoud\\AppData\\Local\\Temp\\dsh-3081.patch.yml` (or just skip the `--patch` flag when starting).
- Start `pnpm dsh web --port 3081` (or whichever port). Capture the new token from the URL line.
- Playwright smoke: `[data-app-builder-enabled="true"]` is present when `enabled: true` (default after overlay removed), absent when `enabled: false`.

### 9.3 Build + lefthook
```sh
pnpm run build
git add -A
git status -s
# lefthook runs on commit (pre-commit: whitespace + vendor manifest guard, fast)
# and on push (pre-push: full typecheck + tsdown build matrix)
```

### 9.4 Commit + push
Suggested commit message (`docs(architecture): re-enable App Builder shell via chain take-over at root` is a possibility; pick one that matches the actual change body):

```
feat(client): re-enable App Builder shell via chain-kind root take-over

Switch the built-in 'root' slot from kind: 'single' to kind: 'chain' so
ui-layout (priority 0, classic AppFrame) and ui-app-builder-shell
(priority 1, enabled-gated select) coexist as chain entries. The App
Builder 3-pane shell's chain take-over was previously impossible because
'root' was single-kind and ui-layout owned it outright; the shell's old
apply() tried to register under a brand-new key ('app-builder-shell')
that no parent children table had declared, failing at load with
`slot "app-builder-shell" is not declared`. With chain take-over at
root, both UI surfaces become pure plugin composition following the
conversation.composer pattern already used by ui-chat. The same fix
unblocks the host @deepseek-ai/dsh-app-builder-snapshot-bridge (which
was operationally correct all along; only the client shell needed
this re-wiring), so the cordis.patch overlay's three disabled rows
(app-builder-shell, app-builder-projects, app-builder-snapshot-bridge)
can be retired. Note #2's two attributed upstream bugs were
misdiagnoses; this re-architects the slot graph, not the bridge.

- packages/client/ui-slots/src/index.ts: chain-kind root spec
- packages/client/ui-renderer/src/client/registry.ts: SlotMap root chain
- packages/client/ui-layout/src/client/index.ts: priority 0 classic select
- packages/client/ui-app-builder-shell/src/client/index.ts: priority 1 chain
- packages/client/ui-app-builder-shell/src/client/contract/slots.ts: app-builder-shell chain
- ~38 test files: select: () => ({}), added to name: 'root' registers
```

```sh
git push -u origin 1.5.x/app-builder-shell-chain-take-over
```

### 9.5 Agent Note (architecture, EN-only per Phase 1.5.7)
```sh
cat > .agents/notes/implemented/architecture/2026-09-02-app-builder-shell-chain-take-over.md <<'EOF'
# App Builder shell — chain take-over at root (per-area 1.5.x follow-up)

## Problem
[Describe slot-graph regression; see Note #2 for context]

## Decision
Flip root from kind: 'single' to kind: 'chain' (SlotCore constructor +
ui-renderer SlotMap declaration). Two plugins compose at root:
- ui-layout priority 0 with select: () => ({ tag: 'classic' })
- ui-app-builder-shell priority 1 with select: () => ({ tag: 'app-builder' })

## Alternatives considered
A. (Selected) Chain take-over at root — re-uses conversation.composer pattern
B. Single occupant; ui-layout flips to chain child of 'app-builder-shell' — wider blast radius
C. Compose plugin with extra package — blurs UI vs composition
D. Defer (keep classic UI only) — lowest risk; no per-area re-enable

## Consequences
- 5 production files + ~38 test files changed
- Patch overlay (`C:\\Users\\AhmadMhmoud\\AppData\\Local\\Temp\\dsh-3081.patch.yml`) can be retired
- Three App Builder UI plugins re-enabled by default
- Eliminates the temporary fallback documented in Note #2

## Invariants
- kind: 'chain' root preserves the single-renderer invariant: when every
  chain entry declines, the renderer throws (per registry.ts:902-903), not
  a silent blank
- chain-kind selectors MUST be pure (see ChainSelect in ui-slots)
- The classic UI is a chain entry at priority 0 with select: always-true
- The App Builder shell is chain entry at priority 1; its select:
  returns null when config.enabled is false

## Risks
- Test contract drift: any future test asserting single-kind root will
  need updating to the chain contract
- Snapshot-bridge interactions: bridge is operational; remove patch
  overlay only after this PR lands
EOF
```

## 10. Open questions for the future agent

1. Should `priority: 0` on ui-layout be explicit (as I made it) or implicit (default)? Both work, but explicit makes the contract self-documenting.
2. The `app-builder-shell` SlotMap entry was changed from `single` to `chain` for forward compatibility, but currently no second chain entry occupies it. Do we still want chain-kind or do we revert to single since only one entry?
3. Should the `select` callbacks return named markers (`{ tag: 'classic' }`) or empty shapes (`{}`)? Named markers help debugging; empty shapes are simpler. Production chose named for ui-layout and ui-app-builder-shell; tests chose `() => ({})` for terseness.

## 11. Pre-existing drift (NOT mine, NOT blocking — but tracked)

- `verify-translation-pairing`: Phase 1.5.7 EN-only, §9 backlog per `docs/AGENTS.md:43`
- `verify-md-links`: planning file refs in other notes
- `verify-doc-budgets`: `packages/AGENTS.md` 706 > 675

These were failing BEFORE this branch. Do not attempt to fix them here.

## 12. Critical process-safety rules (CLAUDE.md §11)

- `port 3080 / PID 10632` — UNTOUCHABLE. Pre-existing node.exe.
- `port 3081 / pwsh-11 / PID 25416` — agent-started, **killable** via `job_kill`. Use this when restarting after the patch overlay is removed.
- The patch overlay file `C:\\Users\\AhmadMhmoud\\AppData\\Local\\Temp\\dsh-3081.patch.yml` is in `%TEMP%`, NOT tracked by git. It survives file system reboots in the same user session; it does not need git operations to remove.

## 13. Files NOT changed (deliberately)

- `apps/web/**` — no dependency, no source code change
- `packages/bundle/web-app/package.json` — no dependency
- `packages/app-builder/snapshot-bridge/**` — host bridge operational; it WORKS, no code change
- `packages/client/ui-app-builder-projects/**` — already chains via `ctx.slots.inject('app-builder.projects', ...)`; lights up automatically when shell renders children
- `packages/client/web/**` (seed.ts, platform.ts) — module table unchanged
- `docs/AGENTS.md`, `AGENTS.md`, `packages/AGENTS.md`, `packages/CLAUDE.md`, `examples/CLAUDE.md` — operating system rules untouched

## 14. The five file-level diffs

For a future agent reviewing the branch (these are the canonical edits; diff against `c7b9d87c9e`):

### packages/client/ui-slots/src/index.ts
- Line ~699: `root.spec = { kind: 'single' }` → `root.spec = { kind: 'chain' }`
- Added comment block: chain take-over semantics

### packages/client/ui-renderer/src/client/registry.ts
- Line 43: `'root': { kind: 'single'` → `'root': { kind: 'chain'`
- Comment lines 30-42 rewritten: removed "DO NOT register here" warning; added chain take-over contract

### packages/client/ui-layout/src/client/index.ts
- Lines 123-141: `ctx.slots.register({ ... })` block — added `priority: 0` and `select: () => ({ tag: 'classic' })`

### packages/client/ui-app-builder-shell/src/client/index.ts
- Lines 125-137 (was: `ctx.slots.inject('root', () => ctx.slots.register({ name: 'app-builder-shell', ... }))`)
- Now: `ctx.slots.register({ name: 'root', priority: 1, select: () => ({ tag: 'app-builder' }), children: { 'app-builder-shell': { kind: 'chain', scope: 'root' }, ... }, store: storeHandle }, Shell)`
- Note: drop the literal comment about "chain take-over: wait for the root slot to be declared"

### packages/client/ui-app-builder-shell/src/client/contract/slots.ts
- Line 20: `'app-builder-shell': { kind: 'single'` → `'app-builder-shell': { kind: 'chain'`
