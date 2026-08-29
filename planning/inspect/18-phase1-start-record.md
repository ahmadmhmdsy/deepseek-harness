# Step 18 - Phase 1 kickoff log (App Builder MVP)

> Records the Phase 1 work as it lands on branch `app-builder-web-reskin`. Source of truth for 'what is done / what is not' while the App Builder MVP takes shape. Updated continuously per `AGENTS.md` project-process rule.

## TL;DR

Phase 1 work is underway on `app-builder-web-reskin`. The branch carries Phase 0 closure (`519da740a2`, `9d99c4788e`), the standing workflow rule (`abc87d4df1`), the Phase 1 start marker (`708a956f3d`), the workspace registration (`f6c75d2350`), the bundle package (`e339f83877`), the bundle fix + bilingual pairs (`f50009233c`), the project package (`b44970308b`), the scaffold package (`f3c73809ce`), and the preview package (this step).

## Per-package status

| Package | Status | Notes |
|---|---|---|
| `packages/bundle/app-builder` | **shipped** (`e339f83877`, invariant fix in `f50009233c`) | cordis.patch.yml + four plugin rows + invariant companion |
| `packages/app-builder/project` | **shipped** (`b44970308b`, apply() fix + invariant rewrite in this step) | `ProjectRegistry` service + `project/created` event + real-composition test |
| `packages/app-builder/scaffold` | **shipped** (this step) | composes ctx.fs + ctx.shell + ctx.jobs + ctx.sandboxPolicy; model-facing `app_builder_scaffold` tool + three inline templates (nextjs-app, nextjs-pages, svelte-spa) + optional background `npm install` |
| `packages/app-builder/preview` | **shipped** (this step) | composes ctx.shell + ctx.fs + ctx.jobs + HTTP readiness poll on 127.0.0.1; model-facing `app_builder_preview` tool with framework detection (next/vite/unknown) and free-port allocation |
| `packages/app-builder/persona` | pending | uses dsh-persona |
| `examples/app-builder` | pending | keyless + with-key smoke tests |
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
<scaffold> feat(app-builder): scaffold packages/app-builder/scaffold MVP tool
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
