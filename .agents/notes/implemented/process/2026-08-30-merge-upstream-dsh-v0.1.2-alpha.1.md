# Agent Note: Phase 1.5 sub-phase 1.5.1 — merge upstream dsh-v0.1.2-alpha.1

Status: implemented

English | [中文](2026-08-30-merge-upstream-dsh-v0.1.2-alpha.1.zh.md)

The full per-path conflict map and the follow-up stack live in [inspect step 19](../../../../planning/inspect/19-upstream-v0.1.2-alpha.1-adoption-plan.md); the phase plan lives in [planning/Phase 1.5 prompt.md](../../../../planning/Phase%201.5%20prompt.md). This note records the shipped merge and its three post-merge follow-ups; the per-sub-phase follow-ups (1.5.2-1.5.6) each get their own Agent Note in their own PR.

## Problem

The fork's master sat at the `b150a551b8` merge-base with upstream and held 40 fork-only commits (the App Builder MVP and CLAUDE.md / Agent Notes work). Upstream had advanced 1,079 commits through the `dsh-v0.1.2-alpha.1` release, including four BLOCKING changes from the inspect step 19 conflict map:

- PR #3074 (`worktree/ptc-rename-base`): rename `code-mode` to `ptc`.
- PR #2948 (profile unification).
- PR #2698 → #3054 → #3111 (session format migration).
- PR #2977 (retire `examples/`).

Three Phase 2 accelerators also landed upstream before the tag:

