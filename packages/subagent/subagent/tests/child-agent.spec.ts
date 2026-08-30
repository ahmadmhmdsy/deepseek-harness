import { describe, expect, it } from 'vitest'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { AgentDefaultModelConfig } from '@deepseek-ai/dsh-agent-default-model'
import type { ModelSelection } from '@deepseek-ai/dsh-agent'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { resolveChildAgentOptions } from '../src/child-agent.ts'

function parentAgent(): Agent {
  const id = SessionId('parent')
  const ctx = {
    get(_name: string): unknown {
      // No live sources composed — exercises the parent.options fallback path.
      return undefined
    },
  }
  return {
    id,
    options: {
      provider: 'parent-provider',
      model: 'parent-model',
      reasoningEffort: ReasoningEffortId('high'),
      maxTokens: 512,
    },
    session: Session.create(id),
    ctx: ctx as unknown as Agent['ctx'],
  } as Agent
}

/** Build a parent Agent whose `ctx.get('agentDefaultModel')` returns a service stub. */
function parentAgentWithDefault(selection: ModelSelection): Agent {
  const id = SessionId('parent')
  const ctx = {
    get(name: string): unknown {
      if (name === 'agentDefaultModel') {
        return { currentSelection: () => selection } satisfies Pick<AgentDefaultModelConfig, 'currentSelection'>
      }
      return undefined
    },
  }
  return {
    id,
    options: {
      provider: 'parent-provider',
      model: 'parent-model',
      reasoningEffort: ReasoningEffortId('high'),
      maxTokens: 512,
    },
    session: Session.create(id),
    ctx: ctx as unknown as Agent['ctx'],
  } as Agent
}

describe('child Agent options', () => {
  it('inherits the parent effort while the exact route is unchanged', () => {
    expect(resolveChildAgentOptions(parentAgent(), undefined, 1)).toEqual({
      provider: 'parent-provider',
      model: 'parent-model',
      reasoningEffort: 'high',
      maxTokens: 512,
      subagentDepth: 1,
    })
  })

  it('clears an inherited effort when the child route changes', () => {
    expect(resolveChildAgentOptions(parentAgent(), { model: 'child-model' }, 1)).toEqual({
      provider: 'parent-provider',
      model: 'child-model',
      maxTokens: 512,
      subagentDepth: 1,
    })
  })

  it('keeps an explicit child effort when the child route changes', () => {
    expect(resolveChildAgentOptions(parentAgent(), {
      provider: 'child-provider',
      model: 'child-model',
      reasoningEffort: ReasoningEffortId('max'),
    }, 1)).toEqual({
      provider: 'child-provider',
      model: 'child-model',
      reasoningEffort: 'max',
      maxTokens: 512,
      subagentDepth: 1,
    })
  })

  it('inherits the latest logged request selection over creation-time values', () => {
    const parent = parentAgent()
    parent.session.append('request/header', {
      header: {
        config: {
          provider: 'current-provider',
          model: 'current-model',
          reasoningEffort: ReasoningEffortId('low'),
        },
      },
      reason: 'initial',
    })

    expect(resolveChildAgentOptions(parent, undefined, 1)).toEqual({
      provider: 'current-provider',
      model: 'current-model',
      reasoningEffort: 'low',
      maxTokens: 512,
      subagentDepth: 1,
    })
  })

  it('inherits the agentDefaultModel live selection before any request is logged', () => {
    // No request/header appended; without a logged header the live default
    // service is the next-precedence live source.
    const parent = parentAgentWithDefault({
      provider: 'live-provider',
      model: 'live-model',
      reasoningEffort: ReasoningEffortId('medium'),
    })

    expect(resolveChildAgentOptions(parent, undefined, 1)).toEqual({
      provider: 'live-provider',
      model: 'live-model',
      reasoningEffort: 'medium',
      maxTokens: 512,
      subagentDepth: 1,
    })
  })

  it('drops the inherited effort when the live default supplies a route without one', () => {
    // The parent's frozen options carry effort 'high', but the live default
    // supplies a route that omits effort. Route-owned effort rule applies:
    // the new model resolves its own default.
    const parent = parentAgentWithDefault({
      provider: 'live-provider',
      model: 'live-model',
    })

    expect(resolveChildAgentOptions(parent, undefined, 1)).toEqual({
      provider: 'live-provider',
      model: 'live-model',
      maxTokens: 512,
      subagentDepth: 1,
    })
  })

  it('prefers the logged request header over the live default selection', () => {
    // Per-field precedence: a logged request/header always wins over the
    // agentDefaultModel.currentSelection() fallback.
    const parent = parentAgentWithDefault({
      provider: 'live-provider',
      model: 'live-model',
    })
    parent.session.append('request/header', {
      header: {
        config: {
          provider: 'logged-provider',
          model: 'logged-model',
          reasoningEffort: ReasoningEffortId('low'),
        },
      },
      reason: 'initial',
    })

    expect(resolveChildAgentOptions(parent, undefined, 1)).toEqual({
      provider: 'logged-provider',
      model: 'logged-model',
      reasoningEffort: 'low',
      maxTokens: 512,
      subagentDepth: 1,
    })
  })

  it('falls back to creation options when neither live source is composed', () => {
    // Rosterless deployment: no request header, no agentDefaultModel service.
    // The parent's frozen options are the only source, matching the legacy
    // behavior preserved for backward compatibility.
    expect(resolveChildAgentOptions(parentAgent(), undefined, 1)).toEqual({
      provider: 'parent-provider',
      model: 'parent-model',
      reasoningEffort: 'high',
      maxTokens: 512,
      subagentDepth: 1,
    })
  })

  it('keeps maxTokens inherited from parent options across every live route source', () => {
    // maxTokens is a budget, not a route; it is never pulled from any live
    // source and always inherits from parent.options.maxTokens.
    const parent = parentAgentWithDefault({
      provider: 'live-provider',
      model: 'live-model',
      reasoningEffort: ReasoningEffortId('low'),
    })

    const resolved = resolveChildAgentOptions(parent, undefined, 1)
    expect(resolved.maxTokens).toBe(512)
  })

  it('still lets the per-tool requested override win over every inherited source', () => {
    const parent = parentAgentWithDefault({
      provider: 'live-provider',
      model: 'live-model',
    })

    expect(resolveChildAgentOptions(parent, {
      provider: 'child-provider',
      model: 'child-model',
      reasoningEffort: ReasoningEffortId('max'),
    }, 1)).toEqual({
      provider: 'child-provider',
      model: 'child-model',
      reasoningEffort: 'max',
      maxTokens: 512,
      subagentDepth: 1,
    })
  })
})
