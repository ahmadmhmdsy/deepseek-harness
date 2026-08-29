# Step 18 - Phase 1 kickoff log (App Builder MVP)

> Records the Phase 1 work as it lands on branch `app-builder-web-reskin`. Source of truth for 'what is done / what is not' while the App Builder MVP takes shape. Updated continuously per `AGENTS.md` project-process rule.

## TL;DR

Phase 1 work is underway on `app-builder-web-reskin`. The branch carries Phase 0 closure (`519da740a2`, `9d99c4788e`), the standing workflow rule (`abc87d4df1`), the Phase 1 start marker (`708a956f3d`), the workspace registration (`f6c75d2350`), the bundle package (`e339f83877`), and the project package (`b44970308b`).

## Per-package status

| Package | Status | Notes |
|---|---|---|
| `packages/bundle/app-builder` | **shipped** (`e339f83877`) | cordis.patch.yml + four plugin rows + invariant companion |
| `packages/app-builder/project` | **shipped** (`b44970308b`) | `ProjectRegistry` service + `project/created` event + real-composition test |
| `packages/app-builder/scaffold` | pending | composes dsh-tool-fs + dsh-tool-str-replace-editor + dsh-tool-bash |
| `packages/app-builder/preview` | pending | composes dsh-tool-bash background + readiness HTTP-poll + dsh-tool-jobs |
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
- `registerManifest` is not a real export; the actual API is `ctx.invariants.register(packageName, installer: InvariantInstaller)`. Both new invariant files use the correct shape (empty installer with documented reason). The bundle invariant (`packages/bundle/app-builder/src/invariant.ts`) was corrected in this step after an initial draft used the fictional API.
- Translation pairing enforces byte-identical structure between EN and ZH: list bullet counts, link targets, and code blocks must align. Bundled scripts `verify-translation-pairing --write` and lefthook `pre-commit` enforce.
- Group-level READMEs (`packages/app-builder/README.md`) require a `.zh.md` and `.i18n.yaml` triplet whenever the group exists; the original `f6c75d2350` commit added the EN side only. Both that group and the `packages/README.md` ↔ `README.zh.md` table are reconciled here. Process rule reinforced: every bilingual README change must re-record both hashes immediately before `git add`.

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
