# @deepseek-ai/dsh-app-builder-tool-policy

App Builder ToolPolicy manifest: a Cordis plugin that owns the typed `ToolPolicy` schema, mounts a `tools/pre-execute` listener that converts the declared policy into a `PreToolDecision`, and appends one log-only `toolPolicy/decision` event per evaluation. Tools without a registered policy fall back to `ctx.permissionPresets.current(events)`. Intent + audit, NOT authority — real authority comes from sandbox-mode fences and capability seams.

## Installation

This package is part of the `deepseek-harness` monorepo. No separate install step is required when the App Builder MVP bundle is mounted (`packages/bundle/app-builder/cordis.patch.yml` registers the plugin in the default composition).

## Cordis plugin

The plugin is registered as `app-builder-tool-policy` and exposes the `toolPolicy` service on the Cordis context. The plugin name matches the bundle patch row id and the example composition's `app-builder-tool-policy` row.

```yaml
- id: app-builder-tool-policy
  name: '@deepseek-ai/dsh-app-builder-tool-policy'
```

## Service surface

`ctx.toolPolicy` exposes the `ToolPolicyRegistry` Service Definition:

- `register(policy) -> () => void` — add one `ToolPolicy` to the registry. Returns a disposer that removes the registration; a duplicate `id` overwrites the previous registration so a reload can replace a manifest.
- `for(toolName) -> ToolPolicy | undefined` — look up the policy registered against a tool name. Returns the most recent registration when multiple policies name the same tool.
- `get(id) -> ToolPolicy | undefined` — look up a policy by its stable id.
- `list() -> readonly ToolPolicy[]` — every registered policy in registration order, as a frozen snapshot.
- `actionOf(toolName) -> ToolAction | undefined` — classify a tool name into a `ToolAction` using the bundled `DEFAULT_TOOL_KINDS` map plus the resolved `toolKinds` config override.
- `evaluate(exec, next) -> Promise<PreToolDecision>` — evaluate one `tools/pre-execute` call: looks up the policy by tool name, falls back to the permission-presets current preset on a miss, appends one `toolPolicy/decision` audit event to the owning session, and returns the `PreToolDecision` the upstream pipeline should observe.

## Events

`toolPolicy/decision` — emitted on every `tools/pre-execute` evaluation the listener processes. Payload: `{ toolName, policyId, kind, action, fallbackPreset, reason? }`. The event is log-only; the model never reads it, but the session log carries the durable audit trail.

- `kind` is the closed decision vocabulary: `allow` / `deny` / `ask` / `fallback`.
- `policyId` is the matched policy id, or `null` on the fallback path.
- `action` is the classified `ToolAction` the policy matched against (null on fallback).
- `fallbackPreset` is the permission preset current at evaluation time (every path; lets a UI distinguish `workspace-write` from `danger-full-access` decisions without consulting the session log twice).
- `reason` is the human-readable explanation a `deny` or `ask` decision exposes to the upstream tools pipeline.

## ToolPolicy schema

The typed manifest the registry stores. Every field is `readonly`; a registration replaces a previous record under the same `id`.

```ts
interface ToolPolicy {
  readonly id: string
  readonly tool: string                      // tool name as registered in ctx.tools
  readonly allow: readonly ToolAction[]      // actions the tool may freely perform
  readonly ask: readonly ToolAction[]        // actions that require approval
  readonly scope?: {
    readonly paths?: readonly string[]       // restricted paths for fs tools
    readonly commands?: readonly string[]    // allowed command prefix list
    readonly hosts?: readonly string[]       // allowed host:port for network tools
    readonly credentials?: readonly string[] // declared credential references
  }
}

type ToolAction = 'read' | 'write' | 'execute' | 'network' | 'credential'
```

## Decision logic

The listener runs on every `tools/pre-execute` call and applies the rules below in order. The matched policy (or the fallback preset) determines the decision; the audit event records the outcome for replay.

1. **No policy matches the tool name.** The listener appends a `toolPolicy/decision` with `kind: 'fallback'`, `policyId: null`, `fallbackPreset: <current preset>`, then delegates to `next()`. Real authority still comes from the sandbox-mode fence + the capability seam.
2. **Policy matches, action classified, action in `allow`.** The listener returns `{ kind: 'allow' }` and emits `kind: 'allow'` with the classified action.
3. **Policy matches, action classified, action in `ask`.** The listener returns `{ kind: 'ask', reason: ... }`; the upstream tools pipeline routes the call through `ctx.approval.request(...)` when an approval seam is mounted, or degrades to denial when none is mounted.
4. **Policy matches, action classified, action in neither list.** The listener returns `{ kind: 'deny', reason: ... }` and emits `kind: 'deny'`.
5. **Policy matches, tool unclassified.** If `allow` includes `'execute'`, the listener returns `{ kind: 'allow' }` (the catch-all default for tools the composition has not classified). Otherwise the listener denies with `reason: '... requires explicit execute allow or a toolKinds classification'` so a composition can fix the misclassification.

