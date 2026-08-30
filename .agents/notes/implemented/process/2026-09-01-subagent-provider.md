# Agent Note: Subagent provider live model routing (Phase 1.5 / 1.5.6)

Status: implemented

English | [中文](2026-09-01-subagent-provider.zh.md)

> Phase 1.5 / sub-phase 1.5.6 — adopt upstream PR #2663 (`feat/subagent-provider`, `f76a225a7d`) and re-apply fork-only `721c1d6fe1` (`fix(subagent): route spawned children through parent's live model selection`) on top. Stacked on `origin/adopt/api-gateway-cluster` (1.5.5 HEAD `8994998859`).

## Problem

The §1.6 plan in `planning/Phase 1.5 prompt.md` instructed a literal cherry-pick of PR #2663 followed by a re-apply of the fork fix `721c1d6fe1` on top of the 1.5.5 stack. Both commits were already ancestors of `origin/adopt/api-gateway-cluster` via the 1.5.1 `dsh-v0.1.2-alpha.1` merge chain: `f2e9585b` (the 1.5.1 merge commit) brought PR #2663 in, and `7c23f6d8` (the fork's own `fix/subagent-live-routing` PR #1) brought `721c1d6fe1` in. A literal cherry-pick of `f76a225a7d` at this point collides with ~100 files (i18n.yaml sidecars, README drifts from 1.5.1–1.5.5, snapshot JSONLs, the `examples/{acp,headless,python-sdk}-agent` → `apps/cli/tests/profiles/{acp,headless,sdk}` rename from 1.5.2), none of which the upstream refactor touches.

The substantive question is what part of the fork fix survived the 1.5.1 merge. Inspecting HEAD's `packages/subagent/subagent/src/child-agent.ts` shows upstream PR #2663 added a new `parentAgentOptionsForDelegation(parent: Agent): AgentOptions` function whose body reads `parent.session.requestHeader()?.config` as the live routing source and falls back to `{ ...parent.options }` (the frozen creation-time snapshot) when no header is logged. That is exactly the live `requestHeader()` fallback `721c1d6fe1` was adding — so the upstream refactor subsumes the fork fix's headline behavior. The fork fix additionally added a middle-tier `ctx.get('agentDefaultModel')?.currentSelection()` fallback between `requestHeader()` and `parent.options`, and that tier is NOT in upstream. The fork fix's `packages/subagent/subagent/tests/child-agent.spec.ts` (10 tests) is also not in HEAD's `tests/child-agent.spec.ts` (4 tests, all upstream variants); the tsconfig.json + package.json plumbing for the `dsh-agent-default-model` cross-package augmentation is in HEAD but the function body that consumes it is not.

Children dispatched before the parent's first logged request (a cold start, or a parent that switched providers through `/model` UI without yet dispatching a request through the new route) therefore inherit `parent.options` — the frozen creation-time snapshot — instead of the live default the master's `agentDefaultModel` service exposes. That is the gap the fork fix was originally patching.

## Decision

Port the missing delta onto HEAD's `parentAgentOptionsForDelegation` instead of re-cherry-picking the 227-file upstream PR. Three files in `packages/subagent/subagent/`:

