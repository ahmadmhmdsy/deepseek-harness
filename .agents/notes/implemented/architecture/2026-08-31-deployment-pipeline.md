# Agent Note: Phase 2.1 — Deployment pipeline (gates + approval + push)

Status: implemented

## Problem

Phase 1.5 leaves the App Builder BFF's `deploy` Remote method as a typed `not-implemented` placeholder; the `apps/cli/config/examples/app-builder/` composition scaffolds and previews projects but cannot ship them. Phase 2 ships a productised control plane, so the deploy path needs to (a) gate the project source tree through deterministic scanners, (b) require approval before pushing, and (c) emit durable events that the Web UI's deployment status pane can subscribe to. The deploy method is part of the public Typert Remote surface (`planning/Phase 2 prompt.md §3`) and the BFF delegates to `ctx.appBuilderDeployment`, so a missing owner surfaces as a typed `not-implemented` failure to every client that wires the method today.

## Decision

Ship the deployment pipeline as a new App Builder package: `packages/app-builder/deployment/` exports a Cordis Service Definition (`DeploymentRegistry`) that owns the in-memory `Deployment` record + emits `deployment/started|succeeded|failed` events, plus a `runDeployment` workflow that runs three deterministic gates in canonical order. The BFF's `deployRemote` now resolves `ctx.appBuilderDeployment` through `ctx.get` (soft dependency mirroring the snapshot-bridge pattern) and falls back to a typed `not-implemented` failure when the deployment plugin is unmounted. The plugin is registered in `packages/bundle/app-builder/cordis.patch.yml` and `apps/cli/config/examples/app-builder/cordis.yml` so the App Builder MVP composition ships with the full BFF surface.

The three gates are intentionally simple and deterministic:

