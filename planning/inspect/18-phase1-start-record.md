# Step 18 - Phase 1 kickoff log (App Builder MVP)

> Records the Phase 1 work as it lands on branch `app-builder-web-reskin`. Source of truth for 'what is done / what is not' while the App Builder MVP takes shape. Updated continuously per `AGENTS.md` project-process rule.

## TL;DR

Phase 1 work is underway on `app-builder-web-reskin`. The branch carries Phase 0 closure (`519da740a2`, `9d99c4788e`), the standing workflow rule (`abc87d4df1`), the Phase 1 start marker (`708a956f3d`), the workspace registration (`f6c75d2350`), the bundle package (`e339f83877`), the bundle fix + bilingual pairs (`f50009233c`), the project package (`b44970308b`), the scaffold package (`f3c73809ce`), the preview package (`1267a1457b`), the persona package (`a7b37b571b`), and the example composition (`dd8a6a399b`, this step), the planning step 21 (`5b4b7951f0`), and the App Builder web shell scaffold (`03418a4679`).

## Per-package status

| Package | Status | Notes |
|---|---|---|
| `packages/bundle/app-builder` | **shipped** (`e339f83877`, invariant fix in `f50009233c`) | cordis.patch.yml + four plugin rows + invariant companion |
| `packages/app-builder/project` | **shipped** (`b44970308b`, apply() fix + invariant rewrite in this step) | `ProjectRegistry` service + `project/created` event + real-composition test |
| `packages/app-builder/scaffold` | **shipped** (this step) | composes ctx.fs + ctx.shell + ctx.jobs + ctx.sandboxPolicy; model-facing `app_builder_scaffold` tool + three inline templates (nextjs-app, nextjs-pages, svelte-spa) + optional background `npm install` |
| `packages/app-builder/preview` | **shipped** (this step) | composes ctx.shell + ctx.fs + ctx.jobs + HTTP readiness poll on 127.0.0.1; model-facing `app_builder_preview` tool with framework detection (next/vite/unknown) and free-port allocation |
| `packages/app-builder/persona` | **shipped** (this step) | thin wrapper around `@deepseek-ai/dsh-persona` that defaults the `deployment:persona` text to the App Builder identity (`APP_BUILDER_PERSONA`); bundle patch row references this name |
| `examples/app-builder` | **shipped** (`dd8a6a399b`, this step) | keyless smoke (mock LLM) passes; with-key smoke is `describe.skipIf(!DEEPSEEK_API_KEY)`; `cordis.yml` inlines project+scaffold+preview plugins; persona pulled via `agent-spine.config.persona` `!!js createRequire` indirection (avoids persona-plugin / deployment-persona collision); agent-spine loads BEFORE the App Builder plugins so `agents` (the `AgentRegistry` service) is published first |
| `packages/client/ui-app-builder-shell` | **scaffolded, typechecks** (`03418a4679`) | App Builder 3-pane shell plugin: registers `app-builder-shell` (single/root) into the existing root layout through `ctx.slots.inject` (chain take-over); declares 3 child slots (`app-builder.projects`, `app-builder.preview` root scope; `app-builder.conversation` session scope); renders CSS Grid 260px | 1fr | 1fr layout with locale-aware header; selection store under `stores.ts` exposes `selectedProjectId`; invariant companion with documented no-op install reason |
| `packages/client/ui-app-builder-projects` | **shipped** (this step) | App Builder projects pane plugin: registers `ProjectsList` into the host-declared `app-builder.projects` slot through `ctx.slots.inject`; snapshots polling effect writes the latest snapshot into a per-apply `SnapshotStore` shared with the inject `hooks` compartment (registrant-private fact — no slot-declared store); selection writes route through the shell-published `ctx.appBuilder` Cordis service; locale dictionaries (EN + ZH) cover header chrome, empty states, status labels; invariant companion with documented no-op install reason; poll cadence 5 s clamped to [1 s, 60 s] (Phase 2 SSE). Same step adds a shell ctx augmentation (`AppBuilderShellService` over `ctx.reflect.provide('appBuilder', service)`) and a `selectedProjectId?: string | undefined` owner-prop on the projects slot entry so the shell pushes the current selection on every renderSlot. |
| `apps/web` (reskin on this branch) | pending | project list pane + chat re-use + preview iframe + config switch |

## Decisions carried from Phase 0 (recap)

