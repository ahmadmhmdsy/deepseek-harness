# Agent Note: Phase 2.3 — API completion (getUsage → @deepseek-ai/dsh-token-meter)

Status: implemented

## Problem

Phase 2 prompt §3 lists 13 Typert Remote methods on `@deepseek-ai/dsh-app-builder-api`. Eleven of them shipped in Phase 1.5 (project CRUD, session lifecycle, SSE event subscription, preview). The remaining two — `deploy` and `getUsage` — were stubbed with a typed `not-implemented` failure so a missing owner never silently succeeded. Phase 2.1 wired `deploy` through `@deepseek-ai/dsh-app-builder-deployment`; `getUsage` was the last deferred method, and Phase 2 prompt §3 calls out that it must surface "cache-aware token / cost". The `@deepseek-ai/dsh-token-meter` Service (Phase 1.5) already exists in tree at `packages/llm/token-meter/` and owns the replay-aware token fold: a per-Session state fold over the durable tail, a current-pressure surface from the fold, a matched-header provider-usage anchor, and a signed surface delta. The plan is to make the BFF consume that service directly so `getUsage` reads `ctx.tokenMeter.measure(session)` and projects the resulting `TokenMeasurement` into the public `GetUsageValue` shape (`tokensIn` + `tokensOut` + `costUsd` + `cacheHitRate`).

## Decision

Replace the `getUsage` placeholder in `@deepseek-ai/dsh-app-builder-api` with a real implementation that reads `ctx.tokenMeter.measure(session)` and projects the measurement. The change is scoped to the App Builder BFF and ships inside the existing `@deepseek-ai/dsh-app-builder-api` package — no new package is introduced because `getUsage` is one wire method of one Typert Remote service and the BFF already declares its required injections.

The BFF adds `tokenMeter` to its `static inject` array. The deployment plugin remains a soft dependency because `deploy` answers the typed `not-implemented` failure when the plugin is unmounted; `tokenMeter` is a required injection because the BFF now owns the consumer side of the meter contract and a missing meter is a misconfiguration, not a deployment-shape choice.

The implementation lives in a new sibling module `packages/app-builder/api/src/usage.ts` so the file naming reflects the wire method:

- `getUsageRemote(ctx, request)` validates the request (`sessionId` and/or `projectId`; rejects `{}` with `bad-request`).
- For `projectId`-only requests the method returns a typed `not-implemented` failure because per-project aggregation requires enumerating the project's Sessions, which is the Phase 2.4 projection unit's job.
- For `sessionId` requests the method resolves the live Session via `ctx.sessions.get(sessionId)`, throws a typed `not-found` when the Session is unattached, and otherwise calls `ctx.tokenMeter.measure(session)` and projects the measurement.
- The projection maps `TokenMeasurement` → `GetUsageValue`:
  - `tokensIn = measurement.totalTokens` (current request pressure: baseline + signed surface delta; already includes cache reads / writes when the baseline carries provider-reported usage).
  - `tokensOut = baseline.kind === 'usage' ? baseline.usage.outputTokens : 0` (provider-reported output count, only available when the baseline carries `usage`).
  - `costUsd = 0` (no per-route price table in tree; Phase 2.3 ships the wire shape and the project reservation, the price table lands in Phase 2.5).
  - `cacheHitRate = baseline.kind === 'usage' && baseline.tokens > 0 ? baseline.usage.cacheReadTokens / baseline.tokens : 0` (input-side cache-hit rate, clamped so a cold Session never reports `NaN`).
- `notImplemented()` and `deployRemote()` move out of the placeholder module into `deferred.ts` (no `getUsageRemote` placeholder anymore); the App Builder BFF keeps the `not-implemented` helper for any future soft-dependency method.

The `token-meter` package is already declared in `apps/cli/config/examples/app-builder/cordis.yml` as part of the dsh-base composition; no cordis.yml change is required to surface `ctx.tokenMeter`. The bundle patch `packages/bundle/app-builder/cordis.patch.yml` does not gain a row because `token-meter` is upstream of the App Builder bundle and is mounted by dsh-base.

## English-only documentation

Per `docs/AGENTS.md` writing rules and the 1.5.7 English-only policy, the existing `packages/app-builder/api/README.md` is bilingual (`README.zh.md` + `README.i18n.yaml`). This PR updates the canonical English `README.md` only; the Chinese sidecar and the i18n manifest are not re-recorded. The `scripts/translation-pairing.manifest.json` already lists the bilingual `api/README.md` correctly and does not need a new entry. No `*.zh.md` files are added by this PR.