- **SAST**: regex scan over `.js/.jsx/.mjs/.cjs/.ts/.tsx/.mts/.cts` source files for `eval(`, `new Function(`, `child_process.exec*(<non-literal>)`, and `fs.unlink*Sync(<non-literal>)`. Each match is `error`-severity and blocks the deploy.
- **SCA**: `package.json` `dependencies` / `devDependencies` / `peerDependencies` / `optionalDependencies` lookup against a bundled deny-list (configurable through the plugin's `denyList` config field). A matched package name is `error`-severity; missing or malformed `package.json` is `warn`-severity and the gate still passes.
- **Secrets**: regex scan for AWS access-key ids (`AKIA[0-9A-Z]{16}`), GitHub personal access tokens (`ghp_[A-Za-z0-9]{36}`), and PEM private-key blocks. Each match is `error`-severity and blocks the deploy.

The scanner walker descends `node_modules`, `.git`, `dist`, `.next`, `.svelte-kit`, `.turbo`, and `coverage` once each (no contribution to a deployable artifact), never follows symlinks, and skips files whose first 8 KiB contain a NUL byte (binary heuristic). Files larger than 1 MiB are skipped to bound scan cost.

The approval step reads `ctx.approval` through `ctx.get` so a missing service is a configured no-op. When the plugin's `requireApproval: true` config is set AND `ctx.approval` is mounted, the workflow requests approval before the push step; an outcome other than `allowed-once` short-circuits with `deployment/failed` carrying the outcome in the reason. Phase 2.1 ships with `requireApproval: false` by default — a follow-up that adopts the App Builder persona into a bundle with the user-approval service flips the default. This split lets a deployment bundle run end-to-end without the approval service and lets a production bundle require approval without changing the deploy workflow.

The push step is a deterministic in-process hook that resolves `https://deploy.local/<projectId>/<deploymentId>`. Phase 2.5 replaces this synthetic URL with a production push implementation (likely a Remote hook into `@deepseek-ai/dsh-webhook` or a configured git remote). The local URL is intentionally fixed-form so snapshot tests assert against an exact value.

## English-only documentation

Per `docs/AGENTS.md` writing rules and the 1.5.7 English-only policy, this implementation ships with an English-only `README.md` (no `README.zh.md`, no `README.i18n.yaml` sidecar). The existing `packages/app-builder/api/` package's `README.zh.md` and `README.i18n.yaml` sidecars are frozen (per the same policy); any future bilingual rollout would extend the package list through `scripts/translation-pairing.manifest.json` after the canonical English sources stabilise.

## Supersession check

No active Agent Note supersedes this one. The 1.5.7 Agent Note (`2026-09-01-phase-1.5-upstream-sync-record.md`) covers the upstream sync + planning artifacts and is not affected by Phase 2.1; the Phase 2 record (`2026-08-31-phase-2-productize-control-plane-record.md`) plans the sub-phase stack and treats this Agent Note as the 2.1 deliverable. No future Agent Note in the active notes tree supersedes the deployment pipeline.

## Alternatives considered

1. **External SAST/SCA/secrets scanners (Semgrep, npm-audit, trufflehog, gitleaks)**. The Phase 2 prompt says 'SAST (bash + a bundled scanner), SCA (dependency audit), secrets scan (greps + pattern matchers)' — the canonical MVP path is in-process regex matchers, which keep the deployment pipeline deterministic and dependency-free. The bundled patterns cover the documented high-severity cases (eval, child_process shell injection, AWS/GitHub/PEM hard-codes, typosquatting-target dependencies). Real deployments extend the deny-list through the plugin's `denyList` config field; a future Phase 3 follow-up can replace the bundled patterns with a Semgrep rule pack when the rule-pack distribution is owned by the product. The user-facing decision is deferred to Phase 3; Phase 2.1 ships the MVP that the prompt names.
2. **Approval as a hard dependency on `@deepseek-ai/dsh-user-approval`**. The user-approval service requires an `Agent` to scope the approval request (the answerers are agent-scoped). The deploy Remote method is called from the BFF, which has no Agent in scope — a hard dependency would force the BFF to construct an Agent or to fail-fast on the approval step. The chosen design reads `ctx.approval` through `ctx.get` and gates the call behind a config flag, so a deployment bundle without the approval service runs end-to-end and a bundle with the approval service still applies session policy. A future bundle configuration that wires the user-approval service AND sets `requireApproval: true` completes the seam without changing the deploy workflow.
3. **Persistent `Deployment` storage**. The Phase 1.5 pattern keeps per-package state process-local (the session log is the durable source of truth). The Phase 2 prompt defers storage-domain adoption to 2.4; the registry stores every completed workflow in memory keyed by deployment id, and the durable `deployment/started|succeeded|failed` events replay the same state across process restarts. A Phase 2.4 follow-up replaces the in-memory map with a `dsh-storage-domain` backed implementation. This split avoids a parallel durability path that would have to reconcile in-memory state with the event log.

## Consequences

- **Public Typert Remote surface gains a real `deploy` method**: clients that wire against `app-builder-api`'s `deploy` today (the snapshot UI's deployment pane in Phase 2.5) will see a deployment id + URL on the success path and a typed `not-implemented` failure when the deployment plugin is unmounted.
- **Process-local durability**: the registry holds the latest in-memory copy of every deployment; the session log carries the durable history. A restart re-folds the registry from the log; a Phase 2.4 follow-up replaces the in-memory map with `dsh-storage-domain`.
- **Bundled deny-list is small and opinionated**: it covers documented typosquatting targets (`flatmap-stream`, `event-stream`, `nodemailer-js`) and is overridable through the plugin's `denyList` config field. Production deployments extend the list; the MVP defaults are intentionally conservative.
- **Synthetic local push URL**: the push step resolves `https://deploy.local/<projectId>/<deploymentId>`. Snapshot tests assert against this exact value; a Phase 2.5 follow-up replaces the synthetic hook with the production push implementation.
- **Phase 2 sub-phase stack base**: this PR is the first code sub-phase atop `docs/phase2-record`. The stack base is `origin/docs/phase1.5-record` = `26bf01ba4a`; subsequent code sub-phases (2.2 ToolPolicy, 2.3 API completion, 2.4 Projection + UI, 2.5 Web UI + EventSource) base on this branch and the 2.6 closure docs rebase `docs/phase2-record` atop merged 2.5 head.
- **No 100% per-file coverage**: the test surface covers the real-composition test (deploy-host.spec.ts) and the unit gate runners (gates.spec.ts); the deploy workflow's branch coverage is partial (approval rejection, gate runner throws, push step throws are exercised through the deploy-host integration rather than per-branch unit tests). A follow-up can add a `tests/unit/deploy.spec.ts` that mounts the deployment registry in isolation and asserts each branch deterministically.
- **Snapshot scenarios deferred**: `deploy-local` (gates run, push happens, `deployment/succeeded` appended) and `deploy-blocked-by-gates` (SAST failure, no push, `deployment/failed` with reason) are listed in `planning/Phase 2 prompt.md §7` but require the `dsh` CLI + a recorded-session JSONL that this implementation cannot produce in isolation. The snapshot tests are recorded in the 2.6 closure docs sub-phase; the deploy-host tests + the API Typert tests cover the in-process behaviour the snapshots would assert.

## Reference

- `planning/Phase 2 prompt.md §1` (Deployment package specification)
- `planning/Phase 2 prompt.md §3` (API surface — the 13 Remote methods)
- `planning/Phase 2 prompt.md §11` (sub-phase stack)
- `docs/PROJECT.md §8` (Phase 2 acceptance criteria)
- `packages/app-builder/api/src/deferred.ts` (`deployRemote` wires through `ctx.appBuilderDeployment`)
- `packages/bundle/app-builder/cordis.patch.yml` (`app-builder-deployment` plugin row)
- `apps/cli/config/examples/app-builder/cordis.yml` (example composition)
- `packages/interaction/user-approval/src/index.ts` (the approval Service Definition consumed by the workflow)
- `.agents/notes/implemented/process/2026-08-31-phase-2-productize-control-plane-record.md` (Phase 2 plan record)
- `.agents/notes/implemented/process/2026-09-01-phase-1.5-upstream-sync-record.md` (Phase 1.5 record — predecessor)

## Known pre-existing failures

Carries the §9 backlog from the Phase 1.5 record:

- `verify-md-links`: pre-existing broken cross-directory references (no new failures introduced by this PR).
- `verify-doc-budgets`: `packages/AGENTS.md` exceeds the 675-line ceiling (pre-existing).
- `verify-translation-pairing`: EN/ZH sidecar drift on `packages/app-builder/api/README.md` + this PR's EN-only sources + others (pre-existing for the API README; the deployment package ships EN-only per the policy codified in `docs/AGENTS.md`).
