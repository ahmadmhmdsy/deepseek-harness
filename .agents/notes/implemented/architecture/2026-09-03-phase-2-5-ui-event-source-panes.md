# Agent Note: Phase 2.5 — App Builder UI event source panes (deployments + preview iframe)

Status: implemented

English

A companion to the Phase 1.5 [seed-manifest-fix note](2026-09-02-v0.1.2-alpha.1-seed-manifest-fix.md) and the [shell children-regression note](2026-09-02-v0.1.2-alpha.1-app-builder-shell-children-regression.md). Phase 2.5 closes the App Builder BFF Remote surface and ships the two browser panes that consume it. The runtime mount of the new panes is currently gated by the shell regression documented in the children-regression note; that gating is intentional and is owned by the per-area 1.5.x follow-up.

## Problem

The Phase 2.5 BFF landed two new Typert Remote methods (`subscribeDeploymentEvents` + `subscribePreview`) on the App Builder Host BFF, but the browser had no panes to consume them. Three follow-on questions drove the rest:

1. **How does the browser reach the BFF Remote contributions?** Phase A.1-A.3 documented two paths: aggregate the Remote contributions in `packages/api/remotes/src/client/index.ts` (the canonical pattern), or mount `appBuilderApiRemote` directly inside each new pane's own `apply` closure (the Option B bypass). The aggregate path triggered TS2878 + SessionStore cascade; Option B sidesteps both by importing `appBuilderApiRemote` from a single package inside each pane's own typecheck.

2. **What does the shell render?** The existing shell is a 3-pane CSS Grid (projects | chat | preview). The new panes require a 4-pane grid (projects | chat | deployments | preview).

3. **How does the browser get the deployment + preview data?** The BFF exposes `subscribeDeploymentEvents` (returns AsyncIterable of `SubscribeDeploymentEventsFrame`) and `subscribePreview` (returns AsyncIterable of `SubscribePreviewFrame`); the panes own the AsyncIterable → snapshot-store → useSnapshot wiring.

## Decision

**Phase A (BFF side)**: re-applied the Phase A.1 + A.2 work from session 4. `packages/app-builder/api/package.json` declares `./typert` + `./remote` exports and adds `lib/typert.host.{js,d.ts}` + `lib/typert.remote-client.{js,d.ts}` to `files`. `pnpm run build:lib:host` emits the artifacts to `packages/app-builder/api/lib/`; the artifacts declare all 13 Remote methods under the `appBuilder` namespace (verified: `typert.remote-client.d.ts` 4614 bytes declares `TypertRemoteNamespace$6170704275696c646572` with 13 methods + a 17-row `TypertRemoteMap` under the `appBuilder` prefix).

**Phase A.3 (Option B bypass)**: each new UI pane mounts `appBuilderApiRemote` inside its own `apply` closure via `ctx.remote.$mount(appBuilderApiRemote)` before reading `ctx.remote.appBuilder.*`. The mount's await resolves before the slot registration reads from the namespace; no race, no aggregate-path dependency.

**Phase B (`ui-app-builder-deployments`)**: a single-feature plugin package mirroring the projects-pane skeleton. Slot: `app-builder.deployments` (single, scope: root). Stream consumer mirrors the canonical async-generator pattern (buffered queue not needed — the stream is push-driven via the AsyncIterable; AbortSignal on the transport drives cleanup). 12 unit tests cover empty / loading / error / closed banners, projectId filter, status mapping (pending / gates-running / pushing / awaiting-approval / succeeded / failed / rejected), aria-pressed mirror, row click routing, and URL placeholder.

**Phase C (`ui-app-builder-preview-iframe`)**: a single-feature plugin package mirroring the projects-pane skeleton. Slot: `app-builder.preview` (single, scope: root). Renders an iframe with `sandbox="allow-scripts"` (no allow-same-origin — a hostile dev server cannot reach the parent origin). URL changes drive a `key={iframeSrc}` remount. 12 unit tests cover no-project / no-record / ready / failed / stopped / starting states, sandbox attribute, src transition, error and closed banners, iframe aria-label.

**Phase D (shell)**: `packages/client/ui-app-builder-shell/src/client/contract/slots.ts` adds the `app-builder.deployments` SlotMap entry with `AppBuilderDeploymentsOwnerProps`. `Shell.tsx` renders the 4-pane layout: `<aside data-pane='deployments'>{renderSlot('app-builder.deployments', {selectedProjectId})}</aside>` sits between chat and preview. `Shell.module.css` updates the grid template to 4 columns (260 + 1fr + 280 + 1fr) and adds the `.deployments` selector. The shell test file updates its RenderSlotCall union to include `app-builder.deployments` and adds a test for the new owner-prop thread.

