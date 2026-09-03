# Agent Note: Phase 1.5 sub-phase 1.5.2 — relocate App Builder example under apps/cli/config/examples

Status: implemented

English | [中文](2026-08-30-relocate-app-builder-example.2026-08-30.zh.md)

The full per-path relocation map and conflict-resolution plan live in [inspect step 19 §4](../../../../planning/inspect/19-upstream-v0.1.2-alpha.1-adoption-plan.md); the phase plan lives in [planning/Phase 1.5 prompt.md §1.2](../../../../planning/Phase%201.5%20prompt.md). This note records the shipped relocation plus the post-relocation follow-ups needed to satisfy the verify-cordis-config gate on the new path.

## Problem

The fork's App Builder example lived at `examples/app-builder/` since Phase 1. Upstream's PR #2977 (`refactor(repo): retire top-level examples`, commits `084a1ac5f6` → `4125514a08`) emptied the `examples/` workspace; the Phase 1.5 B2 merge took upstream wholesale and removed `examples/package.json`. The example directory itself survived (no upstream path mapped onto it), but two consequences land:

1. The umbrella `examples/package.json` that declared the example's deps is gone; the example's cordis.yml plugin references can no longer resolve through a workspace-declared dep set.
2. `scripts/verify-cordis-config.ts` glob `apps/cli/config/examples/**/*.yml`. Until the example moves into that tree, its plugin references are not validated; once it moves, every named plugin must resolve through `apps/cli/package.json` `dependencies` or a bundle manifest.

The Phase 1.5 plan (§1.2) committed to relocating `examples/app-builder/` → `apps/cli/config/examples/app-builder/` to match upstream's post-PR #2977 layout and unblock Phase 2's product surface.

## Decision

`git mv examples/app-builder apps/cli/config/examples/app-builder` on the `relocate/examples-app-builder` branch (stacked on `merge/upstream-v0.1.2-alpha.1`). All 11 files — README triplet, package.json, cordis.yml, the two spec files, and four fixtures — moved as-is. Cross-references updated in lockstep:

- Spec files `tests/{keyless,with-key}-smoke.spec.ts`: `../../../tsconfig.json` → `../../../../../../tsconfig.json` (the example is now 6 levels deep; the old 3-level jump landed in `apps/cli/config/` instead of the repo root, which made the vitest SSR cache parse a corrupt source map).
- Spec files' `tsconfigPath`: `../../../../../tsconfig.json` (corrected from `../../../../../` after a first miscount).
- README triplet paths: vitest invocation paths and the `verify-translation-pairing` command switched to the new prefix.
- 3 package test JSDoc refs in `packages/app-builder/{scaffold,preview,persona}/tests/loader-composition.spec.ts`: `examples/app-builder/tests/e2e/` → `apps/cli/config/examples/app-builder/tests/` (the e2e/ segment never existed — Phase 1 wrote tests directly under tests/ — so the JSDoc also drops the e2e segment).
- 5 planning artifacts: `planning/Phase 1 prompt.md §6` heading + last bullet, `planning/inspect/18-phase1-start-record.md` table row + prose, `planning/{plan,goal,mission}.md` cross-references.

### Follow-up: verify-cordis-config on the new path

After the move, `verify-cordis-config` rejected 5 of the example's plugin references because `apps/cli/package.json` had them in `devDependencies` (the verifier only accepts `dependencies` plus bundle manifests). Fixed by promoting the 11 example-referenced packages to `apps/cli/package.json` `dependencies`:

`@deepseek-ai/dsh-{agent-spine-demo,bash-local,credentials-local,fs-observation-policy,jobs-local,llm-deepseek,sandbox-policy,session-checkpoint-policy,session-persistence-jsonl,settings-file,subprocess-local}`

### Follow-up: tsconfig.base.json path mappings

The 4 fork-only app-builder plugins and 2 fork-only client packages have directory-name mismatches (`packages/app-builder/<role>/` vs name `@deepseek-ai/dsh-app-builder-<role>`); `verify-tsconfig-paths` rejects packages whose name cannot be derived from the directory. Fixed by adding hand-written entries to `tsconfig.base.json` next to the existing `@deepseek-ai/dsh-sdk-client` family and `@deepseek-ai/dsh-experimental-*` family. `pnpm run gen-tsconfig-paths` then wrote the file back with the same content; the `--check` gate passes.