Validation at registration time: empty `id` / `tool`, unknown actions, overlap between `allow` and `ask`, and empty scope arrays all fail loud.

## Configuration

```ts
export interface Config {
  /**
   * Tool-name → action classification override. Merged over the
   * bundled DEFAULT_TOOL_KINDS map; absent entries inherit the default.
   * A composition uses this to register the action of tools the bundled
   * map does not know about.
   */
  toolKinds?: Record<string, ToolAction>
}
```

The bundled `DEFAULT_TOOL_KINDS` map classifies the built-in tools:

- `read` → `read`
- `write`, `edit`, `str_replace_editor` → `write`
- `bash`, `run_code`, `job_create`, `job_output`, `job_kill` → `execute`
- `web_search`, `web_fetch` → `network`
- `credentials_get` → `credential`

A composition extends the map through the `toolKinds` plugin config field; absent entries inherit the bundled classification.

## Required peer services

- `ctx.tools` — required. The listener registers on `tools/pre-execute`, so the upstream tools pipeline must be mounted.
- `ctx.permissionPresets` — optional. Read through `ctx.get`; a missing service falls back to `custom` for the audit `fallbackPreset` field.
- `ctx.sessions` (invariant companion only) — required for the invariant companion that validates appended `toolPolicy/decision` events reference a known policy id and a closed `ToolAction`. The base plugin tolerates a missing sessions service.

## Test surface

- `tests/listener.spec.ts` — real Loader composition proof: package shape, plugin name, unmapped tool falls back to `next()`, an `allow` policy permits a registered tool, a `deny` policy aborts with the policy reason, an `ask` policy degrades to denial when no approval seam is mounted.
- `tests/unit/registry.spec.ts` — deterministic unit tests on the registry: `register` / `for` / `get` / `list`, validation failures (empty id / unknown action / overlap), `evaluate` decision matrix (allow / ask / deny / fallback), tool-kind classification + override.

## Model Experience

### ToolPolicy decision listener

#### What the model sees

The model sees the `PreToolDecision` the listener returns, materialised by the upstream tools pipeline as either a successful tool result or an `isError` result. A `deny` decision lands as `Error: tool <name> policy <id> does not permit <action>`; an `ask` decision lands as `Error: the user rejected tool <name>` (or `tool "<name>" requires approval (not yet supported)` when the approval seam is unmounted). The audit `toolPolicy/decision` event is log-only and never enters the model context.

#### Token effect

No additional tokens. The listener does not own prompts or schema; the upstream pipeline materialises the decision in the same `tool/result` envelope the model already sees.

#### KV Cache effect

No effect. The listener does not mutate any model-facing text; the audit event lives in the session log, not in the prompt.

## Known Limitations and Deferred Work

- Intent + audit, not authority. The decision the listener returns is one input to the upstream tools pipeline; sandbox-mode fences + capability seams (bash / fs / web) own real authority. The audit event is the durable record a UAC / replay review reads.
- The bundled `DEFAULT_TOOL_KINDS` map covers the built-in tools the App Builder MVP mounts. Compositions that register custom tools must extend the map through the `toolKinds` plugin config field; an unclassified tool falls back to the catch-all `execute` rule only when the policy explicitly lists `execute` in `allow`, otherwise the listener denies with a reason that names the missing classification.
- The `ask` decision is gated on `ctx.approval` being mounted; absent the approval seam, an `ask` decision degrades to denial through the upstream pipeline's fail-closed behavior (same as a plain `deny`). Wiring the user-approval service into the bundle flips the effective behavior to a one-shot grant.
- Per-file 100% coverage is not yet achieved. The test surface covers the real-composition listener spec + the unit registry spec; the assertion paths on session-bound `append` are exercised through the listener spec, not per-branch unit tests.
- Snapshot scenarios `tool-policy-allow` + `tool-policy-deny` are listed in `planning/Phase 2 prompt.md §7` but require the `dsh` CLI + a recorded-session JSONL this package cannot produce in isolation. They are recorded in the 2.6 closure docs sub-phase; the listener spec + the unit spec cover the in-process behavior the snapshots would assert.
- English-only documentation. Per `docs/AGENTS.md` writing rules and the 1.5.7 English-only policy, this package ships with an English-only `README.md` (no `README.zh.md`, no `README.i18n.yaml` sidecar).
