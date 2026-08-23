/**
 * @deepseek-ai/dsh-subagent/child-agent.resolveChildAgentOptions
 *
 * The resolved child `AgentOptions` must mirror the parent's LIVE routing
 * waterfall — same as api-proxy's `selectionFor` does for the parent — so a
 * subagent follows whatever model the master is currently using. When the
 * live services are absent, behavior falls back to the parent's
 * creation-time options, preserving backward compatibility.
 *
 * @module @deepseek-ai/dsh-subagent/tests/child-agent
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
// Type-only side-effect import — wires the `agentDefaultModel` ambient
// augmentation onto Context so `ctx.get('agentDefaultModel')` resolves to the
// live default selection service when composed.
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type { Agent, AgentOptions, ModelSelection } from '@deepseek-ai/dsh-agent'
import type { EpochHeader } from '@deepseek-ai/dsh-session'
import { resolveChildAgentOptions } from '../src/child-agent.ts'

/**
 * Minimal Agent-shaped test fixture. We never exercise methods beyond
 * `options`, `session.requestHeader`, and `ctx.get('agentDefaultModel')`, so
 * `as never` keeps the mock compact while still letting TypeScript check the
 * narrow surface `resolveChildAgentOptions` reads.
 */
function fakeAgent(input: {
  options: AgentOptions
  requestHeader?: EpochHeader | undefined
  agentDefaultModel?: { currentSelection: () => ModelSelection } | undefined
}): Agent {
  const ctx = new Context()
  if (input.agentDefaultModel !== undefined) {
    ctx.provide('agentDefaultModel', input.agentDefaultModel as never)
  }
  const session = {
    requestHeader: () => input.requestHeader,
  } as unknown as Agent['session']
  return {
    id: 'parent' as Agent['id'],
    options: input.options,
    session,
    ctx,
    inbox: {} as Agent['inbox'],
    status: 'idle' as Agent['status'],
  } as unknown as Agent
}

describe('resolveChildAgentOptions', () => {
  it('reads provider/model from agentDefaultModel.currentSelection() when composed', () => {
    const parent = fakeAgent({
      options: { provider: 'stale-provider', model: 'stale-model' },
      agentDefaultModel: { currentSelection: () => ({ provider: 'live-provider', model: 'live-model' }) },
    })
    expect(resolveChildAgentOptions(parent, undefined, 1)).toEqual({
      provider: 'live-provider',
      model: 'live-model',
      subagentDepth: 1,
    })
  })

  it('falls back to parent.options when agentDefaultModel is not composed', () => {
    const parent = fakeAgent({
      options: { provider: 'p', model: 'm' },
    })
    expect(resolveChildAgentOptions(parent, undefined, 1)).toEqual({
      provider: 'p',
      model: 'm',
      subagentDepth: 1,
    })
  })

  it('prefers session.requestHeader().config over currentSelection() and parent.options', () => {
    const parent = fakeAgent({
      options: { provider: 'frozen', model: 'frozen-model' },
      requestHeader: { config: { provider: 'logged', model: 'logged-model' } } as EpochHeader,
      agentDefaultModel: { currentSelection: () => ({ provider: 'live', model: 'live-model' }) },
    })
    expect(resolveChildAgentOptions(parent, undefined, 1)).toEqual({
      provider: 'logged',
      model: 'logged-model',
      subagentDepth: 1,
    })
  })

  it('prefers currentSelection() over parent.options when requestHeader is undefined', () => {
    const parent = fakeAgent({
      options: { provider: 'frozen', model: 'frozen-model' },
      agentDefaultModel: { currentSelection: () => ({ provider: 'live', model: 'live-model' }) },
    })
    expect(resolveChildAgentOptions(parent, undefined, 1)).toEqual({
      provider: 'live',
      model: 'live-model',
      subagentDepth: 1,
    })
  })

  it('uses requestHeader().config even without agentDefaultModel composed', () => {
    const parent = fakeAgent({
      options: { provider: 'frozen', model: 'frozen-model' },
      requestHeader: { config: { provider: 'logged', model: 'logged-model' } } as EpochHeader,
    })
    expect(resolveChildAgentOptions(parent, undefined, 1)).toEqual({
      provider: 'logged',
      model: 'logged-model',
      subagentDepth: 1,
    })
  })

  it('lets the per-child requested override win over every inherited source', () => {
    const parent = fakeAgent({
      options: { provider: 'frozen', model: 'frozen-model' },
      requestHeader: { config: { provider: 'logged', model: 'logged-model' } } as EpochHeader,
      agentDefaultModel: { currentSelection: () => ({ provider: 'live', model: 'live-model' }) },
    })
    const requested: AgentOptions = { provider: 'override', model: 'override-model', maxTokens: 4096 }
    expect(resolveChildAgentOptions(parent, requested, 1)).toEqual({
      provider: 'override',
      model: 'override-model',
      maxTokens: 4096,
      subagentDepth: 1,
    })
  })

  it('preserves parent.options.maxTokens regardless of the routed provider/model', () => {
    const parent = fakeAgent({
      options: { provider: 'frozen', model: 'frozen-model', maxTokens: 8192 },
      agentDefaultModel: { currentSelection: () => ({ provider: 'live', model: 'live-model' }) },
    })
    expect(resolveChildAgentOptions(parent, undefined, 1)).toEqual({
      provider: 'live',
      model: 'live-model',
      maxTokens: 8192,
      subagentDepth: 1,
    })
  })

  it('stamps subagentDepth on the resolved options', () => {
    const parent = fakeAgent({
      options: { provider: 'p', model: 'm' },
    })
    expect(resolveChildAgentOptions(parent, undefined, 7)).toMatchObject({ subagentDepth: 7 })
  })

  it('omits undefined fields when no source carries provider/model', () => {
    const parent = fakeAgent({ options: {} })
    expect(resolveChildAgentOptions(parent, undefined, 0)).toEqual({
      subagentDepth: 0,
    })
  })

  it('keeps backward-compatible behavior when no live source is composed', () => {
    const parent = fakeAgent({
      options: { provider: 'legacy', model: 'legacy-model', maxTokens: 1024 },
    })
    expect(resolveChildAgentOptions(parent, undefined, 1)).toEqual({
      provider: 'legacy',
      model: 'legacy-model',
      maxTokens: 1024,
      subagentDepth: 1,
    })
  })
})
