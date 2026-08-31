/**
 * @module @deepseek-ai/dsh-app-builder-tool-policy
 *
 * Cordis plugin that owns the App Builder ToolPolicy manifest. The
 * registry stores one {@link ToolPolicy} per tool, mounts a
 * `tools/pre-execute` listener that converts the typed policy into
 * a {@link PreToolDecision}, and appends a log-only
 * `toolPolicy/decision` event for every evaluation. Tools without
 * a registered policy fall back to `ctx.permissionPresets.current(events)`.
 *
 * Intent + audit, NOT authority. Real authority comes from sandbox-mode
 * fences and capability seams; this registry is the typed declarative
 * surface that a session log can replay.
 */

import type { Context } from '@deepseek-ai/cordis'
import { Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { ToolExecution, PreToolDecision } from '@deepseek-ai/dsh-tools'
import type { Session } from '@deepseek-ai/dsh-session'

import { CUSTOM_PRESET } from '@deepseek-ai/dsh-permission-presets'
import type { PermissionPresetService } from '@deepseek-ai/dsh-permission-presets'

import {
  DEFAULT_TOOL_KINDS,
  TOOL_ACTIONS,
  type ToolAction,
  type ToolPolicy,
  type ToolPolicyDecision,
  type ToolPolicyScope,
} from './types.ts'

export type {
  ToolAction,
  ToolPolicy,
  ToolPolicyDecision,
  ToolPolicyDecisionKind,
  ToolPolicyScope,
} from './types.ts'
export { DEFAULT_TOOL_KINDS, TOOL_ACTIONS } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /**
     * App Builder ToolPolicy registry. The BFF and direct model callers
     * consult `ctx.toolPolicy.for(toolName)` to convert the typed manifest
     * into a {@link PreToolDecision}; the plugin mounts a `tools/pre-execute`
     * listener that performs the conversion automatically.
     */
    toolPolicy: ToolPolicyRegistry
  }
}

/**
 * Process-local ToolPolicy registry. The registry stores the typed
 * manifest, mounts a `tools/pre-execute` listener that converts the
 * declared policy into a {@link PreToolDecision}, and appends a log-only
 * `toolPolicy/decision` event for every evaluation. The decision
 * vocabulary mirrors the upstream pipeline (`allow` / `deny` / `ask`)
 * plus a `fallback` audit outcome recorded when no per-tool policy
 * matched and the listener delegated to the permission-presets default.
 */
export class ToolPolicyRegistry extends Service {
  /**
   * Internal lookup map keyed by policy id. A duplicate `id` overwrites
   * the previous registration so a reload can replace a manifest without
   * first disposing the old registration.
   */
  private readonly policiesById = new Map<string, ToolPolicy>()

  /**
   * Internal lookup map keyed by tool name. At most one policy per tool;
   * the latest registration wins so a tool with overlapping manifests
   * resolves to the most recently declared one.
   */
  private readonly policiesByTool = new Map<string, ToolPolicy>()

  /** The resolved tool-name → action classification. Frozen at apply time. */
  private readonly toolKinds: Readonly<Record<string, ToolAction>>

  /** The registry effective configuration. Resolved by apply(). */
  readonly config: Config

  constructor(ctx: Context, name = 'toolPolicy', config: Config = {}) {
    super(ctx, name)
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.toolKinds = Object.freeze({ ...DEFAULT_TOOL_KINDS, ...(config.toolKinds ?? {}) })
    this.ctx.on('tools/pre-execute', (exec: ToolExecution, next: () => Promise<PreToolDecision>) => this.evaluate(exec, next))
  }

  /**
   * Register one ToolPolicy. A duplicate `id` replaces the previous
   * registration; a duplicate `tool` name shadows the previous policy
   * so a tool with overlapping manifests resolves to the latest one.
   * @param policy - The ToolPolicy to register.
   * @returns The exact disposer that unregisters the policy.
   */
  register(policy: ToolPolicy): () => void {
    this.assertValid(policy)
    this.policiesById.set(policy.id, policy)
    this.policiesByTool.set(policy.tool, policy)
    let disposed = false
    return () => {
      if (disposed) return
      disposed = true
      const current = this.policiesById.get(policy.id)
      if (current === policy) this.policiesById.delete(policy.id)
      const currentTool = this.policiesByTool.get(policy.tool)
      if (currentTool === policy) this.policiesByTool.delete(policy.tool)
    }
  }

