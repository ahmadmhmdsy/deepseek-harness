# Agent Note: Phase 2.2 — ToolPolicy manifest (typed per-tool policy + tools/pre-execute listener + audit event)

Status: implemented

## Problem

Phase 1.5 leaves the tool-call authority story split across `tools/pre-execute` (extensible waterfall), `tools/guard` (monotonic owner policy), `ctx.permissionPresets` (named sandbox + approval bundles), `ctx.sandboxPolicy` (per-session mode), `ctx.approval` (one-shot human approval), and per-tool backends (bash / fs / web). The plan calls the ToolPolicy manifest the most important scale-readiness item and the Phase 2 prompt requires it (Phase 2 prompt §2 + docs/PROJECT.md §6): a typed `ToolPolicy { id, tool, allow, ask, scope? }` manifest a developer declares against a tool, a `tools/pre-execute` listener that converts the typed policy into a `PreToolDecision`, an audit `toolPolicy/decision` event, and a fallback to `ctx.permissionPresets.current(events)` for tools with no declared policy. The plan also stresses this is intent + audit, NOT authority — real authority continues to live in sandbox-mode fences and capability seams. Without the typed manifest, the App Builder cannot declare per-tool scope (paths / commands / hosts / credentials) at all and the model sees no declarative surface for the policy story.

## Decision

Ship the ToolPolicy manifest as a new App Builder package: `packages/app-builder/tool-policy/` exports a Cordis Service Definition (`ToolPolicyRegistry`) that owns the typed manifest + a `tools/pre-execute` listener. The registry stores one `ToolPolicy` per id (duplicate ids overwrite so a reload can replace a manifest), one policy per tool (latest registration wins), and a frozen `toolKinds` map that classifies the built-in tools (`read` / `write` / `edit` / `str_replace_editor` / `bash` / `run_code` / `job_*` / `web_search` / `web_fetch` / `credentials_get`). A composition extends the map through the plugin's `toolKinds` config field; unclassified tools hit the catch-all `execute` rule only when the policy explicitly lists `execute` in `allow`, otherwise the listener denies with a reason that names the missing classification.

The listener runs on every `tools/pre-execute` call and applies five ordered rules:

- **No policy matches** → audit `kind: 'fallback'`, `policyId: null`, `fallbackPreset: <current preset>`, delegate to `next()`. The upstream tools pipeline observes whatever the next listener returns (typically `{ kind: 'allow' }` when the preset is `danger-full-access`, or whatever the sandbox fence / capability seam enforces).
- **Policy matches, action classified, action in `allow`** → return `{ kind: 'allow' }`, audit `kind: 'allow'`.
- **Policy matches, action classified, action in `ask`** → return `{ kind: 'ask', reason: ... }`. The upstream pipeline routes through `ctx.approval.request(...)` when mounted, or degrades to denial when not mounted (the standard pipeline fail-closed behavior).
- **Policy matches, action classified, action in neither list** → return `{ kind: 'deny', reason: ... }`, audit `kind: 'deny'`.
- **Policy matches, tool unclassified** → if `allow` includes `'execute'`, return `{ kind: 'allow' }` (catch-all default); otherwise deny with `reason: '... requires explicit execute allow or a toolKinds classification'`.

Validation at registration time fails loud on empty `id` / `tool`, unknown actions, overlap between `allow` and `ask`, and empty scope arrays. The audit event payload is `{ toolName, policyId, kind, action, fallbackPreset, reason? }`; `fallbackPreset` is recorded on every path so a UI can distinguish a `workspace-write` decision from a `danger-full-access` decision without consulting the session log twice. The package ships an empty companion invariant that validates appended `toolPolicy/decision` events reference a known policy id, carry an action drawn from the closed `ToolAction` vocabulary, and keep `policyId === null` iff `kind === 'fallback'`.

## English-only documentation

Per `docs/AGENTS.md` writing rules and the 1.5.7 English-only policy, this implementation ships with an English-only `README.md` (no `README.zh.md`, no `README.i18n.yaml` sidecar). The existing `packages/app-builder/api/` and `packages/app-builder/deployment/` English-only `README.md` files are frozen (no `*.zh.md` or `*.i18n.yaml` re-recording); the new package follows the same convention. Any future bilingual rollout would extend the package list through `scripts/translation-pairing.manifest.json` after the canonical English sources stabilise.

