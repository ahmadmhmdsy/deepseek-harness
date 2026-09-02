# Phase 2.5 — Session Resume Handoff

> **Save-as-branch** by this same workflow so a fresh agent can resume from this
> exact point without conversation context. The handoff is the original spec +
> the spot where the implementation stopped + a structured task list to drive
> 2.5 to completion.

## 0. TL;DR for the resuming agent

You are resuming **Phase 2.5** of the App Builder stack on branch
`feat/phase2-5-ui-eventsource`. You are NOT starting over. The branch is already
cut, the BFF's two new Remote methods are committed and pushed, the tests are
green, and the open question — whether to also add `subscribePreview` (option 2)
or only the minimum-viable surface (option 1) — is the only scope decision left.

**The user split the plan into option 1 (already DONE) and option 2 (user
deferred).** Both options need the same UI panes + shell edit + bundle wiring.
Those are the next 12 todos (see §8). When you get to the "do option 2 or stop
here?" decision point, ask the user before adding `subscribePreview`.

## 1. Repo state at handoff time

| Key | Value |
|---|---|
| Repo | `ahmadmhmdsy/deepseek-harness-work` (working fork) |
| Upstream | `deepseek-ai/deepseek-harness` (read-only context; never push here) |
| Working branch | `feat/phase2-5-ui-eventsource` |
| Branch base | `feat/phase2-4-projection-ui` @ `32b10fda0d` (forward-lead) |
| Branch tip | `0abc84c892258f86a81139f6d04c99426e53df6a` (BFF-only commit) |
| Working tree | clean |
| 2.4 PR | blocked on PAT permissions; user will fix later (no action here) |
| 2.4 carry-forward | `verify-cordis-inspect-catalog` fails (latent typert bug in `ui-approval/contract/slots.ts:71`); pre-push typecheck PASSES so push is unblocked |
| 2.5 PR | not yet created; pending PAT + 2.5 completion |

## 2. What was delivered in this session (option 1)

### 2.1 Files committed on `feat/phase2-5-ui-eventsource`

