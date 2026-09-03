# Agent Note: App Builder project projection unit + cache integration

Status: implemented

English | [中文](2026-08-31-projection-cache-integration.zh.md)

Branch: `adopt/projection-cache` (stacked on `apps-web-reskin-on-upstream`).

Stack position: 1.5.4 (above 1.5.3, below 1.5.5).

## Problem

The App Builder `project` package shipped in Phase 1 as a process-local `ProjectRegistry` plus a `project/created` event. The session-side view of "which project owns this session" lived in `ProjectRegistry.listSessionIds(id)` — a runtime scan that no projection system could persist or serve across restarts. Phase 2 §4 ("Add a `project` projection unit in `packages/app-builder/project/`") calls for the owning-project relation to ride the `session-projection` seam so the persisted projection cache (`@deepseek-ai/dsh-session-projection-cache`, mounted in `bundle/base` since the B2 merge) checkpoints it and the listing read serves it without re-reading the full session log. Sub-phase 1.5.4 lands the unit, the registration, and the cache wiring in one stacked PR.

## Decision

**1. New projection unit `packages/app-builder/project/src/projection.ts`.** Key `project`, `stateVersion: 1`. State shape `{ owningProjectId: ProjectId | null, owningProjectName: string | null, owningProjectRootPath: string | null }` — plain JSON per the persisted-cache precondition, branded `ProjectId` is a string at runtime. Wire view is the strict subset with `owningProjectId: string | null`. Both schemas are `zod` `.strict()` objects; the cache reads them through the projection registry's standard `viewSchema` gate. The unit extends `@deepseek-ai/dsh-session-projection/types` `SessionProjectionMap` and `SessionProjectionStateMap` via declaration merging so the new key shows up on every `ctx.sessionProjections.snapshot(...).values.project` read.

**2. `init(header)` does the cwd → registry lookup at session creation.** The function reads `ctx.get('appBuilderProjects')` (Cordis strict service lookup per `packages/AGENTS.md`) and picks the project whose canonical root is a directory-prefix ancestor of `header.cwd`. The +sep guard (`rootPath + '/'` or `rootPath + '\\'`) blocks the substring false positive (`/home/me` is not under `/home/mex`). A session with no `cwd`, an unmounted registry, or no matching project folds to the zero state — every nullable arm is `null`.

**3. `apply(state, event) → state` is the identity fold.** A session's cwd is set once at creation and never mutates (it's a `SessionHeader` immutable field), so every committed event passes the same reference through. `Object.is` gates the change feed (zero per-event work) and the cache's throttled write-behind writes only on count/interval triggers and the three mandatory points (creation, `turn/end`, dispose), not on every event. This is the "compute once at init, never change" pattern: the cost is amortized to one lookup per session, the cache sees one durable write at session creation, and the listing read serves from the cache until detach.

**4. `apply(ctx, config)` registers the unit on `ctx.sessionProjections`.** `inject` is now `['sessionProjections']`. The unit registration is an effect on the plugin's fiber (per the registry contract): unloading the plugin fiber removes the `project` key from every live and cold snapshot. The plugin also calls `bindProjectionContext(ctx)` (a one-line module-private helper in `projection.ts`) so the unit's `init` can resolve `ctx.appBuilderProjects` without a context argument — Cordis's drive path doesn't pass a context to `init`, only the `SessionHeader`, so the unit captures the registrant fiber's context at registration time.

**5. Empty invariant companion, updated reason.** `src/invariant.ts` keeps the empty `install: InvariantInstaller = () => {}` and updates the `No runtime invariant:` prose to cover the new responsibility. The cwd → owning-project relation is owned and runtime-checked by `ProjectRegistry.create()` (which validates the rootPath is a directory) and by `ProjectRegistry.listSessionIds()` (which derives the prefix-match set); the projection unit is a pure fold over that relation, not its owner. The persisted cache checkpoints the unit's state and a stale or version-mismatched row is discarded on read (no migration) — the unit's `stateVersion` is the gate.

**6. Peerdeps added.** `@deepseek-ai/dsh-session-projection` (the unit imports `ProjectionDefinition` and the `/types` module-path for declaration merging) and `@deepseek-ai/dsh-session-projection-cache` (per `planning/inspect/19-upstream-v0.1.2-alpha.1-adoption-plan.md §6.1` step 2 — the package declares its cache companion so a downstream bundle composition that omits the cache fails the cordis-config verifier instead of silently shipping a non-persisted projection). The cache plugin itself is mounted in `packages/bundle/base/cordis.patch.yml` at the `session-projection-cache` row with `writeEveryEvents: 200, writeIntervalMs: 5000` — no App Builder bundle change.

**7. Bilingual README triplet.** The English and Chinese READMEs add a new section documenting the projection key, the wire payload, and the cache relationship, plus a Known Limitations entry noting that the listing read depends on the cache plugin being mounted (a composition without the cache serves unpersisted projections). The translation-pairing hash is re-recorded via `pnpm run verify-translation-pairing --write packages/app-builder/project/README.md`.

## Verification