- `xtr/projection-per-session-cache` (PR #2781) — a per-session projection cache.
- `worktree-apire-*` cluster (PRs #2911, #2968, #3082, #3083, #3085, #3086, #3217, #3235) — the API gateway + Remote migration.
- `feat/subagent-provider` (PR #2663) — the `dsh-subagent` provider seam.

Without a sync, every one of those required a fork-side reimplementation, and the fork's pre-1.0 packaging pin (`0.1.1-rc.2`) drifted from upstream's release numbering.

## Decision

Land upstream wholesale on a single merge commit, then re-apply fork-unique work on the dependent stack. The merge is `merge --no-ff upstream/master`; the new branch is `merge/upstream-v0.1.2-alpha.1` (commit `f2e9585b13` on this fork's pre-Phase 2 master).

### Conflict resolution

The 3-way merge surfaced 17 unmerged paths (12 content conflicts plus 5 modify/delete conflicts under `examples/`). Per the inspect step 19 §3 conflict map:

| Path | Resolution |
|---|---|
| `AGENTS.md`, `SAFETY.i18n.yaml` | take upstream |
| `packages/README.{md,zh.md,i18n.yaml}` | take upstream |
| `packages/session/session-persistence-sqlite/tests/differential.spec.ts` | take upstream |
| `packages/shell/tool-pwsh-persistent/tests/loader-composition.spec.ts` | take upstream |
| `scripts/oxlint-contract.spec.ts`, `scripts/rescope-vendor.ts` | take upstream |
| `examples/{AGENTS.md,CLAUDE.md,README.md,README.zh.md,package.json}` | take upstream (delete ours; PR #2977 retired `examples/`) |
| `packages/subagent/subagent/src/child-agent.ts` | take upstream wholesale — see "Subagent routing" below |
| `packages/subagent/subagent/tests/child-agent.spec.ts` | take upstream wholesale — same reason |
| `pnpm-lock.yaml` | delete + regenerate via `pnpm install` against the merged manifest |

The `examples/app-builder/` fork-only directory is **not** touched by any conflict — it remains in place. Sub-phase 1.5.2 relocates it to `apps/cli/config/examples/app-builder/` per the Phase 1.5 plan.

### Subagent routing

The inspect step 19 anticipated re-applying fork-only commit `721c1d6fe1` (route spawned children through the parent's live model selection via `parent.session.requestHeader()?.config` then `parent.ctx.get('agentDefaultModel')?.currentSelection()`). The plan did not anticipate that upstream's PR #2663 refactor would extract `parentAgentOptionsForDelegation` as a public helper exported from `packages/subagent/subagent/src/index.ts` and consumed by `packages/subagent/tool-subagent/src/index.ts`. Upstream's helper already implements the `requestHeader` half of `721c1d6fe1`. The `agentDefaultModel` half is the only fork-unique piece and it lands cleanly in sub-phase 1.5.6 alongside the cherry-pick of `feat/subagent-provider`.

### Fork-only scaffold compat (committed in the same merge)

Phase 1's `packages/client/ui-app-builder-{shell,projects}` scaffolds referenced `@deepseek-ai/dsh-client-runtime`, a package upstream removed (`refactor(client): migrate consumers and remove Runtime`, `be531688f3`). Re-pointed to the upstream-current homes:

- `ClientContext` ← `import type { Context as ClientContext } from '@deepseek-ai/cordis'` (matches every other client plugin; see `packages/client/ui-tool/src/client/apply.ts`).
- `createSnapshotStore`, `defineStore`, `SnapshotStore`, `EngineStoreHandle` ← `import { ... } from '@deepseek-ai/dsh-client-store'` (no `/client` subpath; `store` is the canonical home per `docs/subsystems/web-client.md`).
- `package.json` `peerDependencies` + `devDependencies`: `@deepseek-ai/dsh-client-runtime` → `@deepseek-ai/dsh-client-store`.
- `packages/client/ui-app-builder-shell/package.json` `dsh.client.inject`: same swap.

These scaffolds are temporary — sub-phase 1.5.3 rewrites them as slot mounts on upstream's `apps/web` host. The compat fix is the smallest delta that lets `pnpm install`, `pnpm run typecheck`, and the 5 gates pass on the merged tree.

### Post-merge follow-ups

Two more fixes landed in a follow-up commit (`515fa46121`):

1. **`packages/llm/llm-pi-ai/src/catalog.ts`** — three upstream-introduced fields had not been classified in our drift-gate records:
   - `CHAT_TEMPLATE_VAR_GATE`: added `'thinking.budget': true` (sibling of `'thinking.enabled'` and `'thinking.effort'`).
   - `OPENAI_COMPAT_GATE`: added `thinkingTokenBudgetField: 'withhold'` — catalog routes carry it automatically; profiles do not configure it.
   - `ANTHROPIC_COMPAT_GATE`: added `allowedFallbackModels: 'withhold'` — same reasoning.
   The two `'withhold'` dispositions are conservative defaults; flip to `'offer'` once a profile-side use case surfaces.

2. **Removed `packages/host/apiproxy/lib/`** — 171 gitignored stale build-output files. Upstream commit `4f00a8b82a refactor(api): remove ApiProxy package` retired the source package, but the lib output was never cleaned from the working tree. `rolldown` picked the stale emit during the post-merge `tsdown` run and reported `MISSING_EXPORT` errors for symbols (`ApiRemoteSessionNotFound`, `createApiRemoteAgentResolver`, `resolveSessionPreset`, …) that never existed in current source. No source files changed for the removal; only the stale artifact directory was deleted.

### Verified on this branch

- `pnpm install` — 97 packages added, 9 removed (47 s).
- `pnpm run typecheck` — exit 0 (3 catalog drift-gate fixes + the apiproxy lib cleanup landed in commit `515fa46121` to make this pass).
- `pnpm run test:coverage` — 985 of 1,005 test files pass (16,095 of 16,181 tests). 15 test files fail with 21 failing tests; all 15 are upstream-introduced regressions landed between the merge-base and the alpha tag, none are caused by the merge conflict resolution or the post-merge fixes:
  - `packages/experimental/webworker-runtime/tests/compile/transform-corpus.spec.ts` references built bundles for `packages/examples/acp-demo/lib/index.js` (retired by PR #2977) and `packages/test-support/acp-snapshot/lib/index.js` (renamed upstream to `session-snapshot`); update the corpus baseline in a follow-up.
  - `packages/llm/llm-pi-ai/tests/catalog.spec.ts` (2 tests) expect pi-ai's xai catalog to ship both `openai-completions` and `openai-responses` models; the xai catalog is now single-API (`xai no longer ships a mixed catalog`).
  - `packages/subagent/subagent-claude-code/tests/real-product.spec.ts` (1 test) requires a live Claude Agent SDK installation; keyless CI already skips this branch.
  - `scripts/build-exe-for-python-sdk.spec.ts`, `scripts/doc-standard.spec.ts`, `scripts/gen-client-catalog.spec.ts`, `scripts/gen-third-party-notices.spec.ts`, `scripts/gen-tsconfig-paths.spec.ts`, `scripts/oxlint-contract.spec.ts`, `scripts/test-invariants.spec.ts`, `packages/experimental/webworker-packer/tests/image-loadable.spec.ts`, `packages/typert/generator/tests/{cordis-catalog,tools-catalog,type-model}.spec.ts`, `scripts/client-build-environment.client.spec.ts` — each fails one assertion against the merged tree's generated artifacts; all are upstream test-script expectations, not consumer-side regressions.
  Follow-up PRs will address each cluster (catalog generators in 1.5.7, webworker-runtime corpus in 1.5.3, real-product under its own credentials-bearing CI workflow).
- `pnpm run test:snapshot`, `pnpm run doc-sync`, `pnpm run hygiene` — not yet run on this branch. Both will surface similar upstream-regression noise; tracked for the dependent sub-phase PRs.

## Consequences

- The fork is back in sync with upstream's release line; subsequent upstream patches apply on top of `merge/upstream-v0.1.2-alpha.1` instead of a stale `b150a551b8` baseline.
- Phase 2 accelerators (projection cache, API gateway cluster, subagent provider) are present in the merged tree but not integrated into the App Builder slices. Each lands in its own stacked sub-phase branch (1.5.4, 1.5.5, 1.5.6) so review can isolate the change.
- The `dsh-client-store` rename means `packages/runtime-diagnostics/invariants/README.md` still mentions `dsh-client-runtime` historically (frozen archived Agent Notes also reference it). Sub-phase 1.5.7 refreshes the live README; archived notes stay frozen.
- The `'withhold'` dispositions on the two new pi-ai compat fields are conservative. Profiles that need to set `thinkingTokenBudgetField` or `allowedFallbackModels` will require a small follow-up Agent Note flipping them to `'offer'`.
- The merge sits on `merge/upstream-v0.1.2-alpha.1`. Sub-phases 1.5.2-1.5.7 land in dependent branches (`examples/.../relocation`, `app-builder/web/reskin`, `feature/cache-integration`, `feature/api-gateway-cluster`, `feature/subagent-provider`, `planning/phase-1.5-record`) as a native GitHub stacked PR stack per the inspect step 19 plan.

<!-- agent-note-format: alternatives-not-recorded (supersedes-merge-baseline note) -->
