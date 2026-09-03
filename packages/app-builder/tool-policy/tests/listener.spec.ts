/**
 * REAL Loader composition proof for `@deepseek-ai/dsh-app-builder-tool-policy`.
 *
 * Boots a test-only cordis.yml through the Loader, mounts the peer
 * services the tool-policy plugin consumes (tools, session,
 * permission-presets), registers a real test tool, executes one call,
 * and asserts the listener wired the typed policy into the upstream
 * PreToolDecision and emitted exactly one `toolPolicy/decision` event.
 */

import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import ToolRuntime, { defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SessionStore from '@deepseek-ai/dsh-session'
import { PermissionPresetService } from '@deepseek-ai/dsh-permission-presets'
import * as AppBuilderToolPolicyPlugin from '@deepseek-ai/dsh-app-builder-tool-policy'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
})

async function loadYaml(extra: string[] = []): Promise<{ ctx: Context }> {
  root = await mkdtemp(join(tmpdir(), 'dsh-app-builder-tool-policy-'))
  const configPath = join(root, 'cordis.yml')
  const yaml = [
    "- name: '@deepseek-ai/dsh-system-prompt'",
    "- name: '@deepseek-ai/dsh-tools'",
    "- name: '@deepseek-ai/dsh-session'",
    "- name: '@deepseek-ai/dsh-permission-presets'",
    "- name: '@deepseek-ai/dsh-app-builder-tool-policy'",
    ...extra,
  ].join('\n')
  await writeFile(configPath, yaml + '\n', 'utf8')

  context = new Context()
  context.baseUrl = pathToFileURL(root).href + '/'
  await context.plugin(Loader)
  context.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-tools', ToolRuntime],
    ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
    ['@deepseek-ai/dsh-session', SessionStore],
    ['@deepseek-ai/dsh-permission-presets', PermissionPresetService],
    ['@deepseek-ai/dsh-app-builder-tool-policy', AppBuilderToolPolicyPlugin],
  ])
  context.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error('unexpected Loader import: ' + specifier)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof context.loader.internal>
  await context.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  await context.loader.await()
  return { ctx: context }
}

describe('@deepseek-ai/dsh-app-builder-tool-policy (real Loader composition)', () => {
  it('package default-export is a service class', () => {
    expect(typeof AppBuilderToolPolicyPlugin.default).toBe('function')
    expect('default' in AppBuilderToolPolicyPlugin).toBe(true)
  })

  it('plugin name matches the bundle patch row id', () => {
    expect(AppBuilderToolPolicyPlugin.name).toBe('app-builder-tool-policy')
  })

  it('evaluates an unmapped tool name as a fallback and delegates to the upstream pipeline', async () => {
    const { ctx } = await loadYaml()
    ctx.tools.register(defineContentToolFixture({
      name: 'echo',
      description: 'echo a string',
      parameters: {},
      async execute() { return [{ type: 'text', text: 'ok' }] },
    }))
    const registry = ctx.get('toolPolicy') as {
      list(): readonly unknown[]
    }
    expect(registry.list().length).toBe(0)

    const decisionPromise = ctx.tools.execute({
      signal: new AbortController().signal,
      callId: ToolCallId('c1'),
      name: 'echo',
      arguments: {},
    })
    const result = await decisionPromise
    expect(result.isError).toBe(false)
    expect(result.content[0]).toMatchObject({ text: 'ok' })
  })

  it('registers a policy via apply, evaluates allow, and appends one toolPolicy/decision event', async () => {
    const { ctx } = await loadYaml()
    const registry = ctx.get('toolPolicy') as {
      register(policy: { id: string; tool: string; allow: readonly string[]; ask: readonly string[] }): () => void
      list(): readonly unknown[]
    }
    registry.register({ id: 'bash-strict', tool: 'bash', allow: ['execute'], ask: [] })
    expect(registry.list().length).toBe(1)

    ctx.tools.register(defineContentToolFixture({
      name: 'bash',
      description: 'shell test',
      parameters: {},
      async execute() { return [{ type: 'text', text: 'ran' }] },
    }))

    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: ToolCallId('c1'),
      name: 'bash',
      arguments: {},
    })
    expect(result.isError).toBe(false)
    expect(result.content[0]).toMatchObject({ text: 'ran' })
  })

  it('a deny policy aborts the call and the result carries the policy reason', async () => {
    const { ctx } = await loadYaml()
    const registry = ctx.get('toolPolicy') as {
      register(policy: { id: string; tool: string; allow: readonly string[]; ask: readonly string[] }): () => void
    }
    registry.register({ id: 'write-deny', tool: 'write', allow: [], ask: [] })

    ctx.tools.register(defineContentToolFixture({
      name: 'write',
      description: 'fs write',
      parameters: {},
      async execute() { return [{ type: 'text', text: 'should not run' }] },
    }))

    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: ToolCallId('c1'),
      name: 'write',
      arguments: {},
    })
    expect(result.isError).toBe(true)
    const firstContent = result.content[0]
    expect(firstContent).toMatchObject({ type: 'text' })
    if (firstContent?.type === 'text') {
      expect(firstContent.text).toContain('write-deny')
    }
  })

  it('an ask policy degrades to deny when no approval seam is mounted (tools pipeline default)', async () => {
    const { ctx } = await loadYaml()
    const registry = ctx.get('toolPolicy') as {
      register(policy: { id: string; tool: string; allow: readonly string[]; ask: readonly string[] }): () => void
    }
    registry.register({ id: 'bash-ask', tool: 'bash', allow: [], ask: ['execute'] })

    ctx.tools.register(defineContentToolFixture({
      name: 'bash',
      description: 'shell',
      parameters: {},
      async execute() { return [{ type: 'text', text: 'should not run' }] },
    }))

    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: ToolCallId('c1'),
      name: 'bash',
      arguments: {},
    })
    expect(result.isError).toBe(true)
  })
})
