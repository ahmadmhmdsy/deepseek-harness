# @deepseek-ai/dsh-app-builder-deployment

App Builder deployment pipeline: a Cordis plugin that owns the `Deployment` entity, runs the three deterministic gates (SAST / SCA / secrets) over a project's source tree, requests approval through `ctx.approval`, and performs the push step. Emits `deployment/started|succeeded|failed` events the Web UI's deployment status pane subscribes to. Backs the `deploy` Typert Remote method on `@deepseek-ai/dsh-app-builder-api`.

## Installation

This package is part of the `deepseek-harness` monorepo. No separate install step is required when the App Builder MVP bundle is mounted (`packages/bundle/app-builder/cordis.patch.yml` registers the plugin in the default composition).

## Cordis plugin

The plugin is registered as `app-builder-deployment` and exposes the `appBuilderDeployment` service on the Cordis context. The plugin name matches the bundle patch row id and the example composition's `app-builder-deployment` row.

```yaml
- id: app-builder-deployment
  name: '@deepseek-ai/dsh-app-builder-deployment'
```

## Service surface

`ctx.appBuilderDeployment` exposes the `DeploymentRegistry` Service Definition:

- `deploy(request) -> Promise<Deployment>` — run one deployment workflow end-to-end (gates + approval + push). The returned record carries the final status and the resolved URL on success.
- `get(id) -> Deployment | undefined` — look up one deployment by id.
- `list() -> readonly Deployment[]` — every durable deployment, in creation order.
- `has(id) -> boolean` — whether the registry has a record for the id.
- `toValue(id) -> DeployValue | undefined` — project the in-memory record into the public Typert Remote value shape (`projectId`, `deploymentId`, `url`).
- `latestForProject(projectId) -> Deployment | undefined` — most recent deployment for a project.

## Events

- `deployment/started` — emitted when a deploy begins (after the registry builds the initial pending record but before the gates run). Payload: `{ type, deployment }`.
- `deployment/succeeded` — emitted when the push step lands. Payload: `{ type, deployment }`; `deployment.status === 'succeeded'` and `deployment.url` is set.
- `deployment/failed` — emitted on terminal failure (gate failure, approval rejection, push error, unknown project). Payload: `{ type, deployment, reason }`; `deployment.reason` carries the same value as the event's `reason` for record durability.

## Deployment workflow

The workflow runs the three gates in canonical order and short-circuits on the first `error`-severity finding:

1. Build the initial pending record and emit `deployment/started`.
2. Run `runSastGate`, `runScaGate`, `runSecretsGate` in sequence; the record transitions through `gates-running` and lands with all three `GateResult`s.
3. If any gate emitted an `error`-severity finding, transition to `gates-failed` and emit `deployment/failed` with the gate name in the reason.
4. If the plugin config sets `requireApproval: true` AND `ctx.approval` is mounted, request approval before the push step; an outcome other than `allowed-once` short-circuits with `deployment/failed` carrying the outcome.
5. Perform the push step (Phase 2.1: a deterministic synthetic hook resolving `https://deploy.local/<projectId>/<deploymentId>`). Emit `deployment/succeeded` on success, `deployment/failed` with reason `'push step threw: ...'` on error.

The function never throws; every error path emits `deployment/failed` and returns a record with `status === 'failed'`. The BFF's `deployRemote` projects the final record into the public `DeployValue` shape and returns it to the gateway.

## Configuration

