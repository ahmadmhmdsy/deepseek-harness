# Step 18 — Phase 1 kickoff log (App Builder MVP)

> Records the Phase 1 work as it lands on branch `app-builder-web-reskin`. Source of truth for "what is done / what is not" while the App Builder MVP takes shape. Updated continuously per `AGENTS.md §Project process and maintained artifacts`.

## TL;DR

Phase 1 work is underway on `app-builder-web-reskin`. The branch carries Phase 0 closure (`519da740a2`, `9d99c4788e`) and the standing workflow rule addition (`abc87d4df1`). The first substantive package work follows the per-package obligations in `planning/Phase 1 prompt.md §10` and the package structure described in `packages/README.md`.

## Per-package status

| Package | Status | Notes |
|---|---|---|
| `packages/app-builder/project` | pending | Cordis plugin + Project entity + projection unit + invariant |
| `packages/app-builder/scaffold` | pending | composes dsh-tool-fs + dsh-tool-str-replace-editor + dsh-tool-bash |
| `packages/app-builder/preview` | pending | composes dsh-tool-bash background + readiness HTTP-poll + dsh-tool-jobs |
| `packages/app-builder/persona` | pending | uses dsh-persona |
| `packages/bundle/app-builder` | pending | `cordis.patch.yml` over `packages/bundle/base` |
| `examples/app-builder` | pending | keyless + with-key smoke tests |
| `apps/web` (reskin on this branch) | pending | project list pane + chat re-use + preview iframe + config switch |

## Decisions carried from Phase 0 (recap)

- **Workspace group:** new group `packages/app-builder/` under `packages/`.
- **UI shell:** `apps/web` is re-skinned on this branch. Tag `apps-web-classic-pre-app-builder` at `9306f9371b` is the safety net. No parallel `apps/app-builder-web`.
- **Headless driver:** `pnpm dsh --profile headless` is the canonical pattern (`examples/headless-agent`).
- **Coverage:** per-file 100% on `packages/*/*/src` per `docs/testing.md`.

## Residual items inherited from Phase 0

- 8 deferred `pnpm run test` failures (6 environmental Windows ACL + 1 pwsh-sandbox + 1 intermittent contention flake) remain deferred per `planning/inspect/15-phase0-pre-existing-failures.md §6.7`.
- `pnpm run hygiene` requires `NODE_OPTIONS=--max-old-space-size=8192` on this machine (knip `oxc-parser` ArrayBuffer ceiling); gates are green at that setting.

## Verification

Five verification commands per `planning/Phase 1 prompt.md`:

```sh
pnpm run typecheck
pnpm run test:coverage
pnpm run test:snapshot
pnpm run doc-sync
pnpm run hygiene
```

Each run reports which sub-steps were exercised (per `AGENTS.md §Run relevant checks locally`); never re-run the full suite for a single-package change.

## Git state at this step

```
abc87d4df1 docs(agents): record project process rules and maintained artifacts
9d99c4788e docs(planning): record Phase 0 acceptance with caveats and the path B closures
519da740a2 test(windows): clear residual contention flakes and stale rescope markers
9306f9371b (tag: apps-web-classic-pre-app-builder) docs(planning): commit canonical PROJECT.md and its bilingual pair
```

## Cross-references

- `planning/Phase 1 prompt.md` — Phase 1 task brief
- `planning/plan.md §3` — App Builder MVP section (status: started)
- `planning/inspect/INDEX.md` — this step's index entry
- `planning/inspect/SUMMARY.md` — executive view
- `docs/PROJECT.md` — canonical project status