### Follow-up: vitest include glob

The vitest include glob `apps/*/tests/**/*.spec.ts` does not match `apps/cli/config/examples/app-builder/tests/` (that path is two more segments deep than `apps/*/tests/`). Extended the include with `apps/cli/config/examples/**/tests/**/*.spec.{ts,tsx}` — only one example currently lives under that glob (the app-builder one), but the pattern is intentionally general for future overlays. This is a deliberate deviation from `apps/cli/tests/profiles/AGENTS.md`'s "product assets, not test fixtures" rule: the Phase 1 example carries its keyless + with-key smokes inline, and upstream's existing overlays at `apps/cli/config/examples/{cordis,github-review,mcp-memory,schedule}/` do not have inline tests because their compositions are smaller. Recorded here so a future refactor can choose to split tests into `apps/cli/tests/profiles/app-builder/` without surprise.

### Follow-up: `CallId` → `ToolCallId`

Upstream PR #2731 (`xtr/message-tool-call-id`) renamed `CallId` to `ToolCallId` in `@deepseek-ai/dsh-llm`. The keyless smoke fixture `tests/fixtures/keyless-mock-llm.ts` still imported `CallId` from before the B2 merge. Fixed by swapping the import and the 4 `CallId(...)` call sites. The other model-facing packages (scaffold, preview, persona) used the symbol via the LLM re-exports rather than directly; their tests pass without a rename.

### Follow-up: 1.5.1 Agent Note structure (carried in this commit)

The 1.5.1 Agent Note triplet was authored without `pnpm run doc-sync` running (the 1.5.1 baseline report explicitly noted `doc-sync: not run`). When this sub-phase ran `doc-sync` for the first time on the merged tree, 2 gates failed on the 1.5.1 note itself:

- `verify-md-wrap` — 2 bullet continuations in the en + zh notes (`The two 'withhold' dispositions…` and `Follow-up PRs will address each cluster…`) parsed as multi-line paragraphs because they sat at column 3 under sub-bullets. Fixed by separating each continuation onto its own top-level paragraph preceded by a blank line.
- `verify-agent-note-format` — the 1.5.1 note carried an ad-hoc `<!-- agent-note-format: alternatives-not-recorded (supersedes-merge-baseline note) -->` marker that did not match the spec's exact grandfather string and was past the `2026-07-05` cutoff date. Fixed by replacing it with a proper `## Alternatives considered` section covering the three genuine alternatives to the B2 merge (cherry-pick per blocking PR, rebase the 40 fork-only commits, adopt Phase 2 accelerators in the same merge) and recording the i18n pair hashes.

These 1.5.1 follow-ups are scoped to this commit because amending the 1.5.1 commit mid-stack would force-republish the 1.5.2 branch's merge base; the stacked-PR model accepts the 1.5.1 cleanup landing as the first commit of 1.5.2's diff. The 1.5.1 note triplet itself stays unchanged in its folder and class — only the file content was edited in place.

## Verified on this branch

- `pnpm exec vitest run apps/cli/config/examples/app-builder/tests/` — 1 passed (keyless smoke, 2.10 s wall-clock), 1 skipped (with-key, `describe.skipIf(!DEEPSEEK_API_KEY)`).
- `pnpm exec vitest run packages/app-builder/` — 47 passed across `project`, `scaffold`, `preview`, `persona` test files (5 files, 1 invariant spec + 47 unit + behavioral tests).
- `pnpm run typecheck` — exit 0.
- `pnpm run verify-cordis-config` — 155 config files passed.
- `pnpm run verify-tsconfig-paths` — current.
- `pnpm run verify-translation-pairing` — current (en + zh + i18n.yaml hashes re-recorded).
- `pnpm run verify-md-wrap` — 2180 files checked, no hard-wrapped prose paragraphs.
- `pnpm run verify-agent-note-format` — 644 Agent Notes checked, all conform.
- Lefthook pre-push — pass (typecheck + contracts-ready).

## Known pre-existing failures not addressed here

The 13 `doc-sync` gates and 8 `hygiene` gates that still fail on this branch are pre-existing Phase 1 / upstream regressions documented in the 1.5.1 Agent Note's "Verified on this branch" section (`packages/experimental/webworker-runtime/.../transform-corpus.spec.ts`, `packages/llm/llm-pi-ai/.../catalog.spec.ts` xai mixed catalog, `packages/subagent/subagent-claude-code/.../real-product.spec.ts`, generated-artifact script expectations, plus the broader Phase 1 README structure / Cordis config / JSDoc completeness debt). They land in dependent sub-phases: catalog generators in 1.5.7, webworker-runtime corpus in 1.5.3, real-product under its own credentials-bearing CI workflow, and the README structure debt under either 1.5.7 or a dedicated Phase 2 cleanup.

