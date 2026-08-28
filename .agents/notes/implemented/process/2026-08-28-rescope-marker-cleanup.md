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

Update the `vendoring-cookbook-name-invariant-zh` REPLACE to use `../rescope.zh.md` per the bilingual link convention. The marker now classifies as `applied` against the current prose, so `--check` is green and future regressions to the Chinese cookbook invariant trip the marker.

## Verification

```sh
pnpm run rescope-vendor:check   # exit 0; 'no residue, every exact edit landed, idempotent'
pnpm run rescope-vendor          # dry run; no outstanding changes over 4668 tracked files
pnpm run hygiene                 # vendor rescope sub-gate passes; remaining 12 sub-gates independent
```

The change is source-only: `scripts/rescope-vendor.ts` loses the `knip-logger-console` marker and gains one `.zh` in the `vendoring-cookbook-name-invariant-zh` REPLACE. No package `lib/` artifacts, no vendored package manifests, and no Chinese prose outside the marker file move.

## Consequences

- `pnpm run rescope-vendor:check` and `pnpm run hygiene` exit 0 again without depending on the upstream cleanup commit being reapplied or the bilingual link convention reverting.
- The cookbook invariant on `docs/cookbook/adding-a-vendored-package.zh.md` is now `applied`. A future hand edit that drops the scoped-name prose or un-localizes the link trips the marker; an edit that keeps the prose but changes a different phrase still passes.
- The marker list shrinks by one. The remaining 27 EXACT_EDIT markers cover every site the token rule cannot express; the list is stable until upstream changes one of those sites.

## Alternatives considered

**Reapply the upstream cleanup commit `a42102fb27`.** Rejected because the cleanup is already on master; the discrepancy is between the marker and the current file, not between branches.

**Loosen the `exactEditState` classifier to permit partial or moved matches.** Rejected because `invalid` is the loud signal that stops a stale marker from being silently half-applied. The classifier's strictness is the safety net; relaxing it removes the only way the run catches a diverged file.

**Translate the Chinese cookbook REPLACE through the bilingual brief skill.** Rejected because the change is one link-suffix swap; the heavy workflow is reserved for explicit user invocation per `docs/i18n/README.md`.
