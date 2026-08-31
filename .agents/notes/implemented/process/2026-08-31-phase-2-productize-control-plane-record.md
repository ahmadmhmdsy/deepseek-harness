# Agent Note: Phase 2 — productize the control plane (record)

Status: implemented

## Problem

Phase 1.5 closed on `docs/phase1.5-record` (HEAD `26bf01ba4a`) with all seven sub-phase PRs merged via native GitHub stacked PRs. Phase 2 (`planning/Phase 2 prompt.md`) describes the work — §1 Deployment, §2 ToolPolicy, §3 API surface, §4 Projection unit, §5 Web UI, §6 Bundle, §7 Snapshot tests — without a native stacked-PR breakdown. Without a documented sub-phase plan, the 2–4 week Phase 2 effort would risk landing as one large unmergeable PR or losing the audit trail Phase 1.5 used.

## Decision

Break Phase 2 into six native GitHub stacked sub-phases plus one docs-only closure:

| Sub-phase | Branch | Commit class |
|---|---|---|
| 2.0 plan-only | `docs/phase2-record` | docs |
| 2.1 Deployment package | `feat/phase2-1-deployment` | code |
| 2.2 ToolPolicy manifest | `feat/phase2-2-tool-policy` | code |
| 2.3 API completion | `feat/phase2-3-api-completion` | code |
| 2.4 Projection unit + Web UI project list | `feat/phase2-4-projection-ui` | code |
| 2.5 Web UI deployment status + EventSource preview iframe | `feat/phase2-5-ui-eventsource` | code |
| 2.6 closure docs | `docs/phase2-record` | docs |

Stack base: `origin/docs/phase1.5-record` (`26bf01ba4a`). Each code sub-phase ships as a native GitHub stacked PR. The 2.6 closure docs commit lands on `docs/phase2-record` after the 2.1–2.5 code PRs merge.

The 2.0 plan-only commit (this commit) updates `planning/plan.md` §5, `planning/goal.md` §Phase 2, `planning/Phase 2 prompt.md` §0/§11, `planning/inspect/INDEX.md` (entries 29–34), `planning/inspect/SUMMARY.md`, and `docs/PROJECT.md` §8 to add the sub-phase breakdown.

The first code sub-phase (2.1) is the Deployment package: a new `packages/app-builder/deployment/` Cordis plugin that owns the `Deployment` entity, registers a `deploy` tool, runs SAST/SCA/secrets gates before any push, asks for approval via `@deepseek-ai/dsh-approval`, emits `deployment/{started,succeeded,failed}` events, and replaces the existing `deploy` Typert Remote placeholder in `packages/app-builder/api/`. The 2.2 ToolPolicy manifest is a Cordis plugin that wraps `ctx.tools.preExecute` to consult a typed `ToolPolicy.for(toolName)` and falls back to `ctx.permissionPresets.current(events)`. The 2.3 API completion wires the `getUsage` Typert Remote to `@deepseek-ai/dsh-token-meter` cache-aware metrics. The 2.4 projection + project list verifies the 1.5.4 projection unit and adds the `apps/web` project list pane. The 2.5 deployment status pane + EventSource preview iframe updates `apps/web` and `packages/bundle/app-builder/cordis.patch.yml` to mount the new packages.

## English-only documentation

This branch follows the English-only documentation policy codified in `docs/AGENTS.md` (writing rules section, replaced in 1.5.7). No `*.zh.md` files are created; no `*.i18n.yaml` sidecars are re-recorded. The new Agent Note ships in English only. The new file is added to `scripts/translation-pairing.manifest.json` `excluded` so the `verify-translation-pairing` gate does not flag it as a missing-pair regression.

## Supersession check

The 1.5.7 record (`28-phase-1.5-upstream-sync-record.md`) is the previous active record; it stays current until Phase 2 closure (2.6 commit). No prior note covers Phase 2 sub-phasing. No partial supersession.

## Alternatives considered

### Why not a single-PR Phase 2?

A single PR carrying 2–4 weeks of new packages, snapshot scenarios, web UI changes, and bundle updates would violate the project's "Choose PR history deliberately" rule and would be unmergeable. A stacked-PR sequence keeps each sub-phase reviewable and shippable.