| File | Change | Detail |
|---|---|---|
| `packages/app-builder/api/src/deployments.ts` | +NEW | `listDeploymentsRemote` (unary) + `subscribeDeploymentEventsRemote` (stream/gap-free async generator mirroring `sessionController.follow`'s buffered-queue + wake-up + AbortSignal pattern). `toShape` projects `Deployment` records to public JSON-safe shapes (branded id erased, gate findings shallow-cloned). |
| `packages/app-builder/api/src/types.ts` | extend | Appended `DeploymentShape`, `DeploymentGateResultShape`, `DeploymentGateFindingShape`, `ListDeploymentsRequest`, `ListDeploymentsValue`, `SubscribeDeploymentEventsRequest`, `DeploymentStreamEvent`, `SubscribeDeploymentEventsFrame`. Re-exported `DeploymentStatus`, `GateKind`, `GateFindingSeverity` from the deployment package. |
| `packages/app-builder/api/src/index.ts` | edit | Added 2 `@Remote` methods (`listDeployments`, `subscribeDeploymentEvents(@Remote({mode:'stream'}))`); added imports of the new types; mirrored local-import and export re-export blocks; bumped the docstring's method count placeholder. |
| `packages/app-builder/deployment/src/index.ts` | edit | Re-exported `DeploymentStatus` (previously only `Deployment`, `DeploymentId`, etc. were exported; `DeploymentStatus` and `DeploymentFailedEvent` were missing from the public surface). |
| `packages/app-builder/api/tests/deployments.host.spec.ts` | +NEW | 8 tests covering empty registry, post-deploy record, projectId filter, missing-deployment-plugin failure, snapshot+started+succeeded ordering, projectId filter on stream, missing-deployment-plugin failure on stream, prototype method presence. |

### 2.2 Test + typecheck status (verified this session)

```sh
$ pnpm exec vitest run packages/app-builder/api/tests/deployments.host.spec.ts
 ✓ packages/app-builder/api/tests/deployments.host.spec.ts (8 tests) 294ms
 Test Files  1 passed (1)
      Tests  8 passed (8)```

- `pnpm exec tsc -p packages/app-builder/api/tsconfig.json --noEmit` => **0 errors**.
- Pre-push lefthook on the BFF commit (`pnpm run typecheck`) => **PASS in 28.57s** (host + client + tsdown).
- Pre-commit lefthook (lint + whitespace + vendor-manifest-guard) on the BFF commit => **all green**.

### 2.3 BFF Remote method surface (15 total after option 1)

13 existing methods from 2.1-2.4 + 2 new in 2.5 option 1:

| Method | Mode | New in |
|---|---|---|
| `listProjects`, `createProject`, `getProject`, `deleteProject` | unary | Phase 2.x |
| `startSession`, `sendMessage`, `getTranscript`, `forkSession`, `resumeSession` | unary | Phase 2.x |
| `subscribeEvents` | stream | Phase 2.x |
| `getPreview` | unary | Phase 2.x |
| `deploy` | unary (typed `not-implemented`) | Phase 2.x |
| `getUsage` | unary (typed `not-implemented` on projectId-only path) | Phase 2.3 |
| `listDeployments` | unary | **Phase 2.5 option 1** |
| `subscribeDeploymentEvents` | stream | **Phase 2.5 option 1** |

## 3. Architecture context (read me first)

### 3.1 Capability seam

`packages/app-builder/api/` is the **App Builder Host BFF** as a Typert Remote
service. Its class `AppBuilderApi extends TypertRemoteService`:

- Default export, Service Definition (NOT a function plugin).
- Constructor calls `super(ctx, 'appBuilderApi', { namespace: 'appBuilder' })`.
- `static inject = ['appBuilderProjects', 'sessionController', 'tokenMeter']`
  enforces required services via Cordis's Service injection machinery — the BFF
  class is **deferred** until those three are present. `appBuilderDeployment`
  is intentionally NOT in the inject list: `listDeployments` /
  `subscribeDeploymentEvents` throw informative errors when the deployment
  plugin is missing, so a bundle that intentionally omits the deployment
  plugin still constructs the BFF.

### 3.2 Stream pattern (canonical)

The new `subscribeDeploymentEventsRemote` mirrors the canonical async
generator pattern used by `sessionController.follow` (see
`packages/api/session-controller/src/history.ts:87`). The five parts:

1. **Opening `snapshot` frame** (`yield` the current registry state).
2. **Buffered queue** (`buffered: DeploymentStreamEvent[]`).
3. **Wake-up resolver** (`wake: (() => void) | undefined`; `notify()`
   consumes + clears it).
4. **Listeners** via `ctx.on('deployment/started|succeeded|failed', ...)` that
   push to the buffer + call `notify()`. All listeners push to the array
   returned by `ctx.on(...)` for cleanup.
5. **`finally` block** that disposes listeners + removes the abort handler.
6. **Closing `closed` frame** with reason `'cancelled'` (on signal abort)
   or `'source-closed'` (fallthrough).

The client pane's `useDeployments` (when written) must:
- Open the stream via the gateway transport (`ctx.typertGateway.wireStream`
  through @deepseek-ai/dsh-client-connection).
- Iterate frames in a useEffect; on cleanup, call `controller.abort()`.
- Keep a `state.deployments` map keyed by `id`; on `event` frames, replace
  or insert the deployment; on `closed` frames, mark `state.streamState` as
  `closed` and reconnect after a backoff.

### 3.3 Test fixture pattern (canonical)

`packages/app-builder/api/tests/deployments.host.spec.ts` uses:

- `@deepseek-ai/cordis` + `@deepseek-ai/cordis-plugin-loader` +
  `@deepseek-ai/cordis-plugin-include` to boot a real cordis.yml.
- The modules map at `context.loader.internal.import` simulates Node module
  resolution. AppBuilderApi is mounted via `ctx.plugin(AppBuilderApiPlugin.default)`
  AFTER `context.loader.await()` — class services are NOT loaded from yaml;
  only function plugins are. (See `api-methods.host.spec.ts:142` for the
  reference pattern.)
- A fake `FakeSessionController extends Service` satisfies the BFF's
  `sessionController` inject.
- Real project + deployment registries drive the workflow; only the
  session lifecycle is mocked.

## 4. Files to write in the next session (UI panes + shell + bundle)

### 4.1 New client packages (TWO)

1. `packages/client/ui-app-builder-deployments/`
2. `packages/client/ui-app-builder-preview-iframe/`

Each must include:

- `package.json` — mirror `packages/client/ui-app-builder-projects/package.json`
  EXACTLY (replace `projects` with `deployments` or `preview-iframe`).
  - `"name": "@deepseek-ai/dsh-client-ui-app-builder-deployments"`
  - `"dsh.client.inject"`: add `@deepseek-ai/dsh-client-ui-app-builder-preview-iframe`
    to the deployments one (so it can use the same shared styles / primitives).
  - peerDependencies / devDependencies: include `@deepseek-ai/dsh-client-ui-app-builder-shell`,
    `@deepseek-ai/dsh-client-ui-slots`, `@deepseek-ai/dsh-client-locale`, etc.
- `tsconfig.json` — mirror `packages/client/ui-app-builder-projects/tsconfig.json`.
- `tsdown.config.ts` — use `clientBundle('@deepseek-ai/dsh-client-ui-app-builder-{deployments|preview-iframe}',
  ['lib/types/index.js', 'lib/types/invariant.js'])`.
- `src/index.ts` — empty `apply()` (no Node-side behavior; pure browser UI).
- `src/invariant.ts` — empty `install: () => {}` with a documented
  "No runtime invariant" reason (this is a pure presentation pane).
- `src/css-modules.d.ts` — verbatim from the projects pkg.
- `src/client/index.ts` — apply that `ctx.slots.inject`s into the slot.
- `src/client/{Pane}.tsx` + `{Pane}.module.css` + `locales.ts` +
  `stores.ts` (if needed) + `contract/slots.ts` (slot owner typings).
- `README.md` + `README.zh.md` + `README.i18n.yaml`.
- `tests/{name}.client.spec.tsx` (8+ tests, `// @vitest-environment jsdom`
  on line 1, structured exactly like `projects-list.client.spec.tsx`).

### 4.2 Slot registration

The deployments pane registers:

```ts
// packages/client/ui-app-builder-deployments/src/client/index.ts
ctx.slots.inject('app-builder.deployments', () => ctx.slots.register({
  name: 'app-builder-deployments',
  locale: NS,
  owner: AppBuilderDeploymentsOwnerProps,
}, DeploymentsList))
```

where `AppBuilderDeploymentsOwnerProps = { readonly selectedProjectId?: string }`
and the matching `SlotMap` entry goes in
`packages/client/ui-app-builder-shell/src/client/contract/slots.ts`.

The preview iframe registers `app-builder.preview` with owner
`AppBuilderPreviewOwnerProps` (already declared in the shell) — see
`packages/client/ui-app-builder-shell/src/client/contract/slots.ts:49`. The
existing shell creates that slot's children declaration; the preview-iframe
package is the renderer that fills it.

### 4.3 Shell edits (THREE files in the same commit)

| File | Change |
|---|---|
| `packages/client/ui-app-builder-shell/src/client/contract/slots.ts` | Add `'app-builder.deployments': { kind: 'single', scope: 'root' }` to the shell's children declaration. Add `AppBuilderDeploymentsOwnerProps` interface (`{ selectedProjectId?: string }`). |
| `packages/client/ui-app-builder-shell/src/client/Shell.tsx` | Render a 4th pane via `{renderSlot('app-builder.deployments', { selectedProjectId })}` inside a new `<aside className={styles.deployments} data-pane='deployments'>`. |
| `packages/client/ui-app-builder-shell/src/client/{Shell.module.css,Shell.css,...}` | Add `.deployments` rules using the same `--dsw-*` token layer. Match the project's grid layout (`grid-template-areas: ...`; the shell's existing layout has `projects | chat | preview` — add a 4th column or 4th row as the CSS permits). |

