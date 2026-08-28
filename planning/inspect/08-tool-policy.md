# Step 8 — ToolPolicy / permission model

> Status: COMPLETE. Phase alignment: the plan's 'ToolPolicy manifest' is mostly implemented; this step audits the gap.

## Headline finding

**The plan calls this the most important scale-readiness item — 'build it now'.** The good news: every primitive the plan wants exists. The structured typed manifest the plan describes does NOT exist as a single schema. The new work is an aggregation package + the enforcer that consults it.

## What exists today (relevant to ToolPolicy)

### Sandbox policy (`ctx.sandboxPolicy`)

Per session: durable mode override via `sandbox/mode` event. Per call: shared resolution (`mode` + canonicalized `workspaceRoot`). Modes: `read-only`, `workspace-write`, `danger-full-access`. Fallback defaults from deployment config. Single owner — every enforcing backend (bash, fs, terminal) consumes the same per-call resolution.

### Permission presets (`ctx.permissionPresets`)

User-facing name bundles a `sandbox/mode` + `approval/policy`. Defaults: `workspace-write` (`workspace-write` + `ask`) and `danger-full-access` (`danger-full-access` + `never`). `set(session, name)` records a changed selection in a log-only `permissionPresets/preset` event; selection event precedes the knob events and a net-zero selection appends nothing. `current(events)` prefers a still-matching recorded selection. `defaultPreset` is configurable; committed Settings change is read on next session creation. **`custom` is derived-only**: callers can switch away from an unmatched knob combination but cannot target or persist a named custom preset.

**Plan gap:** 'A new tool's policy must declare its own mode + approval + credential + network + read/write scope'. Presets today bundle mode + approval; they do NOT bundle per-tool policy.

### Approval seam (`ctx.approval`)

Channel-neutral one-shot approval. `request(req)` returns `allowed-once`, `rejected`, `cancelled`, or `unavailable`. Missing or failing answerers fail closed. Each request belongs to an open agent turn. Audit pair: `approval/asked` + `approval/decided` (log-only). `ApprovalPolicy` = `'ask' | 'never'`. The ACP automation bridge supplies one-shot machine decisions for sessions it owns.

### User questions (`ctx.userQuestions`)

Model can ask the human a structured multi-choice question with optional `detail` and `intent` (currently `plan-review`). Tagged presentation: `intent` changes presentation only; answer shape is the same. Service Definition at `user-questions`; Web host runtime supplies the shipped Service Provider.

### Commands (`ctx.commands`)

Slash-command registry. `register(definition)` for lowercase commands. `recordInput` defaults true (the durable `command/run` event records the parsed input); `false` means the command's authoritative domain event owns the payload. Lifecycle: `command/run` (before handler) + `command/done` (at settlement). Agent-scoped registrations shadow global ones.

### Tool pipeline (the enforcement seam)

Per `packages/core/tools/README.md`:
- `tools/pre-execute` is the reorderable allow/deny/ask gate.
- `ctx.tools.guard()` adds monotonic owner policy after `pre-execute`; returning a reason denies the call, while `undefined` leaves it unchanged.
- `tools/execute` wraps normalized canonical dispatch for timeout, retry, or metrics.
- `tools/post-execute` may replace presentation content, replace the canonical value, block with feedback, or attach ordered contexts.
- `PreToolDecision` = `{kind:'allow'}` | `{kind:'deny', reason}` | `{kind:'ask', reason?}`. Input rewrite is deliberately not offered.

### Per-tool shape

Each `ToolDefinition` carries its own:
- `output { schema, render, presentationMeta? }`
- `execute(args, exec)`
- optional `finalizeContent(exec, result)`
- cooperative `timeoutMs`
- optional per-call `isConcurrencySafe(args)` classifier

### Cross-family coordination

dsh-bash-sandbox + dsh-fs-sandbox share one `writableRoots()` function so the bash runner and the fs fence cannot drift. Per-call policy carries the mode + the canonicalized workspace root; the tool layer resolves the calling session's mode and cwd into the same per-call policy bash receives.

## What is NOT yet built

### 1. A typed `ToolPolicy` schema as a first-class object

Presets bundle mode + approval only. There is no `ToolPolicy { id: string; tool: string; allow: ('read'|'write'|'execute'|'network'|'credential')[]; scope: { paths?: string[]; commands?: string[]; hosts?: string[] }; ask?: ('read'|'write'|'execute'|'network'|'credential')[] }` aggregate that a developer can declare against a tool.

### 2. A per-tool policy enforcer

Today, per-tool decisions are scattered:
- bash does it via `tools/pre-execute` listeners (none shipped by default; the user adds via permission-presets).
- fs does it via `fs-sandbox` MODE fence.
- web does it via `web-fetch-http` (URL + size + content-type limits).
- credentialed providers (LLM, web search) are NOT subject to a per-tool policy — they are gated only by `ctx.credentials` resolution.