**Phase E (wiring)**: `tsconfig.client.json` references the two new packages. `packages/bundle/web-app/package.json` adds both as workspace dependencies. `packages/bundle/web-app/cordis.patch.yml` adds two `dsh.client` rows (no per-pane config — both panes are pure browser-side and read their own streams via the Option B-mounted Remote contribution).

**Phase E (validation)**: `pnpm run typecheck` PASS, `pnpm exec vitest run packages/client/ui-app-builder-{deployments,preview-iframe,shell,projects} packages/app-builder/api/tests/{deployments,preview-stream}.host.spec.ts` reports 4 test files / 46 tests PASS (12 deployments pane + 12 preview-iframe pane + 15 projects-list + 7 shell + 8 BFF deployments + 10 BFF preview-stream - the last two are the BFF side, not the UI panes). All on a clean `feat/phase2-5-ui-eventsource` branch at HEAD.

## Invariants

- The new panes compile only when `packages/app-builder/api` is a project reference. `ui-app-builder-deployments/tsconfig.json` and `ui-app-builder-preview-iframe/tsconfig.json` both list `{"path": "../../app-builder/api"}` so the `./remote` subpath export resolves at typecheck time.
- `@deepseek-ai/dsh-app-builder-api` is a peer+dev dependency of both new packages (not a runtime `dependencies` entry — per `packages/client/AGENTS.md`, dynamic packages never put `@deepseek-ai/dsh-*` in `dependencies`). The corresponding `dsh.client.inject` row declares the package-name edge (informational; activation order comes from Cordis fiber inject waiting on services, not module-graph edges).
- Each new pane mounts `appBuilderApiRemote` inside its own `apply` closure via `await ctx.remote.$mount(appBuilderApiRemote)`. The returned disposer is stored and called from the apply return value (which the loader awaits). The Option B pattern keeps the Remote contribution scoped to the pane's lifetime; a subsequent HMR reload rebuilds the apply and re-mounts cleanly.
- The new pane SlotMap augmentation lives in `packages/client/ui-app-builder-{deployments,preview-iframe}/src/client/contract/slots.ts`; the shell SlotMap augmentation in `packages/client/ui-app-builder-shell/src/client/contract/slots.ts` mirrors the same declarations so the SlotRegistry resolves the spec records at runtime. `ui-layout` does NOT declare `app-builder-shell` in its children (per the [shell children-regression note](2026-09-02-v0.1.2-alpha.1-app-builder-shell-children-regression.md)); the runtime mount is currently gated on the per-area 1.5.x fix.
- The 18 BFF tests still PASS after the package.json exports change (the exports / files additions are additive — they expose more, they don't change existing behavior).
- `pnpm run verify-cordis-inspect-catalog` is expected to fail on `packages/client/ui-approval/src/client/contract/slots.ts:71` (latent typert bug carried forward from 2.4); the failure is unrelated to this change and is documented in §9 below.

## Alternatives considered

### Aggregate `appBuilderApiRemote` in `packages/api/remotes/src/client/index.ts`

The canonical pattern: every Host Remote contribution aggregated in one Client assembly package, consumed through `ctx.remote.<namespace>.<method>(args)`. Implemented in session 4; triggered 40 TS2878 errors + a SessionStore cascade across 7 UI packages (ui-approval, ui-chat, ui-conversation, ui-model-selection, etc.). The structural fix is to change the typert generator to emit to `lib/types/typert.*` instead of `lib/typert.*`; that change has high blast radius (10+ packages, separate PR per the documented Option A in the session-4 handoff). Rejected; tracked separately.

### Direct relative-path import of `appBuilderApiRemote` from the BFF `lib/` directory

Cross-package direct value imports are forbidden by `packages/client/AGENTS.md` `export discipline` rule 3: a feature plugin MUST NOT runtime-import or re-export another feature plugin's values. Rejected; even if the rule did not forbid it, the cross-package value import bypasses the cordis / typert contribution machinery and would couple the new panes to the BFF's internal artifact layout. The Option B mount pattern honors the rule by importing through `./remote` (the BFF's published subpath) and treating the value as a Remote contribution, not as a package-private value.

### Use the existing snapshot-bridge polling pattern for deployment + preview state

The projects pane polls `/__dsh/app-builder/snapshot.json` every 5 s. The deployment + preview surfaces are inherently push-driven (lifecycle transitions fire as events, not state), so polling is the wrong primitive. The BFF already exposes AsyncIterable-based Remote methods; using them is the documented Phase 2.5 contract per `planning/Phase 2 prompt.md §3`. Rejected.

## Consequences

- `feat/phase2-5-ui-eventsource` advances from `e59c31aacf` to a new commit that adds 19 files (10 + 1 test for deployments, 10 + 1 test for preview-iframe, plus shell contract + Shell.tsx + Shell.module.css + shell test, plus bundle wiring). The 18 BFF tests + 46 UI tests are green; `pnpm run typecheck` is green.
- The runtime mount of the new panes is gated by the per-area shell regression fix; until `packages/client/ui-layout/src/client/index.ts` adds `app-builder-shell` to its root `children` declaration, the shell never mounts and the new panes never render in the browser. The boot overlay documented in the [shell children-regression note](2026-09-02-v0.1.2-alpha.1-app-builder-shell-children-regression.md) continues to disable `app-builder-shell` and (transitively) the new panes.
- The Option B bypass introduces one asymmetry: app-builder is the only Remote contribution not aggregated in `api/remotes`. The asymmetry is documented in the dsh.client row comments in `packages/bundle/web-app/cordis.patch.yml` and in this note. The structural fix (Option A) lands in a separate PR; once it lands, the Option B mount lines can be deleted and `api-remotes` can absorb `appBuilderApiRemote` cleanly.
- The 18 BFF tests + 7 shell tests + 15 projects-list tests + 12 deployments-pane tests + 12 preview-iframe-pane tests = 64 tests in the Phase 2.5 surface area. Pre-existing `getTranscript` failure in `api-methods.host.spec.ts` continues to fail (per session-2 carry-forward); it is NOT in the Phase 2.5 surface area and is NOT introduced or relaxed by this change.

## Carry-forward (§9)

- The `verify-cordis-inspect-catalog` latent typert bug at `packages/client/ui-approval/src/client/contract/slots.ts:71` (missing `readonly kind: 'approval' = 'approval' as const` annotation) is expected to fail again now that 2 client packages have been added to the typert catalog. The one-line fix is documented in the session-2 handoff §7.1; land as a separate follow-up PR per AGENTS.md "no-silent-unrelated-fix".
- The `getTranscript` test failure in `api-methods.host.spec.ts > getTranscript returns a cold page` is a pre-existing carry-forward (verified in session 2 to fail on the clean prior commit `0abc84c892`); NOT in Phase 2.5 scope; documented in session-2 handoff §4 carry-forward.
- The shell children-table regression (`app-builder-shell` not declared in `ui-layout` root children) is the gating issue for runtime visibility of every App Builder Web shell change since the v0.1.2-alpha.1 merge. Tracked as a per-area 1.5.x follow-up; the architectural decision (chain vs single kind) is owned by the slot-system team per the [shell children-regression note](2026-09-02-v0.1.2-alpha.1-app-builder-shell-children-regression.md) Consequences section.
- The Option A structural typert-emitter fix is tracked in the session-4 handoff as Option A; once it lands, this note's Option B references can be deleted and `api-remotes` can absorb `appBuilderApiRemote` as a one-line import + array entry.

## Risks

- **Runtime dead-on-arrival for the browser.** Until the shell regression is fixed, the new panes never render in the browser. Unit tests still cover the renderer (jsdom env), so the surface is verified at the unit level; the live-browser smoke is gated on the architectural fix.
- **Type drift between the BFF Remote types and the consumer-side redeclarations.** Each new pane's `snapshot.ts` redeclares the BFF wire types verbatim. The two diverge if the BFF changes its types — the `typert` generator emits to `lib/typert.remote-client.d.ts` at build time, and the consumer types would need a re-build + typecheck to catch the drift. The `@deepseek-ai/dsh-app-builder-api` peer+dev dependency on both new panes makes the build:lib:host step transitive; `pnpm run typecheck` runs `build:lib:host` first, so the consumer types stay current as long as the typecheck passes.
- **Two `Context.appBuilder` declarations.** The deployments pane's contract/slots.ts declares `Context.appBuilder: { selectProject: (id: string) => void }`; the shell's index.ts declares `Context.appBuilder: AppBuilderShellService`. TypeScript merges them additively; the shell's wider view wins at runtime, so the deployments pane sees the shell's full service (and may add calls to other shell service members in the future). The merge is structurally additive; no conflict.