- `src/child-agent.ts` — add a type-only augmentation import for `@deepseek-ai/dsh-agent-default-model` (mirroring the existing pattern used for `@deepseek-ai/dsh-sandbox-policy`, `@deepseek-ai/dsh-user-approval`, `@deepseek-ai/dsh-agent-presets`); rewrite `parentAgentOptionsForDelegation` to read three live sources in precedence order — `parent.session.requestHeader()?.config` (logged header), `parent.ctx.get('agentDefaultModel')?.currentSelection()` (live settings), `parent.options` (frozen fallback) — applied per field; reasoning effort is route-owned (when a live source supplies the route, that source's effort wins; when none does, the parent's creation-time effort is preserved; when a live source supplies a route but no effort, the parent's effort is cleared so the selected model resolves its own default). `maxTokens` is a budget, not a route, and is always inherited from `parent.options`. The per-tool `agentOptions` override is still applied downstream by `resolveChildAgentOptions` and wins over every inherited source.
- `package.json` — move `@deepseek-ai/dsh-agent-default-model` from `devDependencies` to `peerDependencies` (it is now runtime-consumed via `ctx.get`, not just type-augmented) and add the matching entry in `peerDependenciesMeta` with `optional: true` (a rosterless deployment without the `agentDefaultModel` service still works via the documented `ctx.get` pattern).
- `tests/child-agent.spec.ts` — add 6 new tests covering the middle-tier fallback: `agentDefaultModel` live selection before any request is logged; live-source-omitted-effort clearing of parent's creation-time effort; logged-request-header precedence over `agentDefaultModel`; creation-options fallback when neither live source is composed; `maxTokens` always inherited from `parent.options`; the per-tool `requested` override still wins. Update the existing `parentAgent()` helper to provide a stub `ctx.get` returning `undefined` so the existing 4 tests still exercise the legacy fallback path.

## Bundle / composition impact

- `packages/subagent/subagent/package.json` declares `dsh-agent-default-model` as an optional `peerDependency`. Compositions that mount `@deepseek-ai/dsh-agent-default-model` get the live middle-tier; compositions that do not keep the upstream-fallback behavior.
- `packages/subagent/subagent/tsconfig.json` already references `../../core/agent-default-model` (that reference was added by `721c1d6fe1` and survived the 1.5.1 merge; the port uses it as-is).
- No new rows in `packages/bundle/*/cordis.patch.yml` or `apps/cli/config/examples/*/cordis.yml`. The `@deepseek-ai/dsh-agent-default-model` service is already mounted in the shipped `code`, `cordis`, and `standard` agent presets (`packages/preset/agent-presets/presets/*/agent.cordis.yml`); product compositions using those presets gain the live fallback automatically.

## Supersession check

Searched `.agents/notes/{implemented,archived}` for `parentAgentOptionsForDelegation|resolveChildAgentOptions|agentDefaultModel.*currentSelection|subagent.*live.*model|model-selected.*subagent`. No active note covers the `parentAgentOptionsForDelegation` live waterfall specifically. Two precedents cross-linked below document adjacent behavior; this triplet does not supersede them.

- `.agents/notes/implemented/feature/2026-08-18-model-selected-subagent-routes.{md,zh.md}` — upstream's PR #2663 design doc. Describes the `modelSelectionSettings` flow that `dsh-tool-subagent` exposes for per-call model selection. The middle-tier live fallback added by this port is its routing-side counterpart: the tool's selection flow is the per-call escape hatch; the live waterfall here is the implicit routing for delegated children when the tool does not pick a route.
- `.agents/notes/implemented/feature/2026-08-24-user-authorized-subagent-model-routes.{md,zh.md}` — owns the authorization policy (`subagent-model-selection` settings section + `allowedModels` allowlist). Independent of this port.

## Alternatives considered

**Re-cherry-pick `f76a225a7d` and re-apply `721c1d6fe1` literally.** Rejected because `f76a225a7d` is already an ancestor of HEAD; a cherry-pick produces ~100 file conflicts from 1.5.1–1.5.5 refactors the upstream PR never touched (`examples/{acp,headless,python-sdk}-agent` → `apps/cli/tests/profiles/{acp,headless,sdk}` rename; i18n.yaml sidecar hash drift; snapshot JSONL model-output drift). Resolving ~100 conflicts by hand to reintroduce code that is already in HEAD (except for the middle-tier delta) is a multi-day effort with high mis-resolution risk.

**Treat 1.5.6 as a no-op verification sub-phase and document only.** Rejected because the fork fix's middle-tier behavior was the documented motivation for `721c1d6fe1`; a no-op PR leaves the cold-start routing gap open. The planning doc framed this as an adoption PR, not a documentation PR.

**Re-implement the middle-tier fallback as a wrapper that overrides `parentAgentOptionsForDelegation` in the call site (`resolveChildAgentOptions`).** Rejected because it duplicates routing logic across two functions and means every new caller must remember to wrap; the existing function is already the canonical "what does the child inherit from the parent" boundary.

**Move the live waterfall into a new exported `parentAgentLiveRouting` helper alongside `parentAgentOptionsForDelegation` and call both from `resolveChildAgentOptions`.** Rejected because it splits the routing decision across two functions whose contract would have to stay in lock-step (any new field added to `AgentOptions` would have to thread through both). The existing function is the single source of truth for inherited options.

## Consequences

- A child dispatched before the parent's first logged request, against a composition that mounts `@deepseek-ai/dsh-agent-default-model`, now follows the live default selection — the same model the master would have used for its next request, not the parent's frozen creation-time options. This closes the routing gap that `721c1d6fe1` was originally written to fix.
- A child dispatched against a composition without `@deepseek-ai/dsh-agent-default-model` (e.g. minimal headless bundles) keeps the upstream fallback to `{ ...parent.options }`. Backward-compatible: existing rosterless deployments are unchanged.
- The live selection is read at dispatch time, not at child-start time, so a parent's `/model` UI switch is visible to the next dispatched child but not to one already in flight. This matches the caveat in `721c1d6fe1`'s commit message and is unchanged by the port.
- The per-tool `agentOptions` override (set by `dsh-tool-subagent` when `SubagentCapabilities.agentOptions` is true) still wins over every inherited source, both via `resolveChildAgentOptions`'s spread and via its route-changed effort-clearing rule.
- `@deepseek-ai/dsh-agent-default-model` is now an optional `peerDependency` of `dsh-subagent`. Compositions that omit it lose no current functionality (the upstream fallback still works); compositions that mount it gain the middle-tier live fallback.
- The fork fix's original test file (`packages/subagent/subagent/tests/child-agent.spec.ts`, 10 tests) is replaced by an updated version (10 tests total: the 4 upstream tests + 6 new tests for the middle-tier behavior). All 293 `dsh-subagent` package tests pass (`pnpm exec vitest run packages/subagent/subagent/tests/`).

## Reference

- [`planning/Phase 1.5 prompt.md`](../../../planning/Phase%201.5%20prompt.md) — §1.6 adopt `feat/subagent-provider`
- [`planning/inspect/19-upstream-v0.1.2-alpha.1-adoption-plan.md`](../../../planning/inspect/19-upstream-v0.1.2-alpha.1-adoption-plan.md) — adoption-plan reference (does not detail `feat/subagent-provider`; this port fills the gap)
- [`packages/subagent/subagent/src/child-agent.ts`](../../../packages/subagent/subagent/src/child-agent.ts) — `parentAgentOptionsForDelegation` (the ported function) + `resolveChildAgentOptions` (downstream consumer)
- [`packages/subagent/subagent/tests/child-agent.spec.ts`](../../../packages/subagent/subagent/tests/child-agent.spec.ts) — 10 tests covering upstream + ported behavior
- [`packages/core/agent-default-model/src/index.ts`](../../../packages/core/agent-default-model/src/index.ts) — `AgentDefaultModelConfig.currentSelection()` (the middle-tier live source)
- Upstream: PR #2663 (`feat/subagent-provider`, `f76a225a7d`) — already an ancestor of HEAD via 1.5.1
- Fork: `721c1d6fe1` (`fix(subagent): route spawned children through parent's live model selection`) — already an ancestor of HEAD via 7c23f6d8
- `.agents/notes/implemented/feature/2026-08-18-model-selected-subagent-routes.{md,zh.md}` — upstream's PR #2663 design doc (adjacent territory; not superseded)
- `.agents/notes/implemented/feature/2026-08-24-user-authorized-subagent-model-routes.{md,zh.md}` — owns the `subagent-model-selection` authorization policy (independent)
- `.agents/notes/implemented/process/2026-08-30-merge-upstream-dsh-v0.1.2-alpha.1.{md,zh.md}` — the 1.5.1 merge that brought PR #2663 into the fork
- `.agents/notes/implemented/process/2026-08-31-api-gateway-cluster.{md,zh.md}` — 1.5.5; the immediate parent stack layer

## Known pre-existing failures (not caused by 1.5.6)

- `pnpm run verify-translation-pairing` reports 3 out-of-sync notes from the 1.5.1 baseline: `2026-06-24-workspace-context.md`, `2026-07-21-follow-instruction-symlinks.md`, `2026-07-21-instruction-load-all-dedup.md`. Their `i18n.yaml` records diverge from the prose; the drift predates this PR and lands in 1.5.7 per the 1.5.4 Agent Note.
- `pnpm run verify-package-readme-model-experience` and `pnpm run verify-package-invariants` each report 7 pre-existing failures (same packages: `app-builder/{persona,preview,scaffold,snapshot-bridge}`, `bundle/app-builder`, `client/ui-app-builder-{projects,shell}`). Every one predates 1.5.6. Land in 1.5.7.
- `pnpm run verify-export-jsdoc` reports 8 pre-existing failures across `app-builder/{preview,project}` and `client/ui-app-builder-{projects,shell}/locales`. Predates 1.5.6. Land in 1.5.7.
- `packages/app-builder/snapshot-bridge/tests/loader-composition-invariant.spec.ts` reports 2 pre-existing failures on the 1.5.5 baseline. Predates 1.5.6. Land in 1.5.7.
- `pnpm run test:coverage`, `pnpm run test:snapshot`, `pnpm run doc-sync`, `pnpm run hygiene` inherit their respective pre-existing failures from 1.5.1 — same posture as 1.5.3, 1.5.4, 1.5.5. CI-owned; land in 1.5.7.