### 4.4 Bundle wiring (THREE files)

| File | Change |
|---|---|
| `packages/bundle/web-app/cordis.patch.yml` | Add 2 `dsh.client` rows after the existing `app-builder-projects` row: `app-builder-deployments` (config: `deploymentStreamUrl: !!js `/api/appBuilder/listDeployments``) and `app-builder-preview-iframe` (config: `previewUrlForProject: !!js `/api/appBuilder/getPreview``). |
| `packages/bundle/web-app/package.json` | Add 2 `dependencies` entries: `@deepseek-ai/dsh-client-ui-app-builder-deployments` and `@deepseek-ai/dsh-client-ui-app-builder-preview-iframe`. |
| `packages/bundle/app-builder/cordis.patch.yml` | NO change needed (host plugin rows; both panes are pure browser). |
| `tsconfig.client.json` | Add 2 `references` entries after the existing `ui-app-builder-projects` line: each pointing to the new package. |

### 4.5 Agent Note (English-only per 1.5.7 directive)

`docs/PROJECT.md` location is at `/docs/PROJECT.md`; but per AGENTS.md the notes
live at `.agents/notes/implemented/architecture/2026-{date}-phase-2-5-ui-eventsource.md`.

Title: `feat(app-builder): UI status panes + EventSource-backed preview (Phase2.5)`.