## Supersession check

No active Agent Note supersedes this one. The 1.5.7 Agent Note (`2026-09-01-phase-1.5-upstream-sync-record.md`) covers the upstream sync and planning artifacts. The Phase 2.1 Agent Note (`2026-08-31-deployment-pipeline.md`) wires `deploy` through the deployment package and is the immediate predecessor for the wire-method shape. The Phase 2.2 Agent Note (`2026-09-02-tool-policy-manifest.md`) ships the ToolPolicy manifest and is unaffected by this PR. The Phase 2 record (`2026-08-31-phase-2-productize-control-plane-record.md`) plans the sub-phase stack and treats this Agent Note as the 2.3 deliverable.

## Alternatives considered

1. **Read the token meter through the session controller (`ctx.sessionController.inspect` → cold page) instead of the live SessionStore**. The token-meter requires the live Session so its per-Session fold can replay the durable tail and observe new events as they append; the session controller's `inspect` returns a frozen `{ meta, events }` snapshot without the fold state. The chosen design reads the live Session through `ctx.sessions.get(sessionId)` (declared on the Context by `@deepseek-ai/dsh-session`); an unattached Session returns the typed `not-found` failure and a future iteration can use the session controller's cold-replay for offline accounting. The `getTranscript` method already covers the cold-page path; the BFF does not need to duplicate it.
2. **Aggregate per-session measurements into a project total inside the BFF (loop over `ctx.sessions` and sum)**. Enumerating every live Session of a project requires either the App Builder project's Session set or a generic Session-by-cwd filter; neither is exposed by `ctx.sessions` today, and inventing a private index in the BFF would diverge from the canonical Session store. The chosen design returns a typed `not-implemented` failure for the `projectId`-only path and reserves the aggregation for the Phase 2.4 projection unit, which is the proper owner.
3. **Surface `costUsd` from `LlmImageRequestPricing` declared by the routed model**. The LLM package exposes `LlmImageRequestPricing` for visual-token occurrences only; no per-route USD price table is in tree, and inventing one in Phase 2.3 would diverge from the Phase 2.5 plan that reserves the DeepSeek price table. The chosen design reports `costUsd: 0` with a documented Phase 2.5 follow-up; the wire shape stays stable so the price table is projected into the same field without a client migration.
4. **Wrap the token meter in a BFF-owned helper that also emits a session event**. The token meter already owns its fold and is the authoritative measurement reader; adding a BFF-side duplicate would create a second source of truth and a state-divergence risk. The chosen design keeps the BFF a thin projection (`TokenMeasurement` → `GetUsageValue`) and lets the meter own the measurement contract.

## Consequences

- **`getUsage` becomes a real Typert Remote method**. A live Session query returns the current `TokenMeasurement` projected into `GetUsageValue`. The cache-aware inputs (`tokensIn` already includes cache reads / writes when the baseline carries provider-reported usage) and the input-side cache-hit rate (`cacheHitRate`) reach the App Builder UI without an extra hop. The `costUsd` field is wired through to the wire shape with a documented `0` placeholder.
- **`tokenMeter` is a required injection**. Compositions that omit `@deepseek-ai/dsh-token-meter` fail at App Builder BFF construction rather than at the first `getUsage` call, which surfaces the misconfiguration early. The dsh-base profile mounts the meter upstream so every App Builder composition inherits it; the example `apps/cli/config/examples/app-builder/cordis.yml` already declares the row.
- **ProjectId-only path returns a typed `not-implemented` failure**. The BFF stays a thin projection and reserves project-level aggregation for the Phase 2.4 projection unit; a future Agent Note replaces this paragraph with the projection-backed implementation.
- **`costUsd` ships as `0`**. The wire shape is stable; the Phase 2.5 DeepSeek price table projects into the same field without changing the client contract. The README's Known Limitations and Deferred Work section records this follow-up.
- **Cold-Session queries return `not-found`**. The token meter requires a live Session so its fold can replay the durable tail and observe new events. A cold Session (one that has been persisted but is not currently attached) returns `not-found`; offline accounting belongs to `getTranscript` + the projection cache, both of which are upstream of `getUsage`.
- **BFF static-inject gains `tokenMeter`**. The `AppBuilderApi` class still injects `appBuilderProjects` + `sessionController`; the new `tokenMeter` row is the third required peer. The bundle patch and the example cordis.yml are unchanged because `token-meter` is upstream of the App Builder bundle.
- **Test surface covers the positive + rejection paths**. The api-methods.host.spec.ts test rig mounts the real `token-meter` plugin through cordis.yml; the four new tests assert the bad-request rejection (empty request), the not-implemented rejection (projectId-only), the not-found rejection (unattached Session), and the positive measurement (live Session with a `user/message` + `request/header` + `step/start` + `assistant/message` + `step/end` log). The single pre-existing `getTranscript` failure (in §9 backlog) is unchanged.
- **Phase 2 sub-phase stack base**. This PR is the third code sub-phase atop `docs/phase2-record`, based on `feat/phase2-2-tool-policy` (2.2 head `c7951c4349`). The stack base is `origin/docs/phase1.5-record` = `26bf01ba4a`; subsequent code sub-phases (2.4 Projection + UI, 2.5 Web UI + EventSource) base on this branch, and the 2.6 closure docs rebase `docs/phase2-record` atop merged 2.5 head.