  /**
   * Look up the policy registered against a tool name. Returns the
   * most recent registration when multiple policies name the same tool.
   * @param toolName - The tool name the lookup matches.
   * @returns The matching policy, or `undefined` when none is registered.
   */
  for(toolName: string): ToolPolicy | undefined {
    return this.policiesByTool.get(toolName)
  }

  /**
   * Look up a policy by its stable id. The id is the registry map key,
   * not the tool name; use {@link for} for tool-name lookups.
   * @param id - The policy id the lookup matches.
   * @returns The matching policy, or `undefined` when none is registered.
   */
  get(id: string): ToolPolicy | undefined {
    return this.policiesById.get(id)
  }

  /**
   * Every registered policy in registration order (oldest first).
   * @returns A frozen snapshot of the registry contents.
   */
  list(): readonly ToolPolicy[] {
    return Object.freeze([...this.policiesById.values()])
  }

  /**
   * Classify a tool name into a {@link ToolAction}. Returns the registered
   * classification; absent an entry, returns `undefined` so the listener
   * can apply the catch-all `execute` rule (the most conservative default
   * for tools the registry has not been told about).
   * @param toolName - The tool name to classify.
   * @returns The classified action, or `undefined` when unclassified.
   */
  actionOf(toolName: string): ToolAction | undefined {
    return this.toolKinds[toolName]
  }

  /**
   * Evaluate one `tools/pre-execute` call. The method is the canonical
   * decision function: it looks up the policy by tool name, falls back
   * to the permission-presets current preset on a miss, appends one
   * `toolPolicy/decision` audit event to the owning session, and returns
   * the {@link PreToolDecision} the upstream pipeline should observe.
   *
   * @param exec - The tool execution the listener is evaluating.
   * @param next - The delegate that returns the default PreToolDecision.
   * @returns The decision the upstream pipeline should observe.
   */
  async evaluate(exec: ToolExecution, next: () => Promise<PreToolDecision>): Promise<PreToolDecision> {
    const session = exec.agent?.session
    const preset = this.readPreset(session)
    const policy = this.policiesByTool.get(exec.name)
    if (policy === undefined) {
      this.appendDecision(session, {
        toolName: exec.name,
        policyId: null,
        kind: 'fallback',
        action: null,
        fallbackPreset: preset,
      })
      return next()
    }
    const action = this.toolKinds[exec.name]
    if (action === undefined) {
      // Unclassified tool with a declared policy: the conservative default
      // is that the policy must explicitly list 'execute' in `allow` for
      // the call to pass; otherwise the listener denies with a reason that
      // names the missing classification so a composition can fix it.
      if (policy.allow.includes('execute')) {
        this.appendDecision(session, {
          toolName: exec.name,
          policyId: policy.id,
          kind: 'allow',
          action: 'execute',
          fallbackPreset: preset,
        })
        return { kind: 'allow' }
      }
      const reason = `tool ${exec.name} policy ${policy.id} requires explicit execute allow or a toolKinds classification`
      this.appendDecision(session, {
        toolName: exec.name,
        policyId: policy.id,
        kind: 'deny',
        action: null,
        fallbackPreset: preset,
        reason,
      })
      return { kind: 'deny', reason }
    }
    if (policy.allow.includes(action)) {
      this.appendDecision(session, {
        toolName: exec.name,
        policyId: policy.id,
        kind: 'allow',
        action,
        fallbackPreset: preset,
      })
      return { kind: 'allow' }
    }
    if (policy.ask.includes(action)) {
      const reason = `tool ${exec.name} policy ${policy.id} requires approval for ${action}`
      this.appendDecision(session, {
        toolName: exec.name,
        policyId: policy.id,
        kind: 'ask',
        action,
        fallbackPreset: preset,
        reason,
      })
      return { kind: 'ask', reason }
    }
    const reason = `tool ${exec.name} policy ${policy.id} does not permit ${action}`
    this.appendDecision(session, {
      toolName: exec.name,
      policyId: policy.id,
      kind: 'deny',
      action,
      fallbackPreset: preset,
      reason,
    })
    return { kind: 'deny', reason }
  }