## Supersession check

No active Agent Note supersedes this one. The 1.5.7 Agent Note (`2026-09-01-phase-1.5-upstream-sync-record.md`) covers the upstream sync + planning artifacts and is not affected by Phase 2.2. The Phase 2.1 Agent Note (`2026-08-31-deployment-pipeline.md`) ships the deployment pipeline package and is not affected. The Phase 2 record (`2026-08-31-phase-2-productize-control-plane-record.md`) plans the sub-phase stack and treats this Agent Note as the 2.2 deliverable. No future Agent Note in the active notes tree supersedes the ToolPolicy manifest.

## Alternatives considered

1. **Extend `ctx.permissionPresets` with a per-tool action set rather than ship a separate manifest**. The preset table bundles sandbox mode + approval policy; adding a per-tool action list would couple two unrelated policy axes (mode/approval vs. tool/action) into one table and would force every composition that wants only the preset story to declare an empty action list. The chosen design keeps the preset story focused (mode + approval bundles for end-user knobs) and ships the typed ToolPolicy as an additive surface that consults the preset's `current(events)` value for the fallback audit field. A future iteration could fold the action list into the preset's `PresetSpec` once the action vocabulary stabilises; for Phase 2.2 the additive shape is the safer starting point.
2. **Hard-declare the tool action in the ToolPolicy (`tool.kind: ToolAction` field) rather than classify via a separate `toolKinds` map**. The plan's `interface ToolPolicy` schema (docs/PROJECT.md §6) is fixed and does not include a `kind` field; adding it would diverge from the canonical schema. The chosen design separates the manifest from the classification so a composition can register tools independently of the policies declared against them. The bundled `DEFAULT_TOOL_KINDS` map covers the built-in tools (`read` / `write` / `edit` / `bash` / `run_code` / `job_*` / `web_search` / `web_fetch` / `credentials_get`); a composition extends the map through the `toolKinds` plugin config field. An unclassified tool with a declared policy hits the catch-all `execute` rule only when the policy explicitly lists `execute` in `allow`, otherwise the listener denies with a reason that names the missing classification — a fail-loud behavior that prevents a policy from silently granting unintended permission.
3. **Skip the audit event and let the session log carry only the upstream `tool/result` outcome**. The plan requires a `toolPolicy/decision` event (docs/PROJECT.md §6 + planning/Phase 2 prompt.md §2). The chosen design appends one event per evaluation so a UAC / replay review can see the typed manifest's decision independently of the upstream pipeline outcome (a `deny` from the listener and a `deny` from the sandbox both land as `tool/result` errors, but only the listener's decision records the policy id + classified action). The event is log-only (model never reads it).
4. **Mount the listener inside `ctx.tools.guard()` (the monotonic owner policy) rather than on the `tools/pre-execute` waterfall**. `tools.guard()` is monotonic (first deny wins, no force-allow), which is the wrong shape for a configurable policy manifest that may declare `ask` for some tools and `allow` for others. The chosen design mounts on the `tools/pre-execute` waterfall so the listener can return `allow` / `deny` / `ask` per the typed manifest, exactly matching the upstream `PreToolDecision` vocabulary.

## Consequences