## Alternatives considered

### Why not split tests under `apps/cli/tests/profiles/app-builder/` (per `apps/cli/tests/profiles/AGENTS.md`)?

The AGENTS.md rule says `apps/cli/config/examples/` overlays are "product assets, not test fixtures" and that package-specific Loader fixtures belong in the package's `tests/fixtures/`. Phase 1 placed the keyless + with-key smokes inline at `examples/app-builder/tests/`; preserving that layout keeps the diff to this sub-phase focused on the directory move. The vitest include glob extension in `vitest.config.ts` records the deviation so a future refactor (1.5.3 or later) can split the tests out under `apps/cli/tests/profiles/app-builder/` without surprise. Splitting now would re-file `keyless-driver.ts`, `keyless-mock-llm.ts`, `keyless.cordis.yml`, and `preview-server.js` in addition to the two spec files, expanding the diff into a structural refactor outside this sub-phase's scope.

### Why not add the example to `pnpm-workspace.yaml` and declare its deps in its own package.json?

The verify-cordis-config gate only looks at `apps/cli/package.json` `dependencies` plus every `packages/bundle/*/package.json` `dependencies`. A workspace member at `apps/cli/config/examples/app-builder/` with its own `package.json` `dependencies` would not satisfy the gate. The example is shipped alongside the CLI (it composes from CLI-side plugin rows, not from a bundle patch), so promoting its deps to `apps/cli/package.json` `dependencies` is the smallest change that satisfies the verifier. The promotion keeps them in `devDependencies` too — apps-cli is built and published with both sections; the duplication is intentional.

### Why not use `packages/bundle/app-builder/` to own the example's deps?

The bundle is the canonical Phase 1 product surface (`dsh --profile app-builder`); the example is a Loader-driven smoke composition per `@deepseek-ai/dsh-loader-smoke`, separate from the profile path. The example deliberately avoids the bundle so it can mount the same plugin set without going through `dsh --profile` (per the inspect step 19 §3 conflict map resolution). Putting the example's deps in the bundle's `dependencies` would couple them through the bundle manifest even when the example is the only consumer. The `apps/cli/package.json` promotion keeps the bundle manifest focused on its own four plugin refs.

## Consequences

- The App Builder example lives at `apps/cli/config/examples/app-builder/`, matching upstream's post-PR #2977 layout and the Phase 1.5 plan.
- `apps/cli/package.json` carries 11 new entries in `dependencies` (the example's plugin references that previously resolved through the deleted `examples/package.json`); each remains in `devDependencies` for completeness.
- `tsconfig.base.json` carries 12 new hand-written path aliases for the 4 fork-only app-builder plugins and 2 fork-only client packages (`@deepseek-ai/dsh-app-builder-{project,scaffold,preview,persona}{,/invariant}` and `@deepseek-ai/dsh-client-ui-app-builder-{shell,projects}{/client}`); `pnpm run gen-tsconfig-paths` is current.
- `vitest.config.ts` `testIncludes` extends to `apps/cli/config/examples/**/tests/**/*.spec.{ts,tsx}` to discover the moved specs.
- The keyless smoke fixture imports `ToolCallId` from `@deepseek-ai/dsh-llm` (replacing the upstream-renamed `CallId`).
- The 1.5.1 Agent Note triplet is restructured in place (md-wrap + agent-note-format compliance, new `## Alternatives considered` section).
- Sub-phases 1.5.3-1.5.7 land on top of this branch (`relocate/examples-app-builder`) as a native GitHub stacked PR stack: 1.5.3 integrates `packages/client/ui-app-builder-{shell,projects}` into upstream's rebuilt `apps/web/`; 1.5.4 wires the projection cache; 1.5.5 scaffolds `packages/app-builder/api/`; 1.5.6 cherry-picks `feat/subagent-provider`; 1.5.7 updates `planning/{plan,goal,Phase 2 prompt}.md` + `docs/PROJECT.md` and addresses the test + doc-sync + hygiene pre-existing failures.