- **Workspace group:** `packages/app-builder/` under `packages/`.
- **UI shell:** `apps/web` is re-skinned on this branch. Tag `apps-web-classic-pre-app-builder` at `9306f9371b` is the safety net. No parallel `apps/app-builder-web`.
- **Headless driver:** `pnpm dsh --profile headless` is the canonical pattern (`examples/headless-agent`).
- **Coverage:** per-file 100% on `packages/*/*/src` per `docs/testing.md`.

## Residual items inherited from Phase 0

- 8 deferred `pnpm run test` failures (6 environmental Windows ACL + 1 pwsh-sandbox + 1 intermittent contention flake) remain deferred per `planning/inspect/15-phase0-pre-existing-failures.md §6.7`.
- `pnpm run hygiene` requires `NODE_OPTIONS=--max-old-space-size=8192` on this machine (knip `oxc-parser` ArrayBuffer ceiling); gates are green at that setting.

## Notes from package work

- The `project` package ships an in-memory `ProjectRegistry` with one `project/created` event per durable record; Phase 2 replaces it with a `dsh-storage-domain` implementation. Documented in `Known Limitations and Deferred Work`.
- `registerManifest` is not a real export; the actual API is `ctx.invariants.register(packageName, installer: InvariantInstaller)`. All three invariant companions (project, scaffold, bundle) now use the canonical plugin form (`name`/`inject`/`apply` named exports) and a no-op `install: InvariantInstaller` with a documented `No runtime invariant:` reason. The bundle invariant (`packages/bundle/app-builder/src/invariant.ts`) was corrected in `f50009233c` after an initial draft used the fictional API.
- The original `project` package's `apply()` constructed `new ProjectRegistry(ctx)` without a name argument; `Service`'s base constructor falls back to the static `provide` field, which `ProjectRegistry` does not set, so the service was registered under `undefined` and `ctx.appBuilderProjects` resolved to nothing. The constructor now takes an explicit `name` (default `'appBuilderProjects'`) and `apply()` passes it through. The original `static inject = ['logger']` is removed: `ctx.logger` is auto-mounted on `new Context()` (not a registered service) and the inject array kept the fiber stuck in PENDING.
- Translation pairing enforces byte-identical structure between EN and ZH: list bullet counts, link targets, and code blocks must align. Bundled scripts `verify-translation-pairing --write` and lefthook `pre-commit` enforce.
- Group-level READMEs (`packages/app-builder/README.md`) require a `.zh.md` and `.i18n.yaml` triplet whenever the group exists; the original `f6c75d2350` commit added the EN side only. Both that group and the `packages/README.md` ↔ `README.zh.md` table are reconciled in `f50009233c`. Process rule reinforced: every bilingual README change must re-record both hashes immediately before `git add`.
- The scaffold tool's three templates (nextjs-app, nextjs-pages, svelte-spa) are inline TypeScript modules exporting a `Readonly<Record<ScaffoldTemplate, ScaffoldTemplateDefinition>>` — no template engine, no string interpolation, no Phase 1 dependency on bundling real Next.js/Svelte projects. The Agent Note `scaffold-plugin` (deferred to a later step) records the decision to defer templating.
- The bundle's `tsconfig.json` references each app-builder package only after that package ships. The scaffold reference landed with `f3c73809ce`; the preview reference is restored by the preview step; the persona reference is restored once the persona package ships.
- Test-invariants global host bypass: tests that exercise a Service-class plugin with no inject dependencies must opt out of the host by including `invariant` in the test filename (e.g. `loader-composition-invariant.spec.ts`). The bypass pattern matches the harness's `usesManualInvariantTree` regex.
- The `index.ts` for the scaffold package carries `/* v8 ignore */` not used; the full plugin lifecycle (including `ctx.tools.register`, `ctx.fs.writeText`, the optional `ctx.jobs.start` branch) is reachable only through the Loader-driven smoke in `examples/app-builder/`, which the next commits build out.
- The preview tool keeps the dev server on `127.0.0.1` only: the free-port probe allocates via `net.createServer().listen(0, '127.0.0.1')` and the readiness helper dials the same loopback. Framework detection (next / vite / unknown) reads the project `package.json` through `ctx.fs.readText` and branches the port flag (`-p` for next, `--port` for vite); the `unknown` fallback runs `npm run dev` verbatim. The dev server lifecycle rides `ctx.jobs.start` with the new `JobKindMap` merge for `app-builder-preview-dev`. The tool fails loud with a clear message when `ctx.jobs` is missing, rather than falling back to a foreground process.
- Readiness probe helper: each attempt runs inside its own `AbortController` so a hung socket cannot consume the entire wall-clock budget; the helper returns `{ ready: false, polls, readyMs }` when the budget elapses and throws when the outer signal aborts. 29 unit tests cover validators + framework detection + command construction + readiness abort + budget-elapse paths.
- Bundle `tsconfig.json` re-adds the `packages/app-builder/preview` reference that was dropped in `f3c73809ce`; the scaffold reference is unchanged.
- The persona plugin is a thin wrapper around `@deepseek-ai/dsh-persona`: it re-exports `PERSONA_SECTION` and `PERSONA_ORDER`, defaults `text` to `APP_BUILDER_PERSONA`, and forwards `complete` / `includeRuntimeContext` to the canonical row. The App Builder identity fixes scope (scaffolding + iteration), tools (the four App Builder tools plus `write` / `str_replace_editor` / `bash`), loop (one scaffold call per fresh project, dev server through preview not bash), and confirmation (model asks before destructive commands and refuses to scaffold into an existing directory). Empty `text` still occupies the slot, so a deployment that wants to shadow the deployment persona can override with `text: ""`.
- The App Builder persona peer-depends on `@deepseek-ai/dsh-persona`. The bundle patch layer includes `app-builder-persona` so any composition mounted from `@deepseek-ai/dsh-app-builder` carries the App Builder identity automatically. The persona plugin declares the peer in `package.json` and the loader refuses to mount it without `@deepseek-ai/dsh-persona` available.
- Bundle `tsconfig.json` re-adds the `packages/app-builder/persona` reference that was dropped in `f3c73809ce`. All four app-builder packages now appear in the bundle references; the bundle typechecks across all of them.