- `pnpm install` regenerates the lockfile with the two new peerDeps.
- `pnpm run typecheck` passes the host + client aggregates; the new package's tsconfig adds references to `session-projection`, `session-projection-cache`, and `storage-domain`.
- `pnpm run verify-cordis-config` passes 155 config files (the App Builder bundle patch already references the project package).
- `pnpm run verify-tsconfig-paths` passes (the package path `@deepseek-ai/dsh-app-builder-project` ↔ `packages/app-builder/project` matches the directory layout; `gen-tsconfig-paths` accepts without a hand-written alias).
- `pnpm run verify-translation-pairing --write` re-records the README and Agent Note triplets.
- `pnpm run verify-md-wrap` passes (2186 files, no hard-wrapped prose).
- `pnpm run verify-agent-note-format` passes (647 Agent Notes conform after this triplet lands).
- `pnpm exec vitest run packages/app-builder/project/tests/` — 4 tests pass: the existing loader-composition-invariant smoke plus the new projection-cache Loader-composition suite (namespace-shape pin, cwd-under-project resolution, zero state on no match, identity-on-event identity).
- `pnpm exec vitest run packages/session/session-projection/tests/ packages/session/session-projection-cache/tests/` — cache contract tests stay green.
- Lefthook pre-push (build:lib:host + typecheck:contracts-ready, ~32 s) passes during push.
- `pnpm run doc-sync` / `pnpm run hygiene` / `pnpm run test:coverage` / `pnpm run test:snapshot` — CI-owned; the 13 doc-sync + 8 hygiene failures + 15 upstream-introduced coverage regressions inherited from 1.5.1 land in 1.5.7.

## Known pre-existing failures

None new in 1.5.4. The 3 doc-sync bilingual drift notes (`2026-06-24-workspace-context.md`, `2026-07-21-follow-instruction-symlinks.md`, `2026-07-21-instruction-load-all-dedup.md`) inherited from 1.5.1 remain; they reference a non-existent `2026-08-29-claude-md-operating-system.md` and land in 1.5.7.

## Alternatives considered

- **Compute on demand in `listSessionIds` only.** Rejected: keeps the per-session scan O(n×m) at every listing read and gives the cache nothing to checkpoint. The projection unit is the canonical owner of the fold; `listSessionIds` becomes a thin caller over `ctx.sessionProjections.stateOf(session, 'project')` in a follow-up once the cache's `cachedSnapshot` ladder is exercised end-to-end.
- **Persist the owning project in `SessionHeader.meta.projectId`.** Rejected: bakes the App Builder domain into the session envelope and forces every other consumer to read it. The projection unit keeps the relation as a fold over an unchanged header — the seam stays open to a future `projectsPerSession` shape (a session owned by many projects, e.g. shared worktrees) without an envelope bump.
- **Hand-write the cache write path inside the unit's `init`.** Rejected: bypasses the projection registry's checkpoint ladder (count/interval throttle + three mandatory points) and would re-introduce the fire-and-forget write race the snapshot bridge just closed (1.5.3 §2). The cache plugin owns write discipline; the unit owns the fold.
- **Mark the cache as a required peerDep and crash on missing.** Rejected: the cache is a deployment choice (a test that boots the App Builder without persistence is a legitimate composition). The empty companion's reason text and the README's Known Limitations entry communicate the dependency without enforcing it.

## Consequences

- The App Builder bundle inherits cache coverage from `bundle/base`; no bundle patch change.
- `ProjectRegistry.listSessionIds` becomes a derived view in a follow-up (1.5.5 or later); the current implementation stays for backward compatibility.
- The `project` projection key is now part of every `ctx.sessionProjections.snapshot(...).values` read in the App Builder composition; downstream consumers (web list pane, API gateway) can read it without an extra lookup.
- The unit's `stateVersion: 1` is the persisted-cache gate; a future change to the fields bumps to `2` and old rows are discarded on read.
- Sub-phase 1.5.5 builds the Typert Remote service in `packages/app-builder/api/` and exposes `listProjects` / `getProject` that read through the projection snapshot.

## References

- [`planning/Phase 1.5 prompt.md` §1.4](../../../../planning/Phase%201.5%20prompt.md) — sub-phase task brief.
- [`planning/Phase 2 prompt.md` §4](../../../../planning/Phase%202%20prompt.md) — destination shape (the unit is the Phase 2 §4 deliverable, adopted in 1.5.4 to stay ahead of the API work in 1.5.5).
- [`planning/inspect/19-upstream-v0.1.2-alpha.1-adoption-plan.md` §6.1](../../../../planning/inspect/19-upstream-v0.1.2-alpha.1-adoption-plan.md) — upstream PR #2781 (`53c8f64eed`) adoption steps.
- [`packages/session/session-projection-cache/README.md`](../../../session/session-projection-cache/README.md) — cache contract (throttled write-behind, identity-bound rows, `ver`-mismatch discard).
- [`packages/session/session-projection/src/index.ts`](../../../session/session-projection/src/index.ts) — drive registry (`register`, `snapshot`, `restore`, `Object.is` change-feed gate).
- [`.agents/notes/proposed/architecture/2026-07-27-session-projection-and-command-log.md`](../../proposed/architecture/2026-07-27-session-projection-and-command-log.md) — session-projection RFC.
- [`.agents/notes/implemented/architecture/2026-08-19-session-projection-state-and-client-views.md`](../../implemented/architecture/2026-08-19-session-projection-state-and-client-views.md) — implemented view of the seam.
- [`.agents/notes/implemented/architecture/2026-08-06-subagent-list-identity-projection.md`](../../implemented/architecture/2026-08-06-subagent-list-identity-projection.md) — the closest precedent for adding a new projection unit.
- [`.agents/notes/implemented/process/2026-08-30-app-builder-shell-on-upstream-web.md`](2026-08-30-app-builder-shell-on-upstream-web.md) — the 1.5.3 stacked PR that ships the snapshot bridge and re-skins the App Builder on `apps/web/`.