  /** Read the current permission preset the session observed; `custom` when presets are unmounted or no session is attached. */
  private readPreset(session: Session | undefined): string {
    if (session === undefined) return CUSTOM_PRESET
    const presets = this.ctx.get('permissionPresets') as PermissionPresetService | undefined
    if (presets === undefined) return CUSTOM_PRESET
    return presets.current(session.events)
  }

  /** Append one toolPolicy/decision event to the session log when an agent-bound session is attached. */
  private appendDecision(session: Session | undefined, decision: ToolPolicyDecision): void {
    if (session === undefined) return
    const base = {
      toolName: decision.toolName,
      policyId: decision.policyId,
      kind: decision.kind,
      action: decision.action,
      fallbackPreset: decision.fallbackPreset,
    }
    const payload = decision.reason !== undefined ? { ...base, reason: decision.reason } : base
    session.append('toolPolicy/decision', payload)
  }

  /** Validate a policy at registration time so the registry never holds a malformed record. */
  private assertValid(policy: ToolPolicy): void {
    if (policy.id.length === 0) throw new Error('toolPolicy: policy id must be non-empty')
    if (policy.tool.length === 0) throw new Error('toolPolicy: policy tool must be non-empty')
    const validateAction = (label: string, list: readonly ToolAction[]): void => {
      for (const action of list) {
        if (!(TOOL_ACTIONS as readonly string[]).includes(action)) {
          throw new Error(`toolPolicy: ${label} lists unknown action ${JSON.stringify(action)}`)
        }
      }
      const overlap = list.filter(action => policy.allow.includes(action) && policy.ask.includes(action))
      if (overlap.length > 0) {
        throw new Error(`toolPolicy: ${label} and allow overlap on ${overlap.map(action => JSON.stringify(action)).join(', ')}`)
      }
    }
    validateAction('allow', policy.allow)
    validateAction('ask', policy.ask)
    if (policy.scope !== undefined) {
      const scope: ToolPolicyScope = policy.scope
      const scopeFields: Array<keyof ToolPolicyScope> = ['paths', 'commands', 'hosts', 'credentials']
      for (const field of scopeFields) {
        const value = scope[field]
        if (value === undefined) continue
        if (value.length === 0) throw new Error(`toolPolicy: scope.${field} must be non-empty when declared`)
      }
    }
  }
}

/** Plugin config: optional tool-kind extension + audit settings. */
export interface Config {
  /**
   * Tool-name → action classification override. Merged over the
   * bundled {@link DEFAULT_TOOL_KINDS} map; absent entries inherit
   * the default. A composition uses this to register the action of
   * tools the bundled map does not know about.
   */
  toolKinds?: Record<string, ToolAction>
}

/** Internal defaults the registry merges with the resolved config. */
const DEFAULT_CONFIG: Config = {}

/** Schemastery schema for plugin config. The bundled defaults apply at validation time. */
export const Config: z<Config> = z.object({
  toolKinds: z.dict(z.union([
    z.const('read'),
    z.const('write'),
    z.const('execute'),
    z.const('network'),
    z.const('credential'),
  ])).default({}),
})

/** Cordis plugin name. */
export const name = 'app-builder-tool-policy'

/**
 * Services the plugin requires at mount time. The listener registers
 * on `tools/pre-execute`, so `tools` is a hard dependency;
 * `permissionPresets` is read through `ctx.get` so a missing service
 * resolves to a `custom` fallback preset.
 */
export const inject: readonly string[] = ['tools']

/**
 * Plugin entry. The constructor registers the `tools/pre-execute`
 * listener so disposal tracks the owning fiber. The Config schema
 * validates the supplied `toolKinds` map at load time so a misconfigured
 * action name fails loud.
 * @param ctx - Cordis context.
 * @param config - Plugin config (validated through `Config`).
 */
export function apply(ctx: Context, config: Config = {}): void {
  const resolved = Config(config)
  const serviceConfig: Config = resolved.toolKinds !== undefined ? { toolKinds: resolved.toolKinds } : {}
  new ToolPolicyRegistry(ctx, 'toolPolicy', serviceConfig)
  ctx.effect(() => () => {
    // Disposal is handled by ctx.reflect.provide when the owning fiber unloads.
  }, 'app-builder-tool-policy: service disposer')
}

export default ToolPolicyRegistry
