/**
 * Unit tests for the {@link ToolPolicyRegistry} evaluate() decision
 * function. The tests bypass the Loader and the upstream tools
 * pipeline by hand-building the `exec` object the listener receives
 * and asserting the returned {@link PreToolDecision} + the
 * `toolPolicy/decision` event appended to the owning session.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'

import { DEFAULT_TOOL_KINDS, ToolPolicyRegistry } from '../../src/index.ts'
import type { ToolPolicy } from '../../src/types.ts'

import { CUSTOM_PRESET } from '@deepseek-ai/dsh-permission-presets'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import type { ToolExecution, PreToolDecision } from '@deepseek-ai/dsh-tools'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { randomUUID } from 'node:crypto'

interface TestRig {
  ctx: Context
  registry: ToolPolicyRegistry
  sessions: Session[]
}

function fakeAgent(session: Session): Agent {
  return { session } as unknown as Agent
}
/** Build a minimal ToolExecution with the agent and tool name the listener needs. */
function fakeExec(agent: Agent | undefined, name: string): ToolExecution {
  return {
    callId: randomUUID() as unknown as ToolExecution['callId'],
    rootCallId: randomUUID() as unknown as ToolExecution['rootCallId'],
    name,
    arguments: {},
    signal: AbortSignal.abort(),
    token: Symbol('test') as unknown as ToolExecution['token'],
    ...(agent !== undefined ? { agent } : {}),
  } as unknown as ToolExecution
}

/**
 * Build a registry plus a single open session. The preset service is
 * only mounted when the test opts in via `withPresets`; absent the
 * service, the listener falls back to `CUSTOM_PRESET`.
 */
async function buildRig(opts: { toolKinds?: Record<string, 'read' | 'write' | 'execute' | 'network' | 'credential'> } = {}): Promise<TestRig> {
  const ctx = new Context()
  const registry = new ToolPolicyRegistry(ctx, 'appBuilderToolPolicy', opts.toolKinds !== undefined ? { toolKinds: opts.toolKinds } : {})
  const session = Session.create(SessionId('s1'))
  return { ctx, registry, sessions: [session] }
}

afterEach(async () => {
  // Each rig owns its context; the afterEach in the integration spec
  // disposes the rig context. Here we leak the contexts between tests
  // intentionally; vitest tears down the worker between describes.
})

describe('ToolPolicyRegistry.register / for / list', () => {
  it('registers a policy by id and exposes it through `for(toolName)` and `get(id)`', async () => {
    const { ctx, registry } = await buildRig()
    const policy: ToolPolicy = { id: 'bash-strict', tool: 'bash', allow: ['execute'], ask: [] }
    const off = registry.register(policy)
    expect(registry.for('bash')?.id).toBe('bash-strict')
    expect(registry.get('bash-strict')?.tool).toBe('bash')
    expect(registry.list().length).toBe(1)
    off()
    expect(registry.get('bash-strict')).toBeUndefined()
    expect(registry.for('bash')).toBeUndefined()
    await ctx.fiber.dispose()
  })

  it('replaces a previous registration when the same id is registered twice', async () => {
    const { ctx, registry } = await buildRig()
    registry.register({ id: 'bash', tool: 'bash', allow: ['execute'], ask: [] })
    registry.register({ id: 'bash', tool: 'bash', allow: [], ask: ['execute'] })
    const current = registry.get('bash')
    expect(current?.ask).toContain('execute')
    expect(current?.allow).toHaveLength(0)
    await ctx.fiber.dispose()
  })

  it('rejects an invalid action with a load-time error', async () => {
    const { ctx, registry } = await buildRig()
    expect(() => registry.register({ id: 'bad', tool: 'bash', allow: ['fly' as never], ask: [] })).toThrow(/unknown action/)
    await ctx.fiber.dispose()
  })

  it('rejects an overlap between allow and ask', async () => {
    const { ctx, registry } = await buildRig()
    expect(() => registry.register({ id: 'bad', tool: 'bash', allow: ['execute'], ask: ['execute'] })).toThrow(/overlap/)
    await ctx.fiber.dispose()
  })

  it('rejects an empty policy id or tool name', async () => {
    const { ctx, registry } = await buildRig()
    expect(() => registry.register({ id: '', tool: 'bash', allow: ['execute'], ask: [] })).toThrow(/id must be non-empty/)
    expect(() => registry.register({ id: 'x', tool: '', allow: ['execute'], ask: [] })).toThrow(/tool must be non-empty/)
    await ctx.fiber.dispose()
  })
})