## Notes from package work (this step)

- **Cross-package selection channel via `ctx.appBuilder` Cordis service.** The shell now publishes an `AppBuilderShellService` (consumer view: `{ selectProject: (id: string) => void }`) through `ctx.reflect.provide('appBuilder', service)`. Both the projects pane (this step) and the future preview pane consume it through `Context` declaration merging — TypeScript merges the shell's `interface Context { appBuilder: AppBuilderShellService }` with the consumer's matching declaration because both expose the same `selectProject` signature. Cross-package store sharing is forbidden by slot-system design (each package's declared `store:` factory is scoped to its own slot entry), so the service handle is the only way for sibling panes to write selection without re-registering into each other's slots.
- **Shell selection store is shared through the runtime's `resolveStore`.** `apply()` calls `storeHandle.create()` exactly once into a module-level `storeInstance`; the runtime caches store instances per `(handle, scopeKey)` so subsequent `storeOf(entry, scopeKey)` calls from the projects slot's component (and from any future pane that takes `store:` in its declaration) return the same identity. The shell pushes the current selection to the projects slot on every `renderSlot('app-builder.projects', { selectedProjectId })`, so the component reads the latest value through plain props rather than calling a hook on the shared store directly — keeping the four props shares intact and avoiding a second subscription channel.
- **`selectedProjectId?: string | undefined` (not `string`) on the projects owner props.** Required by `exactOptionalPropertyTypes: true` in `tsconfig.base.client.json`. The shell's `{ selectedProjectId }` object uses the bare spread `{ selectedProjectId }` (the variable is `string | undefined`), and the projects slot's component types its owner-prop view as `{ selectedProjectId?: string | undefined }` so the optional-undefined path matches the shell's call.
- **Registrant-private snapshot polling via the inject `hooks` compartment, not a slot-declared `store:`.** The polling state is only read by this pane's renderer, so the standard's `registrant-private → inject hooks compartment` rule applies. `apply()` calls `createSnapshotStore(...)` once, then exposes the same instance as `hooks.snapshot` (typed as `HostObservable<AppBuilderProjectsState>`); the renderer binds it to the standard `useSnapshot` selector hook via `bindSnapshotSelector` (cached per source). The polling effect writes via `.set()` / `.update()`; the component reads via `useSnapshot(s => ...)` — no local mirror, no manual subscribe wiring. A slot-declared `store:` would have leaked the polling state to sibling entries that share the slot, which is the exact case the standard rules out.
- **Polling cadence: 5 s default, clamped to [1 s, 60 s].** The `Config.pollIntervalMs` knob exists for tests and overrides; the helper `clampInterval` enforces the bounds. Phase 2 replaces polling with an SSE channel (the planning step reserves the endpoint for that). Empty `snapshotUrl` (the host has not published a snapshot endpoint yet — Chunk 5 deliverable) disables polling entirely and renders the `snapshotUnconfigured` empty state.
- **Snapshot normalizer tolerates malformed entries by dropping them, not throwing.** `normalizeSnapshot` / `normalizeProject` / `normalizeDevServer` validate each top-level field, return `null` on failure, and the caller filters those out. This is the only sanitization Phase 1 runs: a hostile snapshot is mitigated at the HTTP origin (localhost-only binding per the planning step) rather than at the renderer.
- **`exactOptionalPropertyTypes: true` forces conditional spreads.** Optional fields in the normalized shape (`template?: string`) are built with `...(value !== undefined ? { value } : {})` rather than `value: ... | undefined`, so a genuinely absent field stays absent instead of becoming an explicit `undefined` property — which TypeScript would otherwise reject on a strict-optional consumer.
- **Type-only import `{} from '@deepseek-ai/dsh-client-ui-app-builder-shell/client'` forces the shell's `declare module` block into the projects compilation.** Without it, the shell's `interface Context { appBuilder }` augmentation would only live in packages that import a runtime symbol from the shell, leaving `ctx.appBuilder` untyped in the projects compile. The pure-import form keeps the projects package's runtime import graph untouched (the baseline externals already cover it, so the module graph doesn't change).
- **Linter autofix landed two style corrections on `ProjectsList.tsx` and `client/index.ts`.** `@stylistic/arrow-parens` rejects single-arg arrows with parens around the parameter (`(s) => ...`) when the body has no curly braces; the fix is bare `s => ...`. `@stylistic/indent` enforces 2-space increments; the original nested ternaries and `.map(...).filter(...)` chains ran one indent level too deep. Both are mechanical and the resulting JSX / chains read identically.
- **The shell exposes `getSelectedProjectId` alongside `selectProject`** so the preview pane (next step) can read the current selection from the service when the projects pane is not mounted (the slot can be empty if the projects package fails to load). The shell does NOT expose the store handle directly; the preview pane will use `getSelectedProjectId` for the source of truth and ignore the shared store unless it later takes a `store:` declaration.
- **Three module-augmentation shims sit at the consumer view.** The projects package's `src/client/contract/slots.ts` declares `interface Context { appBuilder: AppBuilderShellService | { selectProject } }` (the second branch is the structural view that lets the projects pane compile against a partial shell surface when imported alone). The shell's `src/client/index.ts` declares the canonical `AppBuilderShellService`. TypeScript merges them by `appBuilder` key — compatible because both surface a `selectProject: (id: string) => void` member with matching signatures.
- **Invariant companion is `No runtime invariant:` with the standard reason.** Both the projects and (this step's shell-side change to its own) invariant companions use the canonical form: `install: () => { /* No runtime invariant: ... */ }`. The reason varies per package (the projects package's reason documents why a polling pane has no Cordis-side invariant — the snapshot's `devServers[*].status` transitions are projected, not asserted).

## Notes from example work (this step)

- The bundle `cordis.patch.yml` is consumed only by the profile launcher (`dsh --profile app-builder`); direct `cordis.yml` compositions MUST inline the four plugin rows (project / scaffold / preview / optional persona) themselves. The bundle JS plugin is intentionally a no-op so direct compositions can mount the same plugin set without going through `dsh --profile`. The example's `cordis.yml` documents this and inlines the three runtime rows.
- The persona plugin is scope-only by design: when mounted unscoped it collides with the `deployment:persona` slot owned by `dsh-system-prompt`. The example instead pulls `APP_BUILDER_PERSONA` out of `@deepseek-ai/dsh-app-builder-persona/text` via a `!!js` expression that uses `node:module` `createRequire` on `import.meta.url`, then pins it on `agent-spine.config.persona`. The keyless snapshot overrides that field with its own `Keyless App Builder smoke.` text via `cordis-plugin-include.patches`.
- Load order: `agent-spine-demo` MUST be declared in `cordis.yml` before any `app-builder-*` row, because scaffold and preview inject `agents` (the `AgentRegistry` service). If the registry is not published yet the App Builder plugins stay PENDING and the Loader errors at boot. `sandbox-policy` runs in `workspace-write` mode so scaffold can create the project directory and preview can read the project `package.json`.
- The keyless smoke uses a four-turn mock LLM (scaffold → read → write → final text). It boots the real `cordis.yml` through `@deepseek-ai/dsh-loader-smoke` with the real DeepSeek adapter disabled and a mock adapter (`@deepseek-ai/dsh-llm-local`-style fixture) mounted in its place. The fixture is `tests/fixtures/keyless-mock-llm.ts`; the driver is `tests/fixtures/keyless-driver.ts` (a near-clone of `examples/headless-agent/tests/fixtures/headless-driver.ts` adapted to the App Builder tool set).
- The keyless smoke asserts: (a) `app_builder_scaffold` wrote the Svelte SPA template files (`package.json`, `src/App.svelte`, `index.html`, etc.) into the temp workspace; (b) the follow-up `write` call overrode the `dev` script with the bundled Node preview server; (c) the system prompt carries both `app_builder_scaffold` and `app_builder_preview` descriptions; (d) the `app_builder_scaffold` tool result event is captured with a non-empty `rootPath`; (e) the final assistant text ends with the `APP_BUILDER_KEYLESS_SMOKE_OK` marker. Wall-clock is ~9.4 s on this machine.
- The with-key smoke is intentionally identical in shape (same driver, same boot path) but uses the real `cordis.yml` and asks the agent to scaffold then start a preview dev server. It self-skips via `describe.skipIf(!process.env.DEEPSEEK_API_KEY)`.
- Bash is unavailable on this Windows runner (`C:\Windows\System32\bash.exe` is the WSL stub; `bash -c` fails with `WSL Relay ERROR: CreateProcessCommon:735: execvpe(/bin/bash) failed`). The keyless smoke therefore STOPS at scaffold + override write and does NOT call `app_builder_preview`; the bundled `preview-server.js` exists so a real-bash runner (CI, macOS/Linux developer) can exercise the full scaffold→preview loop in the with-key smoke.
- A source-level fix landed with this step: the uncommitted scaffold/preview `index.ts` had `inject: ['...', 'agent']` (singular) which is the per-scope accessor, not the registry service. That made both plugins stay PENDING forever. Now both inject `'agents'` (plural). The same diff also adds `ctx.emit('fs/observed', fileTarget, { kind: 'present', version: outcome.version }, exec)` after every scaffold `writeText` call: the `fs-observation-policy` keys observations by `actor.agent.session`, so a model-driven `write` / `edit` in the same turn fails with `FS_NOT_OBSERVED` unless the scaffold writes are explicitly observed. The preview tool also forwards `PORT` via `env: { PORT: String(port) }` so the `framework: 'unknown'` fallback (`npm run dev` verbatim) can be picked up by any dev script that honors `$PORT`.
- The example's bilingual README triplet (`README.md`, `README.zh.md`, `README.i18n.yaml`) was recorded via `scripts/verify-translation-pairing.ts --write`. Pair check across the repo reports 1013 records consistent. Group tables in the parent `examples/README.md` ↔ `README.zh.md` will be reconciled in the next step.

## Verification

Five verification commands per `planning/Phase 1 prompt.md`:

```sh
pnpm run typecheck
pnpm run test:coverage
pnpm run test:snapshot
pnpm run doc-sync
pnpm run hygiene
```

Each run reports which sub-steps were exercised (per `AGENTS.md` §Run relevant checks locally); never re-run the full suite for a single-package change.

## Git state at this step

```
03418a4679 feat(client): scaffold ui-app-builder-shell MVP 3-pane layout
5b4b7951f0 docs(planning): add step 21 - App Builder web shell reskin plan
de25c77d7f docs(planning): record examples/app-builder commit SHA in step 18
dd8a6a399b feat(examples): scaffold examples/app-builder MVP composition with keyless + with-key smokes
a7b37b571b feat(app-builder): scaffold packages/app-builder/persona MVP persona wrapper
1267a1457b feat(app-builder): scaffold packages/app-builder/preview MVP dev-server tool
f3c73809ce feat(app-builder): scaffold packages/app-builder/scaffold MVP tool
f50009233c fix(app-builder): align bundle invariant API and complete bilingual pair for app-builder group
b44970308b feat(app-builder): scaffold packages/app-builder/project MVP package
e339f83877 feat(app-builder): scaffold packages/bundle/app-builder MVP patch layer
f6c75d2350 feat(workspace): register app-builder group on app-builder-web-reskin
708a956f3d docs(planning): mark Phase 1 start on app-builder-web-reskin
abc87d4df1 docs(agents): record project process rules and maintained artifacts
9d99c4788e docs(planning): record Phase 0 acceptance with caveats and the path B closures
519da740a2 test(windows): clear residual contention flakes and stale rescope markers
9306f9371b (tag: apps-web-classic-pre-app-builder) docs(planning): commit canonical PROJECT.md and its bilingual pair
```

## Cross-references

- `planning/Phase 1 prompt.md` - Phase 1 task brief
- `planning/plan.md` §3 - App Builder MVP section (status: started)
- `planning/inspect/INDEX.md` - this step's index entry
- `planning/inspect/SUMMARY.md` - executive view
- `docs/PROJECT.md` - canonical project status