### Why not skip the plan-only commit?

Starting code without a documented sub-phase breakdown loses the audit trail Phase 1.5 used. Reviewers of Phase 2 PRs would not see the full picture; future maintainers would have to reconstruct the plan from the diff. The 2.0 docs-only commit preserves the planning record.

### Why not re-number sub-phases 2.1–2.7?

Seven sub-phases mirrors Phase 1.5.1–1.5.7, but Phase 2 has six substantive sub-phases; inflating the count adds no value and breaks the symmetry between Phase 1.5's seven sub-phases and Phase 2's six.

## Consequences

`docs/phase2-record` carries 2.0 + 2.6 (planning artifacts only). Code sub-phases land on `feat/phase2-N-*` branches. The 2.0 commit updates `planning/plan.md` §5 (add sub-phase breakdown), `planning/goal.md` §Phase 2 (add sub-goals), `planning/Phase 2 prompt.md` §0 (note Phase 1.5 already adopted §3 + §4) and §11 (sub-phase stack), `planning/inspect/INDEX.md` (entries 29–34), `planning/inspect/SUMMARY.md` (add 2.0/2.1 entries), and `docs/PROJECT.md` §8 (replace Phase 2 bullet list with sub-phase breakdown; fix the obsolete `Bilingual docs (zh.md + i18n.yaml)` invariant to match the English-only policy).

A new `scripts/translation-pairing.manifest.json` entry adds `.agents/notes/implemented/process/2026-08-31-phase-2-productize-control-plane-record.md` to `excluded`. The 1.5.7 Agent Note's §9 backlog (verify-export-jsdoc, verify-md-links, verify-package-paths, verify-doc-budgets for `packages/AGENTS.md`, doc-standard.spec.ts, verify-translation-pairing for 3 pre-existing out-of-sync agent notes + 3 structural divergences from regenerated EN docs, verify-package-readme-model-experience) remains open; Phase 2 sub-phases will not close it. Snapshot re-records in 2.5 will regenerate `docs/capability-seams.md` and `docs/event-producer-consumer.md` and may add entries to the frozen `.zh.md` counterparts under the English-only policy.

## Reference

- `planning/Phase 2 prompt.md` — Phase 2 task brief (§0 resolved decisions, §1 Deployment, §2 ToolPolicy, §3 API surface, §4 Projection unit, §5 Web UI, §6 Bundle, §7 Snapshot tests, §8 Agent Notes, §9 Per-package obligations, §10 docs/PROJECT.md updates, §11 Sub-phase stack).
- `planning/inspect/19-upstream-v0.1.2-alpha.1-adoption-plan.md` — Phase 1.5 detailed plan (informs §3 API + §4 Projection decisions).
- `.agents/notes/implemented/process/2026-09-01-phase-1.5-upstream-sync-record.md` — Phase 1.5 record (predecessor).
- `docs/AGENTS.md` — English-only documentation policy + write-the-rule reference.

## Known pre-existing failures

The §9 backlog gates documented in the 1.5.7 Agent Note carry forward unchanged: `verify-export-jsdoc` (10 violations), `verify-package-readme-model-experience` (7 violations), `verify-md-links` (4 broken cross-links in pre-existing agent notes), `verify-package-paths` (6 broken `packages/*` references), `verify-doc-budgets` (`packages/AGENTS.md` 706 > 675 ceiling), `doc-standard.spec.ts` (2 failures). Phase 2 sub-phases neither close nor regress these.

## Sidecar-drift acknowledgement

This commit introduces one new entry to the `verify-translation-pairing` failure list: `docs/PROJECT.md` drifted from its `docs/PROJECT.i18n.yaml` sidecar hash because the 2.0 commit updated §8 Phase 2 + line 256. Under the English-only documentation policy codified in 1.5.7 (see `docs/AGENTS.md` writing rules), sidecar re-recording is dormant and the frozen `docs/PROJECT.i18n.yaml` stays unchanged. The gate's "out of sync" report is the expected post-edit signal under that policy; closing it would require re-recording the sidecar, which the policy forbids.