Required content: Status (partial / pending UI), Problem, Decision, Supersession,
Alternatives×5, Consequences×8. Carry-forward §9 must include:

- The existing 9 oxlint baseline errors (carry-forward from 2.4 carry-forward from
  2.3 — see `scripts/oxlint-baseline-failures.md` if present).
- The new `verify-cordis-inspect-catalog` failure (latent typert bug
  `packages/client/ui-approval/src/client/contract/slots.ts:71`).
- `verify-doc-budgets` (`packages/client/ui-app-builder-shell/README.md` may
  need a few extra chars; don't try to fix).
- The 2 missing agent notes from §9 backlog.

## 5. Test commands for the next session

```sh
# Typecheck just the api package (fast feedback)
pnpm exec tsc -p packages/app-builder/api/tsconfig.json --noEmit

# Run only BFF deployments tests
pnpm exec vitest run packages/app-builder/api/tests/deployments.host.spec.ts

# Run BFF tests (deployments + existing api-methods)
pnpm exec vitest run packages/app-builder/api/tests/

# Run projects-list tests to validate the existing slot pattern
pnpm exec vitest run packages/client/ui-app-builder-projects/tests/

# Typecheck the whole repo (host + client + tsdown)
cd D:\my_deepseek_harness\deepseek-harness ; pnpm run typecheck

# Repo-wide client GUI suite (per packages/client/AGENTS.md check ladder rung 1)
pnpm run test:gui
```

## 6. Schema / API references

### 6.1 Wire shape (BFF Remote methods)

```ts
// packages/app-builder/api/src/types.ts (excerpt)
export interface DeploymentShape {
  readonly id: string  // branded DeploymentId erased to plain string on the wire
  readonly projectId: string
  readonly target: string
  readonly status: DeploymentStatus
  readonly gateResults: readonly DeploymentGateResultShape[]
  readonly url?: string
  readonly reason?: string
  readonly createdAt: string
  readonly updatedAt: string
}

export interface ListDeploymentsRequest {
  readonly projectId?: string
}
export interface ListDeploymentsValue {
  readonly deployments: readonly DeploymentShape[]
}

export interface SubscribeDeploymentEventsRequest {
  readonly projectId?: string
}
export type DeploymentStreamEvent =
  | { readonly type: 'started'; readonly deployment: DeploymentShape }
  | { readonly type: 'succeeded'; readonly deployment: DeploymentShape }
  | { readonly type: 'failed'; readonly deployment: DeploymentShape; readonly reason: string }
export type SubscribeDeploymentEventsFrame =
  | { readonly type: 'snapshot'; readonly cursor: number; readonly records: readonly DeploymentShape[] }
  | { readonly type: 'event'; readonly seq: number; readonly event: DeploymentStreamEvent }
  | { readonly type: 'closed'; readonly reason: 'cancelled' | 'source-closed' }
```

### 6.2 Cordis context surface (modules to import)

- `ctx.appBuilderDeployment` — `DeploymentRegistry` (process-local; methods:
  `deploy`, `get`, `list`, `has`, `toValue`, `latestForProject`).
- `ctx.appBuilderDeployment.list()` returns `readonly Deployment[]` — used by
  the opening snapshot.
- `ctx.appBuilderProjects.get(id)` — used inside `deploy.host.spec.ts` but
  not by the BFF methods.
- Events: `'deployment/started' | 'deployment/succeeded' | 'deployment/failed'`
  — payloads declared in `packages/app-builder/deployment/src/types.ts`.

## 7. Known issues / carry-forward

### 7.1 Reappearing latent typert bug (`verify-cordis-inspect-catalog`)

Adding 2 more `tsconfig.client.json` references in 2.5 (deployments +
preview-iframe) will again trigger typert to re-analyze
`packages/client/ui-approval/src/client/contract/slots.ts:71`, where the
`readonly kind = 'approval' as const` declaration lacks an explicit type
annotation. The one-line fix is:

```ts
// packages/client/ui-approval/src/client/contract/slots.ts:71
- readonly kind = 'approval' as const
+ readonly kind: 'approval' = 'approval' as const
```

This is technically unrelated to the 2.5 scope. **Defer to a follow-up PR per
AGENTS.md "no-silent-unrelated-fix"**, but EXPECT this gate to fail in CI for
2.5 even when option 1's BFF-only commit is correct. Document the carry-forward
in the Agent Note §9.

### 7.2 oxlint baseline errors (9 entries)

2.3 and 2.4 left 9 oxlint baseline errors unfixed. Adding more client packages
in 2.5 will keep the count the same (no new lint failures expected from the
clean 2.4 code patterns). If `pnpm run lint` adds new errors, the Agent Note
§9 lists them with file:line.

### 7.3 PAT (Personal Access Token) carry-forward

2.4 PR (`feat/phase2-4-projection-ui` → `feat/phase2-2-tool-policy`) is
blocked on the user fixing their GitHub PAT permissions. The user explicitly
stated they will resolve it later. **Do not act on the PAT in this session.**
When 2.4 merges, 2.5 should rebase onto the new 2.4 head before its own PR.

## 8. Resume task list (12 todos, ready to run)

The task list below drives phase 2.5 to completion. Each task is one step in
the implementing role. The reference for each step is in the file paths
section above.

| # | Task | Surfaces touched | Steps |
|---|---|---|---|
| 1 | Scaffold `packages/client/ui-app-builder-deployments` skeleton | 7 files (package.json, tsconfig.json, tsdown.config.ts, src/index.ts, src/invariant.ts, src/css-modules.d.ts, README placeholder). Mirror 2.4's projects pkg. | copy from `packages/client/ui-app-builder-projects` and rename; replace README content; verify tsc compiles empty package. |
| 2 | Implement `ui-app-builder-deployments` slot registration + component + locale + CSS | 5 files (src/client/index.ts, src/client/{DeploymentsList,DeploymentsList.module.css,locales,contract/slots}.ts) | `ctx.slots.inject('app-builder.deployments', () => ctx.slots.register({...}, DeploymentsList))`; pull deployments stream via the standard client remotes; render scrollable list with empty / loading / error states. |
| 3 | Write 12 tests for `ui-app-builder-deployments` | 1 file (tests/deployments.client.spec.tsx, jsdom env) | Mirror `packages/client/ui-app-builder-projects/tests/projects-list.client.spec.tsx`: empty stream, snapshot-only no events, snapshot + started, snapshot + succeeded, projectId filter, error banner, locale (en + zh), redux of slot state, no-project empty state. |
| 4 | Scaffold `packages/client/ui-app-builder-preview-iframe` skeleton | 7 files (same shape as deployments) | Mirror deployments pkg; inject `@deepseek-ai/dsh-client-ui-app-builder-shell`, NOT deployments. |
| 5 | Implement `ui-app-builder-preview-iframe` slot registration + iframe + EventSource | 5 files | `ctx.slots.inject('app-builder.preview', () => ctx.slots.register({...}, PreviewIframe))` (this slot is already declared in the shell); pull `getPreview` per selected project; subscribe `subscribeEvents` for url transitions; render `<iframe src={url}>` with reload on URL change, plus loading / idle / stopped / failed states. |
| 6 | Write 12 tests for `ui-app-builder-preview-iframe` | 1 file (tests/preview-iframe.client.spec.tsx, jsdom env) | Mirror projects-list.test pattern. Cover: idle / starting / ready / failed / stopped url-handoff, projectId change triggers reload, locale strings, accessibility (`aria-label` on iframe). |
| 7 | Edit shell: add 4th slot + pane + CSS for the deployments area | 3 files (shell/contract/slots.ts, shell/Shell.tsx, shell css-modules) | Add `'app-builder.deployments'` to `children` declaration; declare `AppBuilderDeploymentsOwnerProps`; render `<aside className={styles.deployments} data-pane='deployments'>{renderSlot('app-builder.deployments', { selectedProjectId })}</aside>`; add `.deployments` CSS rule that extends the existing grid. |
| 8 | Update `tsconfig.client.json` for both new packages | 1 file | Add 2 `{ "path": "./packages/client/ui-{app-builder-deployments,app-builder-preview-iframe}" }` references after `ui-app-builder-projects`. |
| 9 | Wire bundle: cordis.patch.yml rows + bundle package.json deps | 2 files | Add 2 `dsh.client` insert rows after `app-builder-projects`; add 2 `dependencies` entries. |
| 10 | Write bilingual READMEs + i18n.yaml for both new packages | 6 files (2x README.md, 2x README.zh.md, 2x README.i18n.yaml) | Copy structure from projects pkg's READMEs (replace "projects" with the new concept); run `pnpm run verify-translation-pairing` after to populate i18n.yaml. |
| 11 | Run full typecheck (`pnpm run typecheck`) + targeted tests | shell commands | Expect: 8 (BFF deployments) + 12 (deployments) + 12 (preview-iframe) + 6 (shell) + 15 (projects-list) = 53 PASS. Typecheck PASS. |
| 12 | Author Agent Note + commit + push + PR | 1 new file (Agent Note), 2 commits on the branch | Note must include §9 carry-forwards (oxlint baseline 9, verify-cordis-inspect-catalog latent, doc-budgets, etc.). Push to remote. Create PR via `gh api` or `curl POST /repos/{owner}/{repo}/pulls` once PAT has `pull_requests:write` scope. |

### 8.1 Optional follow-up (after user confirms)

| # | Task | When |
|---|---|---|
| 13 | Add BFF `subscribePreview` + types + 6 tests (option 2) | Only if user says "do option 2" |
| 14 | Refactor preview iframe pane to consume `subscribePreview` and degrade gracefully to `getPreview` polling when not present | Same as above |
| 15 | Land one-line ui-approval `readonly kind` fix as separate follow-up PR | After 2.5 PR merges, unblocks verify-cordis-inspect-catalog permanently |

## 9. Key file paths at handoff time

| Path | Purpose |
|---|---|
| `packages/app-builder/api/src/deployments.ts` | NEW; the 2.5 option-1 Remote methods. Read first. |
| `packages/app-builder/api/src/types.ts` | Extended; append `DeploymentStreamEvent` block at the end. |
| `packages/app-builder/api/src/index.ts` | Extended; the 2 new `@Remote` methods live there. |
| `packages/app-builder/api/tests/deployments.host.spec.ts` | NEW; 8 passing tests. Reference for the test fixture pattern. |
| `packages/app-builder/deployment/src/index.ts` | Re-exports `DeploymentStatus` from this session. |
| `packages/app-builder/deployment/src/types.ts` | Source of truth for `Deployment`, `DeploymentStartedEvent`, etc. |
| `packages/app-builder/deployment/src/index.ts:49` | `DeploymentRegistry` class definition. |
| `packages/api/session-controller/src/history.ts:87` | The canonical `follow()` async generator — template for SSE streams. |
| `packages/client/ui-app-builder-shell/src/client/Shell.tsx` | 3-pane shell; add 4th pane here. |
| `packages/client/ui-app-builder-shell/src/client/contract/slots.ts` | Slot owner typings; add `'app-builder.deployments'` here. |
| `packages/client/ui-app-builder-projects/src/client/index.ts` | Reference for `ctx.slots.inject` pattern. |
| `packages/client/ui-app-builder-projects/tests/projects-list.client.spec.tsx` | Reference for client tests (8+ tests, jsdom, PropsRuntime/PropsRenderSlots). |
| `packages/bundle/web-app/cordis.patch.yml` | Add 2 `dsh.client` rows after `app-builder-projects`. |
| `packages/bundle/web-app/package.json` | Add 2 deps. |
| `packages/bundle/app-builder/cordis.patch.yml` | NO change needed. |
| `tsconfig.client.json` | Add 2 references. |
| `apps/web/` | No change needed in 2.5 (pure browser via dsh.client rows). |

## 10. Resume command (fresh session, no context)

```sh
cd D:\my_deepseek_harness\deepseek-harness
git checkout feat/phase2-5-ui-eventsource
cat .agents/drafts/phase2-5-handoff.md    # this file, if committed to a draft branch; OR git log -p shows the BFF option-1 commit
pnpm run typecheck                          # expect PASS
pnpm exec vitest run packages/app-builder/api/tests/deployments.host.spec.ts   # expect 8/8 PASS
# then start the §8 todo list using todo_write
```

When the user signals "go" on the UI panes, resume at task 1 with the
`ui-app-builder-deployments` scaffold.