```ts
export interface Config {
  /**
   * Whether the deployment workflow must call `ctx.approval.request(...)`
   * after the gates pass. Defaults to `false` so a deployment bundle
   * without the user-approval plugin mounted still runs end-to-end.
   */
  requireApproval?: boolean
  /**
   * SCA deny-list override. Replaces the bundled deny-list; absent the
   * workflow falls back to the bundled `DEFAULT_SCA_DENY_LIST`.
   */
  denyList?: ReadonlySet<string>
  /**
   * Override the synthetic host the local push step resolves its URL
   * against. Defaults to `https://deploy.local`.
   */
  host?: string
}
```

## Gate runners

Each gate is a pure function `(projectRoot) -> GateResult` that scans the project's source tree without spawning subprocesses or making network calls. The patterns are intentionally conservative: every scanner reports what it sees verbatim, and the deploy short-circuits when any `error`-severity finding is emitted.

- **SAST** (`runSastGate`) — regex scan over JavaScript / TypeScript source files for `eval(`, `new Function(`, `child_process.exec*(<non-literal>)`, and `fs.unlink*Sync(<non-literal>)`.
- **SCA** (`runScaGate`) — `package.json` `dependencies` / `devDependencies` / `peerDependencies` / `optionalDependencies` lookup against a bundled deny-list. The list is overridable through the plugin's `denyList` config field.
- **Secrets** (`runSecretsGate`) — regex scan for AWS access-key ids (`AKIA[0-9A-Z]{16}`), GitHub personal access tokens (`ghp_[A-Za-z0-9]{36}`), and PEM private-key blocks.

The file walker descends `node_modules`, `.git`, `dist`, `.next`, `.svelte-kit`, `.turbo`, and `coverage` once each (no contribution to a deployable artifact), never follows symlinks, and skips binary files (NUL byte in the first 8 KiB) and oversize files (>1 MiB).

## Required peer services

- `ctx.appBuilderProjects` — required. The deploy workflow resolves the project's `rootPath` through the project registry; an unknown project id resolves to a typed `failed` record without throwing.
- `ctx.approval` — optional. Read through `ctx.get`; a missing service is a configured no-op. The `requireApproval` config field gates the call.

## Test surface

- `tests/deploy-host.spec.ts` — real Loader composition proof: clean project runs end-to-end, secrets-blocked project emits `deployment/failed`, unknown project id resolves to a typed `failed` record.
- `tests/unit/gates.spec.ts` — deterministic unit tests for each gate runner and each pattern that blocks the deploy.

## Model experience

- **Tokens**: this package does not own model-facing prompts or schema. The BFF's `deploy` Remote method is a plain function payload; model-facing surfaces are unchanged.
- **KV cache**: not affected (no model-facing text is mutated).
- **Model-visible behavior**: a model calling the deploy tool sees the deployment record's `status`, `gateResults`, and (on success) `url` echoed back through the tool result. The `gateResults` array is JSON-safe and includes the gate kind + passed flag + finding count for each scanner.

## Known Limitations and Deferred Work

- The push step is a deterministic synthetic hook resolving `https://deploy.local/<projectId>/<deploymentId>`. Phase 2.5 replaces this with the production push implementation (likely a Remote hook into `@deepseek-ai/dsh-webhook` or a configured git remote). The local URL is intentionally fixed-form so snapshot tests assert against an exact value.
- The registry is process-local. A Phase 2.4 follow-up replaces the in-memory map with a `dsh-storage-domain` backed implementation; the durable `deployment/started|succeeded|failed` events replay the same state across process restarts in the interim.
- The bundled SCA deny-list is small and opinionated (typosquatting targets). Production deployments extend the list through the plugin's `denyList` config field.
- The approval step is gated behind `requireApproval: true` AND `ctx.approval` mounted. Phase 2.1 ships with the default `false`; a production bundle wires the user-approval service and flips the flag.
- Per-file 100% coverage is not yet achieved. The test surface covers the real-composition test + the unit gate runners; the deploy workflow's branch coverage is partial (approval rejection, gate runner throws, push step throws are exercised through the deploy-host integration rather than per-branch unit tests). A follow-up adds `tests/unit/deploy.spec.ts` that asserts each branch deterministically.
- Snapshot scenarios `deploy-local` + `deploy-blocked-by-gates` are listed in `planning/Phase 2 prompt.md §7` but require the `dsh` CLI + a recorded-session JSONL that this package cannot produce in isolation. They are recorded in the 2.6 closure docs sub-phase; the deploy-host tests + the API Typert tests cover the in-process behaviour the snapshots would assert.
- English-only documentation. Per `docs/AGENTS.md` writing rules and the 1.5.7 English-only policy, this package ships with an English-only `README.md` (no `README.zh.md`, no `README.i18n.yaml` sidecar).