describe('ToolPolicyRegistry.evaluate', () => {
  it('returns the upstream `next()` decision and emits a fallback audit event when no policy matches', async () => {
    const { ctx, registry, sessions } = await buildRig()
    const exec = fakeExec(fakeAgent(sessions[0]!), 'unmapped')
    const next = async (): Promise<PreToolDecision> => ({ kind: 'allow' })
    const decision = await registry.evaluate(exec, next)
    expect(decision).toEqual({ kind: 'allow' })
    const decisions = sessions[0]!.events.filter(event => event.type === 'toolPolicy/decision')
    expect(decisions.length).toBe(1)
    const evt = decisions[0]!.data
    expect(evt.toolName).toBe('unmapped')
    expect(evt.policyId).toBeNull()
    expect(evt.kind).toBe('fallback')
    expect(evt.action).toBeNull()
    expect(evt.fallbackPreset).toBe(CUSTOM_PRESET)
    await ctx.fiber.dispose()
  })

  it('records CUSTOM_PRESET when permissionPresets is not mounted', async () => {
    const { ctx, registry, sessions } = await buildRig()
    const exec = fakeExec(fakeAgent(sessions[0]!), 'unmapped')
    await registry.evaluate(exec, async () => ({ kind: 'allow' }))
    const evt = sessions[0]!.events.find(event => event.type === 'toolPolicy/decision')
    expect(evt?.data.fallbackPreset).toBe(CUSTOM_PRESET)
    await ctx.fiber.dispose()
  })

  it('returns allow when the policy lists the classified action', async () => {
    const { ctx, registry, sessions } = await buildRig()
    registry.register({ id: 'bash-policy', tool: 'bash', allow: ['execute'], ask: [] })
    const exec = fakeExec(fakeAgent(sessions[0]!), 'bash')
    const decision = await registry.evaluate(exec, async () => ({ kind: 'deny', reason: 'should not be called' }))
    expect(decision).toEqual({ kind: 'allow' })
    const evt = sessions[0]!.events.find(event => event.type === 'toolPolicy/decision')
    expect(evt?.data.kind).toBe('allow')
    expect(evt?.data.action).toBe('execute')
    expect(evt?.data.policyId).toBe('bash-policy')
    await ctx.fiber.dispose()
  })

  it('returns ask when the policy lists the classified action under `ask`', async () => {
    const { ctx, registry, sessions } = await buildRig()
    registry.register({ id: 'write-policy', tool: 'write', allow: [], ask: ['write'] })
    const exec = fakeExec(fakeAgent(sessions[0]!), 'write')
    const decision = await registry.evaluate(exec, async () => ({ kind: 'allow' }))
    expect(decision.kind).toBe('ask')
    expect(decision.kind === 'ask' ? decision.reason : undefined).toContain('write-policy')
    const evt = sessions[0]!.events.find(event => event.type === 'toolPolicy/decision')
    expect(evt?.data.kind).toBe('ask')
    expect(evt?.data.action).toBe('write')
    await ctx.fiber.dispose()
  })

  it('returns deny when the policy lists neither allow nor ask for the classified action', async () => {
    const { ctx, registry, sessions } = await buildRig()
    registry.register({ id: 'bash-deny', tool: 'bash', allow: ['read'], ask: [] })
    const exec = fakeExec(fakeAgent(sessions[0]!), 'bash')
    const decision = await registry.evaluate(exec, async () => ({ kind: 'allow' }))
    expect(decision.kind).toBe('deny')
    expect(decision.kind === 'deny' ? decision.reason : undefined).toContain('does not permit')
    const evt = sessions[0]!.events.find(event => event.type === 'toolPolicy/decision')
    expect(evt?.data.kind).toBe('deny')
    expect(evt?.data.action).toBe('execute')
    await ctx.fiber.dispose()
  })

  it('falls back to allow when the tool is unclassified but `execute` is in `allow`', async () => {
    const { ctx, registry, sessions } = await buildRig()
    registry.register({ id: 'custom-tool', tool: 'unknown_tool', allow: ['execute'], ask: [] })
    const exec = fakeExec(fakeAgent(sessions[0]!), 'unknown_tool')
    const decision = await registry.evaluate(exec, async () => ({ kind: 'deny', reason: 'should not run' }))
    expect(decision).toEqual({ kind: 'allow' })
    const evt = sessions[0]!.events.find(event => event.type === 'toolPolicy/decision')
    expect(evt?.data.action).toBe('execute')
    await ctx.fiber.dispose()
  })

  it('denies an unclassified tool when `execute` is not in `allow`', async () => {
    const { ctx, registry, sessions } = await buildRig()
    registry.register({ id: 'custom-strict', tool: 'unknown_tool', allow: ['read'], ask: [] })
    const exec = fakeExec(fakeAgent(sessions[0]!), 'unknown_tool')
    const decision = await registry.evaluate(exec, async () => ({ kind: 'allow' }))
    expect(decision.kind).toBe('deny')
    expect(decision.kind === 'deny' ? decision.reason : undefined).toContain('explicit execute allow')
    await ctx.fiber.dispose()
  })

  it('respects a custom toolKinds override that reclassifies a tool', async () => {
    const { ctx, registry, sessions } = await buildRig({ toolKinds: { bash: 'network' } })
    registry.register({ id: 'bash-network-only', tool: 'bash', allow: ['network'], ask: [] })
    const exec = fakeExec(fakeAgent(sessions[0]!), 'bash')
    const decision = await registry.evaluate(exec, async () => ({ kind: 'deny', reason: 'should not run' }))
    expect(decision).toEqual({ kind: 'allow' })
    const evt = sessions[0]!.events.find(event => event.type === 'toolPolicy/decision')
    expect(evt?.data.action).toBe('network')
    await ctx.fiber.dispose()
  })

  it('skips the audit event when no agent is attached (test path)', async () => {
    const { ctx, registry } = await buildRig()
    const exec = fakeExec(undefined, 'unmapped')
    const decision = await registry.evaluate(exec, async () => ({ kind: 'deny', reason: 'mock' }))
    expect(decision).toEqual({ kind: 'deny', reason: 'mock' })
    await ctx.fiber.dispose()
  })

  it('exposes the bundled DEFAULT_TOOL_KINDS classification', async () => {
    const { ctx } = await buildRig()
    expect(DEFAULT_TOOL_KINDS.read).toBe('read')
    expect(DEFAULT_TOOL_KINDS.bash).toBe('execute')
    expect(DEFAULT_TOOL_KINDS.web_search).toBe('network')
    await ctx.fiber.dispose()
  })
})
