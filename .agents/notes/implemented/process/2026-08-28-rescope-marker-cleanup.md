# Agent Note: Rescope EXACT_EDIT marker cleanup

Status: implemented

English | [中文](2026-08-28-rescope-marker-cleanup.zh.md)

## Problem

`scripts/rescope-vendor.ts` had two EXACT_EDIT markers in `invalid` state, which made `pnpm run rescope-vendor:check` and every `pnpm run hygiene` pass fail with:

```
rescope-vendor: exact edit knip-logger-console: knip.json is neither pending nor cleanly applied (duplicated, partial, or moved)
rescope-vendor: exact edit vendoring-cookbook-name-invariant-zh: docs/cookbook/adding-a-vendored-package.zh.md is neither pending nor cleanly applied (duplicated, partial, or moved)
rescope-vendor: 2 problem(s); nothing was written.
```

A marker is `invalid` when the file is neither `pending` (FIND present, REPLACE absent) nor `applied` (REPLACE present, FIND absent); the script refuses to rewrite anything on this branch so it cannot accidentally half-apply a stale marker.

**`knip-logger-console`** referenced the now-removed `packages/util/home` workspace block. The intent — drop the redundant `@cordisjs/plugin-logger-console` `ignoreDependencies` entry — was already met by `a42102fb27 chore(knip): drop stale and glob-duplicate workspace entries`, which removed the entire `packages/util/home` block. The marker's FIND anchors a block that no longer exists, so neither FIND nor REPLACE can match.

**`vendoring-cookbook-name-invariant-zh`** carried a REPLACE that pointed at `../rescope.md`. The bilingual link convention recorded in [`2026-08-18-localized-bilingual-links`](2026-08-18-localized-bilingual-links.md) requires Chinese sources to use `.zh.md` targets for in-corpus document links. The Chinese cookbook was updated by hand with the locale-correct target, leaving the marker with a FIND that does not match the new prose and a REPLACE that would revert the bilingual convention.

## Decision

Drop the `knip-logger-console` marker. The intent is achieved by the upstream cleanup commit and cannot regress because no surviving knip.json block lists `@cordisjs/plugin-logger-console`. If a future vendoring reintroduces the upstream name in a new workspace, the token-rewrite pass still rewrites it; the EXACT_EDIT list records only the sites the token rule cannot express.

Drop the `vendoring-cookbook-name-invariant-zh` marker (it was originally recorded as a REPLACE rewrite to `.zh.md`, but the file already carries the corrected link; the marker now classifies as `invalid` against the current prose, and re-applying it would revert the bilingual convention). With the marker dropped, the cookbook invariant on `docs/cookbook/adding-a-vendored-package.zh.md` is enforced by prose review instead of a marker tripwire.

## Realization history

Path B's `82ab97ad80 build(vendor): drop stale rescope markers` filed this Agent Note alongside a path B report claim that hygiene ran 13/13 green. The report was wrong about what shipped: that commit only added this Agent Note, the `.zh.md` counterpart, and the `.i18n.yaml` sidecar — it did not modify `scripts/rescope-vendor.ts`. The two markers therefore remained in `invalid` state and `pnpm run hygiene` continued to fail the `rescope-vendor:check` sub-gate.

The actual marker drop landed in `519da740a2 test(windows): clear residual contention flakes and stale rescope markers` (the path B follow-up described in [`2026-08-29-windows-test-flake-fixes`](2026-08-29-windows-test-flake-fixes.md)). The verifier output below reflects that follow-up commit, not path B's `82ab97ad80`.

## Verification

```sh
pnpm run rescope-vendor:check   # exit 0; 'no residue, every exact edit landed, idempotent'
pnpm run rescope-vendor          # dry run; no outstanding changes over 4699 tracked files
pnpm run hygiene                 # 13/13 PASS in 97.81s (with NODE_OPTIONS=--max-old-space-size=8192)
```

The change is source-only: `scripts/rescope-vendor.ts` loses both markers. No package `lib/` artifacts, no vendored package manifests, and no Chinese prose move.

## Consequences

- `pnpm run rescope-vendor:check` and `pnpm run hygiene` exit 0 again without depending on the upstream cleanup commit being reapplied or the bilingual link convention reverting.
- The cookbook invariant on `docs/cookbook/adding-a-vendored-package.zh.md` is no longer protected by a marker tripwire; a future hand edit that drops the scoped-name prose or un-localizes the link is now caught by prose review only. The marker list shrinks by two (the remaining markers cover every site the token rule cannot express; the list is stable until upstream changes one of those sites).

## Alternatives considered

**Reapply the upstream cleanup commit `a42102fb27`.** Rejected because the cleanup is already on master; the discrepancy is between the marker and the current file, not between branches.

**Loosen the `exactEditState` classifier to permit partial or moved matches.** Rejected because `invalid` is the loud signal that stops a stale marker from being silently half-applied. The classifier's strictness is the safety net; relaxing it removes the only way the run catches a diverged file.

**Keep the `vendoring-cookbook-name-invariant-zh` marker and update its REPLACE to `.zh.md` instead of dropping it.** Rejected because the Chinese cookbook already carries the locale-correct link; a marker that classifies as `pending` would instruct a future `--apply` run to rewrite matching prose with the new REPLACE — which matches the current prose exactly, so the operation is a no-op, but a hand edit that drifts toward `../rescope.md` would be silently re-corrected by the marker without a real semantic guarantee that the surrounding prose is intact. Dropping the marker trades a brittle tripwire for explicit prose review; the cookbook's invariant is reviewable in context.
