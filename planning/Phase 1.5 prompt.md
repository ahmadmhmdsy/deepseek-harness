# TASK: Phase 1.5 — Upstream sync to dsh-v0.1.2-alpha.1

> Inserted between Phase 1 (App Builder MVP, in progress) and Phase 2 (Productize control plane). Synchronizes the fork to upstream's `dsh-v0.1.2-alpha.1` release and re-grounds the App Builder on top of upstream's chosen app shape (`apps/cli` + `apps/web`).

Read [docs/PROJECT.md](../../docs/PROJECT.md) and [inspect/19-upstream-v0.1.2-alpha.1-adoption-plan.md](inspect/19-upstream-v0.1.2-alpha.1-adoption-plan.md) first. The detailed per-file conflict map and conflict-resolution plan live in the inspect step.

## 0. Resolved decisions for Phase 1.5

- **Pin**: bump from `0.1.1-rc.2` to `0.1.2-alpha.1`. The fork aligns with upstream's tagged release after this phase.
- **Examples layout**: `examples/app-builder/` moves to `apps/cli/config/examples/app-builder/` (matches upstream's post-PR #2977 layout).
- **Web shell**: adopt upstream's `apps/web/` (183 files, 56 first-parent merges past `b150a551b8`). Our `packages/client/ui-app-builder-shell` + `packages/client/ui-app-builder-projects` re-skin inside the new host layout via the existing slot-injection contract.
- **Phase 2 accelerators**: cherry-pick `xtr/projection-per-session-cache` (PR #2781), the `worktree-apire-*` cluster (PRs #2911, #2968, #3082, #3083, #3085, #3086, #3217, #3235), and `feat/subagent-provider` (PR #2663). Each is its own sub-phase commit.
- **Git strategy**: native GitHub stacked PRs. Phase 1.5.1 (B2 merge) at the bottom, 1.5.7 (planning artifacts) at the top. Each sub-phase is a separate PR stacked on the one below.

## 1. Sub-phases

Each sub-phase is a single stacked PR. The stack bottom-up: **1.5.1 → 1.5.2 → 1.5.3 → 1.5.4 → 1.5.5 → 1.5.6 → 1.5.7**.

### 1.1 — B2 merge: absorb `dsh-v0.1.2-alpha.1`

- Branch: `merge/upstream-v0.1.2-alpha.1` off current `master`.
- Action: `git fetch upstream`; `git merge --no-ff upstream/master` (preserve our 40 commits on top of the merge).
- Conflicts: the 25 shared paths in `inspect/19-upstream-v0.1.2-alpha.1-adoption-plan.md §3`. Resolution per the inspect table.
- After merge: regenerate `pnpm-lock.yaml` via `pnpm install`.
- **Gate verification**: `pnpm run typecheck && pnpm run test:coverage && pnpm run test:snapshot && pnpm run doc-sync && pnpm run hygiene` — all five PASS.
- **Agent Note**: `merge-upstream-v0.1.2-alpha.1` (en + zh + i18n.yaml).
- **Push + PR**: native GitHub stacked PR targeting `master`. `gh stack sync` after CI green.

### 1.2 — Relocate `examples/app-builder/`

- Branch: `relocate/examples-app-builder` stacked on 1.5.1.
- Action: `git mv examples/app-builder apps/cli/config/examples/app-builder`. Update cordis.yml paths, snapshot fixture paths, README enumerations, and `planning/Phase 1 prompt.md §6` wording.
- Update `packages/bundle/app-builder/cordis.patch.yml` if it references the old path.
- Re-record the keyless/with-key snapshot fixtures at the new path.
- **Gate verification**: 5 gates green.
- **Agent Note**: `examples-relocation`.

### 1.3 — Re-skin `ui-app-builder-shell` + `ui-app-builder-projects` inside upstream's `apps/web/`

- Branch: `apps-web-reskin-on-upstream` stacked on 1.5.2.
- The merge in 1.5.1 already brings upstream's `apps/web/` (183 files). This sub-phase **integrates** our slot plugins into the new host layout.
- Update slot declarations: `app-builder-shell` (root), `app-builder.projects` (sidebar), `app-builder.preview` (right pane), `app-builder.conversation` (center).
- Update `apps/web/index.html` title to identify the App Builder build.
- Update `apps/web/cordis.yml` (if present) to mount the app-builder shell.
- Update snapshot polling URL to match upstream's apps/web endpoint.
- **Gate verification**: 5 gates green; web browser snapshot scenarios PASS (`cordis.yml`, `scaffold-hello-world`, `preview-dev-server`, `preview-iterate`).
- **Agent Note**: `app-builder-shell-on-upstream-web`.

### 1.4 — Adopt `xtr/projection-per-session-cache` (PR #2781, `53c8f64eed`)

- Branch: `adopt/projection-cache` stacked on 1.5.3.
- Action: `packages/session/session-projection-cache/` is in our tree after 1.5.1. Wire it into `packages/app-builder/project/` (Phase 2 §4: "Add a `project` projection unit").
- Add `@deepseek-ai/dsh-session-projection-cache` to `packages/app-builder/project/package.json` peerDependencies.
- **Gate verification**: 5 gates green; project projection snapshot PASS.
- **Agent Note**: `projection-cache-integration`.

### 1.5 — Adopt `worktree-apire-*` cluster

- Branch: `adopt/api-gateway-cluster` stacked on 1.5.4.
- Action: scaffold `packages/app-builder/api/` (Typert Remote service). Mount via `@deepseek-ai/dsh-api-gateway` + `@deepseek-ai/dsh-api-remotes`. Implement the 11 methods from `Phase 2 prompt.md §3`.
- **Gate verification**: 5 gates green; `api-list-projects` snapshot PASS.
- **Agent Note**: `api-gateway-cluster`.

### 1.6 — Adopt `feat/subagent-provider` (PR #2663, `f76a225a7d`)

- Branch: `adopt/subagent-provider` stacked on 1.5.5.
- Action: cherry-pick PR #2663 + re-apply our `721c1d6fe1 fix(subagent): route spawned children through parent's live model selection` on top of the upstream refactor (4 files in `packages/subagent/subagent/` don't overlap with our fix).
- **Gate verification**: 5 gates green.
- **Agent Note**: `subagent-provider`.

### 1.7 — Update planning artifacts

- Branch: `docs/phase1.5-record` stacked on 1.5.6.
- Update `planning/plan.md` (insert Phase 1.5 between Phase 1 and Phase 2; mark Phase 1 accepted; mark Phase 2 in-progress).
- Update `planning/goal.md` (add Phase 1.5 phase goal).
- Update `planning/Phase 2 prompt.md` (reference adopted upstream infrastructure; the API gateway + projection cache are now in our tree, not future work).
- Update `planning/inspect/INDEX.md` (add steps 19-26).
- Update `planning/inspect/SUMMARY.md` (executive view).
- Update `docs/PROJECT.md` (pin bumped to `0.1.2-alpha.1`; Phase 1 accepted; Phase 2 in progress).
- **Gate verification**: `pnpm run doc-sync` PASS.
- **Agent Note**: `phase-1.5-upstream-sync-record`.

## Verification (each sub-phase)

```sh
pnpm run typecheck
pnpm run test:coverage
pnpm run test:snapshot
pnpm run doc-sync
pnpm run hygiene
```

Match evidence to the surface per `AGENTS.md` §Run relevant checks locally. CI owns the platform matrix.

## Definition of done (Phase 1.5)

- `master` pin = `0.1.2-alpha.1`.
- `examples/app-builder/` lives at `apps/cli/config/examples/app-builder/`.
- `apps/web/` is upstream's; our shell plugins inject into it.
- `packages/app-builder/api/` scaffolded; 11 methods mounted.
- `packages/app-builder/project/` uses the projection cache.
- `packages/subagent/subagent/` includes both upstream's provider refactor and our 721c1d6fe1 fix.
- `pnpm-lock.yaml` regenerated; all 5 verification commands PASS.
- All Agent Notes (en + zh + i18n.yaml) committed in their respective sub-phases.
- All seven sub-phase PRs merged via native GitHub stacked PRs.
- `docs/PROJECT.md` reflects the new state.

## Do NOT in Phase 1.5

- Do not invent new apps or packages beyond the planned relocations and adoptions.
- Do not skip the 5 gates between sub-phases.
- Do not rebase already-merged sub-phases; preserve stack history per `AGENTS.md` "Choose PR history deliberately".
- Do not adopt the four BLOCKING commits outside the B2 merge (they're part of v0.1.2-alpha.1).
- Do not move into Phase 2 sub-phases (`packages/app-builder/{deployment,tool-policy}`) until Phase 1.5 is accepted.

## Report

Report per sub-phase: branch + commit SHA, gate results, Agent Note filename. Do NOT proceed to Phase 2 (`packages/app-builder/deployment`) until all seven sub-phases are merged and the planning artifacts reflect the new state.