## Reference

- `planning/Phase 2 prompt.md` §3 (API surface)
- `planning/Phase 2 prompt.md` §11 (sub-phase stack)
- `docs/PROJECT.md` §6 (canonical schema references)
- `packages/app-builder/api/src/usage.ts` (new `getUsageRemote` implementation)
- `packages/app-builder/api/src/deferred.ts` (preserved `deployRemote` + `notImplemented`)
- `packages/app-builder/api/src/index.ts` (BFF with `tokenMeter` injected)
- `packages/llm/token-meter/src/index.ts` (the replay-aware `TokenMeter` service)
- `packages/llm/token-meter/src/types.ts` (the `TokenMeasurement` + `TokenMeasurementBaseline` vocabulary)
- `packages/core/session/src/index.ts` (`ctx.sessions.get(sessionId)` declaration)
- `apps/cli/config/examples/app-builder/cordis.yml` (example composition with `token-meter`)
- `.agents/notes/implemented/process/2026-08-31-phase-2-productize-control-plane-record.md` (Phase 2 plan record)
- `.agents/notes/implemented/architecture/2026-08-31-deployment-pipeline.md` (Phase 2.1 record — immediate predecessor for the wire-method shape)
- `.agents/notes/implemented/architecture/2026-09-02-tool-policy-manifest.md` (Phase 2.2 record — immediate predecessor for the soft-dep pattern)
- `.agents/notes/implemented/process/2026-09-01-phase-1.5-upstream-sync-record.md` (Phase 1.5 record — grandparent)

## Known pre-existing failures

Carries the §9 backlog from the Phase 1.5 record + the Phase 2.2 record (no new failures introduced by this PR):

- `verify-md-links`: pre-existing broken cross-directory references.
- `verify-doc-budgets`: `packages/AGENTS.md` exceeds the 675-line ceiling (pre-existing).
- `verify-translation-pairing`: EN/ZH sidecar drift on `docs/PROJECT.md`, `docs/capability-seams.md`, `docs/config-catalog.md`, `docs/event-producer-consumer.md`, `docs/subsystems/README.md`, `packages/app-builder/README.md`, `packages/app-builder/api/README.md` (this PR updates the canonical English side without re-recording the i18n manifest, adding the api README to the pre-existing out-of-sync cluster), and 3 agent notes (pre-existing). The api README is bilingual and the Chinese sidecar is intentionally not maintained; the §9 backlog pattern holds.
- `verify-package-readme-model-experience`: 7 pre-existing failures on `deployment`, `persona`, `preview`, `scaffold`, `snapshot-bridge`, `bundle/app-builder`, and 2 client packages (the api package README is not in that list; this PR does not touch Model Experience sections).
- `verify-export-jsdoc`: the preview package's public exports are missing `@param` JSDoc on a couple of accessor methods (pre-existing; not in this PR's scope).
- `verify-package-invariants`: persona/preview/snapshot-bridge/bundle/app-builder peer-depend on `dsh-invariants` without an invariant companion (pre-existing; the api package ships its companion).
- 1 pre-existing test failure: `getTranscript returns a cold page through ctx.sessionController.page` in `packages/app-builder/api/tests/api-methods.host.spec.ts` (verified pre-existing in 2.2; `git stash` round-trip not needed because the test path does not touch any 2.3 code).