- **Typed per-tool manifest is now first-class**: a developer declares `register({ id, tool, allow, ask, scope? })` against any tool name and the listener converts the typed policy into a `PreToolDecision` at runtime. The manifest is the durable declarative surface a UI can render and a replay review can read.
- **Log-only audit trail**: every evaluation appends exactly one `toolPolicy/decision` event carrying `toolName` + `policyId` + `kind` + `action` + `fallbackPreset` + `reason?`. The event is log-only; the model never reads it. The invariant companion validates the closed vocabulary on append + on replay.
- **Fallback to permission presets**: tools without a declared policy still flow through the listener (the listener appends a `fallback` audit event then delegates to `next()`). The `fallbackPreset` field records the current permission preset at evaluation time so a UI can distinguish a `workspace-write` decision from a `danger-full-access` decision. Real authority continues to live in sandbox-mode fences + capability seams.
- **`ask` degrades to denial without an approval seam**: the upstream tools pipeline fail-closes when `ctx.approval` is not mounted. Wiring the user-approval service into the bundle flips the effective behavior to a one-shot grant. The plugin does not add an approval dependency.
- **Bundled tool-kind classification covers the built-in tools**: `read` / `write` / `edit` / `str_replace_editor` / `bash` / `run_code` / `job_create` / `job_output` / `job_kill` / `web_search` / `web_fetch` / `credentials_get`. A composition that registers custom tools must extend the map through the `toolKinds` plugin config field; an unclassified tool falls back to the catch-all `execute` rule only when the policy explicitly lists `execute` in `allow`.
- **Phase 2 sub-phase stack base**: this PR is the second code sub-phase atop `docs/phase2-record`, based on `feat/phase2-1-deployment` (2.1 head `6c610224fe`). The stack base is `origin/docs/phase1.5-record` = `26bf01ba4a`; subsequent code sub-phases (2.3 API completion, 2.4 Projection + UI, 2.5 Web UI + EventSource) base on this branch, and the 2.6 closure docs rebase `docs/phase2-record` atop merged 2.5 head.
- **No per-file 100% coverage**: the test surface covers the real-composition listener spec (`tests/listener.spec.ts`, 5 tests) + the unit registry spec (`tests/unit/registry.spec.ts`, 11 tests). Per-branch coverage on session-bound `append` paths is exercised through the listener integration rather than per-branch unit tests; a follow-up adds `tests/unit/evaluate.spec.ts` that mounts the registry in isolation and asserts each decision branch deterministically.
- **Snapshot scenarios deferred**: `tool-policy-allow` (declared policy permits, decision event logged) and `tool-policy-deny` (declared policy denies, decision event logged) are listed in `planning/Phase 2 prompt.md §7` but require the `dsh` CLI + a recorded-session JSONL this package cannot produce in isolation. The snapshot tests are recorded in the 2.6 closure docs sub-phase; the listener spec + the unit spec cover the in-process behavior the snapshots would assert.

## Reference

- `planning/Phase 2 prompt.md §2` (ToolPolicy manifest specification)
- `planning/Phase 2 prompt.md §11` (sub-phase stack)
- `docs/PROJECT.md §6` (the canonical `ToolPolicy` interface)
- `planning/inspect/08-tool-policy.md` (audit of the existing tool-policy story before this implementation)
- `packages/core/tools/src/index.ts` (the `PreToolDecision` vocabulary + `tools/pre-execute` waterfall)
- `packages/interaction/permission-presets/src/index.ts` (the `current(events)` fallback the listener audits)
- `packages/runtime-diagnostics/invariants/README.md` (the invariant companion pattern)
- `packages/app-builder/deployment/README.md` (the peer Phase 2.1 package)
- `packages/bundle/app-builder/cordis.patch.yml` (`app-builder-tool-policy` plugin row)
- `apps/cli/config/examples/app-builder/cordis.yml` (example composition)
- `.agents/notes/implemented/process/2026-08-31-phase-2-productize-control-plane-record.md` (Phase 2 plan record)
- `.agents/notes/implemented/architecture/2026-08-31-deployment-pipeline.md` (Phase 2.1 record — immediate predecessor)
- `.agents/notes/implemented/process/2026-09-01-phase-1.5-upstream-sync-record.md` (Phase 1.5 record — grandparent)

## Known pre-existing failures

Carries the §9 backlog from the Phase 1.5 record (no new failures introduced by this PR):

- `verify-md-links`: pre-existing broken cross-directory references.
- `verify-doc-budgets`: `packages/AGENTS.md` exceeds the 675-line ceiling (pre-existing).
- `verify-translation-pairing`: EN/ZH sidecar drift on `packages/app-builder/api/README.md` (pre-existing); the tool-policy package ships EN-only per the policy codified in `docs/AGENTS.md`.
- `verify-export-jsdoc`: the preview package's public exports are missing `@param` JSDoc on a couple of accessor methods (pre-existing; not in this PR's scope).
- `verify-package-invariants`: persona/preview/snapshot-bridge/bundle/app-builder peer-depend on `dsh-invariants` without an invariant companion (pre-existing; the new tool-policy package ships its companion).
