/**
 * Wire-safe types for the App Builder ToolPolicy manifest. Free of
 * cordis/service imports so browser type chains can consume the
 * `ToolPolicy` schema directly.
 *
 * @module @deepseek-ai/dsh-app-builder-tool-policy/types
 */

/**
 * The action vocabulary a {@link ToolPolicy} declares against a tool.
 *
 *  - `read`       — the tool reads filesystem / web content.
 *  - `write`      — the tool writes or edits filesystem content.
 *  - `execute`    — the tool runs a subprocess / code / shell command.
 *  - `network`    — the tool makes outbound network calls.
 *  - `credential` — the tool accesses a credential or secret.
 */
export type ToolAction = 'read' | 'write' | 'execute' | 'network' | 'credential'

/** Every action in canonical policy-declaration order. */
export const TOOL_ACTIONS = ['read', 'write', 'execute', 'network', 'credential'] as const

/**
 * Per-tool scope restrictions, narrowing what a tool may touch when an
 * action is allowed. Every field is optional; an absent field means
 * "no restriction on that scope axis".
 */
export interface ToolPolicyScope {
  /** Allowed filesystem paths (fs tools). */
  readonly paths?: readonly string[]
  /** Allowed command-prefix list (bash / shell tools). */
  readonly commands?: readonly string[]
  /** Allowed host:port endpoints (web tools). */
  readonly hosts?: readonly string[]
  /** Declared credential references the tool may resolve (e.g. `["github-token"]`). */
  readonly credentials?: readonly string[]
}

/**
 * The typed manifest a developer declares against one tool. The
 * registry stores one `ToolPolicy` per `id`; a duplicate `id` overwrites
 * the previous registration so a reload can replace a manifest.
 *
 *  - `allow` is the set of actions the tool may freely perform.
 *  - `ask`   is the set of actions that must request approval.
 *  - `scope` narrows the allowed targets; absent, the tool sees no
 *    per-policy scope restriction (its own backend still enforces any
 *    internal fences).
 */
export interface ToolPolicy {
  /** Stable policy id; doubles as the registry map key. */
  readonly id: string
  /** The tool name the policy governs, exactly as registered in `ctx.tools`. */
  readonly tool: string
  /** Actions the tool may freely perform; intersect with `ask` is allowed. */
  readonly allow: readonly ToolAction[]
  /** Actions that require approval; intersect with `allow` is allowed. */
  readonly ask: readonly ToolAction[]
  /** Optional scope narrowing for the allowed actions. */
  readonly scope?: ToolPolicyScope
}

/**
 * The closed vocabulary of `toolPolicy/decision.kind` outcomes. `allow`,
 * `deny`, and `ask` mirror PreToolDecision; `fallback` is the audit-only
 * outcome recorded when no per-tool policy matched and the listener
 * delegated to the permission-presets default.
 */
export type ToolPolicyDecisionKind = 'allow' | 'deny' | 'ask' | 'fallback'

/**
 * The audit payload appended to the session log on every `tools/pre-execute`
 * evaluation. The kind is the listener outcome; `policyId` is the
 * matched policy (null on `fallback`); `action` is the classified action
 * the policy matched against; `fallbackPreset` is the permission-preset
 * current at evaluation time on the fallback path; `reason` carries the
 * human-readable explanation a `deny` or `ask` decision exposes to the
 * upstream tools pipeline.
 */
export interface ToolPolicyDecision {
  /** The tool name the listener just evaluated. */
  readonly toolName: string
  /** The matched policy id, or `null` on the fallback path. */
  readonly policyId: string | null
  /** Closed outcome vocabulary. */
  readonly kind: ToolPolicyDecisionKind
  /** The classified action the policy matched against (null on fallback). */
  readonly action: ToolAction | null
  /** The current permission preset at evaluation time (every path). */
  readonly fallbackPreset: string
  /** Human-readable reason for `deny` and `ask`; absent on `allow` / `fallback`. */
  readonly reason?: string
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * One ToolPolicy evaluation. The listener appends exactly one of
     * these per `tools/pre-execute` call; the `kind` field records the
     * outcome the upstream tools pipeline saw. Log-only — the model
     * never reads it, but the session log carries the durable audit
     * trail a UAC / replay review needs.
     */
    'toolPolicy/decision': ToolPolicyDecision
  }
}

/**
 * Built-in tool-name → action classification the registry seeds. The
 * policy package ships this map as the conservative default for the
 * built-in tools; a composition can extend or replace it through the
 * `toolKinds` plugin config.
 */
export const DEFAULT_TOOL_KINDS: Readonly<Record<string, ToolAction>> = Object.freeze({
  read: 'read',
  write: 'write',
  edit: 'write',
  str_replace_editor: 'write',
  bash: 'execute',
  run_code: 'execute',
  job_create: 'execute',
  job_output: 'execute',
  job_kill: 'execute',
  web_search: 'network',
  web_fetch: 'network',
  credentials_get: 'credential',
})