A new package `@deepseek-ai/dsh-tool-policy` (or similar) could:
- Declare the `ToolPolicy` typed schema.
- Mount a `tools/pre-execute` listener that consults the declared policy for the invoked tool name.
- Emit per-tool policy decision events for audit (`toolPolicy/decision`).
- For tools that match no declared policy, fall back to `ctx.permissionPresets.current(events)` defaults.

### 3. Network scope and credential scope declarations

dsh's web/fetch providers have hard-coded transport limits (maxUrlLength, maxResponseBytes, maxBodyChars, maxRedirects, timeout). They are not declared as a per-tool policy; they are package config.

### 4. Adversarial testing harness for ToolPolicy

dsh has a `test-support/agent-loop-testkit` and `test-support/loader-smoke` for general testing. There is no dedicated adversarial test suite for ToolPolicy bypass attempts.

### 5. Per-user vs per-project vs per-agent policy layering

`permission-presets` has session-level state. There is no first-class 'this tool, in this project, for this user' override layer.

## Existing safety machinery worth reusing

| Mechanism | Plan item |
| --- | --- |
| `ctx.sandboxPolicy` | 'Least privilege per tool' (mode component) |
| `ctx.permissionPresets` | 'Named permission bundles' |
| `ctx.approval` | 'Human approval on deploy/credentials/destructive' |
| `ctx.userQuestions` | 'Asking the user for missing info' |
| `ctx.commands` | 'Slash command surface for human control' |
| `tools/pre-execute` | 'Per-tool decision gate' |
| `tools/guard` | 'Monotonic owner policy' |
| `ctx.tools.restrict()` | 'Agent-scoped allow/deny mask' (visibility-only; not authority) |
| `ctx.shell.sandboxMode` capability | 'Advertise sandbox_permissions only when executor confines' |
| `@deepseek-ai/dsh-fs-observation-policy` | 'Read-before-write/edit policy gate' |
| `@deepseek-ai/dsh-tool-call-timeout-policy` | 'Per-tool timeout' |
| `@deepseek-ai/dsh-repeat-tool-reminder` | 'Stall detection' |
| `@deepseek-ai/dsh-tool-ask-user` | 'Model-facing question tool' |

## Plan implications

Phase 2.2 'ToolPolicy manifest' is best framed as:

1. **Decide where the typed schema lives.** Options: a new `packages/permissions/tool-policy` package (new group), inside `packages/interaction/permission-presets` (extending presets), or inside `packages/core/tools` (closest to enforcement). Recommend: NEW group `packages/permissions/tool-policy` because the contract belongs with permissions, not with the tool registry.
2. **Decide the enforcement shape.** A `tools/pre-execute` listener that resolves `policy = ctx.toolPolicy.for(toolName)` and converts the typed policy into a `PreToolDecision`. Idempotent; resolves in microseconds.
3. **Wire presets to ToolPolicy.** `ctx.permissionPresets.current(events)` already exists; the new ToolPolicy package falls back to presets when no per-tool policy is declared.
4. **Audit trail.** Every ToolPolicy decision becomes a `toolPolicy/decision` event (log-only, like `approval/decided`).
5. **Document 'is not authority' up front.** Like `ctx.tools.restrict()`, the policy is intent plus audit; real authority comes from sandbox-mode fences and capability seams.

## Plan mismatches identified (carried to Step 14)

- Plan overstates the greenfield work. Permission presets + sandbox policy + approval + user-questions + commands + the tool pipeline's three policy gates compose most of the policy story already.
- Plan does not name the explicit typed `ToolPolicy` schema. Recommend adding it.
- Plan does not name the cross-family coordination (bash+fs+web share policy resolution). This is a strength to preserve, not a gap to fill.
- Plan does not mention that dsh already has `read-only / workspace-write / danger-full-access` as a closed mode vocabulary. This is the entire sandbox story.
- Plan says 'before deploy, run SAST/SCA/secrets scan'. These are external tools. App Builder should integrate them as `tools/sast`, `tools/sca`, `tools/secrets-scan` plugins (no new infrastructure), or as services the deploy tool consults before pushing.
- Plan does not mention that App Builder must answer the question 'does `danger-full-access` make sense for a coding-agent prompting tool?' — yes, when the user explicitly approves an escalation. The escalation path is already there (`sandbox_permissions: 'danger-full-access'` in the tool call).
- Plan does not mention `permission-presets`' `custom` is derived-only. The App Builder cannot ship a 'custom' preset; it must offer the user a way to write a new preset that becomes a real option.
- Plan does not mention that `ctx.tools.restrict()` is visibility, not authority. Document this for App Builder users — a tool they 'restrict away' is still in scope if some other tool re-exposes it.
- Plan says 'every tool declares allowed actions, read/write scope, network scope, credential access'. This is the typed schema. Today it is implicit (per-provider config); making it explicit is the additive work.
