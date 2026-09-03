import type { Context } from '@deepseek-ai/cordis'
import {
  ToolCallId,
  LlmAdapter,
  ReasoningEffortId,
  type GenerateOptions,
  type LlmResolvedModelInfo,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm'

const HIGH = ReasoningEffortId('high')
const OFF = ReasoningEffortId('off')

// Project name the smoke expects the scaffold tool to create. Pinned
// so the inspect step can read the directory back without parsing the
// streamed tool-call JSON.
const SCAFFOLD_PROJECT_NAME = 'smoke-app'

// One tool-call the model has emitted in this turn stream, total.
function countAssistantToolCalls(messages: GenerateOptions['messages']): number {
  let count = 0
  for (const message of messages) {
    if (message.role !== 'assistant') continue
    for (const block of message.content) {
      if (block.type === 'tool-call') count += 1
    }
  }
  return count
}

/**
 * Keyless App Builder adapter: drives one scaffold + write turn.
 *
 * Step 1 emits app_builder_scaffold to materialize a fresh project.
 * Step 2 emits a read call so the fs-observation policy accepts the
 * follow-up write call. Step 3 emits write to replace the scaffolded
 * dev script with a Node-only static server. Step 4 emits a final text
 * marker the inspect step reads back. The preview tool is exercised in
 * the with-key smoke (the keyless path cannot launch a real dev server
 * on a bash-less Windows runner); this keyless mock stops at the scaffold
 * + override pair to verify the tool registry + persona are mounted.
 */
class AppBuilderMockAdapter extends LlmAdapter {
  override async resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return {
      provider,
      id: model,
      name: model,
      reasoning: {
        efforts: [
          { id: OFF, name: 'Off' },
          { id: HIGH, name: 'High' },
        ],
        defaultEffort: HIGH,
      },
    }
  }

  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    if (process.env.DSH_APP_BUILDER_MOCK_FAILURE === '1') {
      yield { type: 'finish', reason: { kind: 'error', failure: { code: 'SERVER', message: 'App Builder mock provider failed' } } }
      return
    }
    const toolCalls = countAssistantToolCalls(options.messages)
    if (toolCalls === 0) {
      // Step 1: scaffold a fresh svelte-spa project under the session cwd.
      const args = JSON.stringify({
        template: 'svelte-spa',
        name: SCAFFOLD_PROJECT_NAME,
        npmInstall: false,
      })
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index: 0, id: ToolCallId('ab-scaffold-call'), name: 'app_builder_scaffold', argumentsDelta: args }
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: ToolCallId('ab-scaffold-call'), name: 'app_builder_scaffold', arguments: args } }
      yield { type: 'usage', usage: { inputTokens: 12, outputTokens: 4, cacheReadTokens: 2 } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    if (toolCalls === 1) {
      // Step 2: read the scaffolded package.json so the fs-observation policy
      // accepts the follow-up write; the read tool emits fs/observed which
      // the write tool then matches against its CAS basis.
      const args = JSON.stringify({
        file_path: SCAFFOLD_PROJECT_NAME + '/package.json',
      })
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index: 0, id: ToolCallId('ab-read-call'), name: 'read', argumentsDelta: args }
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: ToolCallId('ab-read-call'), name: 'read', arguments: args } }
      yield { type: 'usage', usage: { inputTokens: 9, outputTokens: 3, cacheReadTokens: 2 } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    if (toolCalls === 2) {
      // Step 3: rewrite the scaffolded package.json dev script so the
      // preview tool can start the dev server without npm install.
      const devContent = JSON.stringify({
        name: 'app-builder-' + SCAFFOLD_PROJECT_NAME,
        version: '0.1.0',
        private: true,
        scripts: { dev: 'node ../tests/fixtures/preview-server.js' },
      }, null, 2) + '\n'
      const args = JSON.stringify({
        file_path: SCAFFOLD_PROJECT_NAME + '/package.json',
        content: devContent,
      })
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index: 0, id: ToolCallId('ab-write-call'), name: 'write', argumentsDelta: args }
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: ToolCallId('ab-write-call'), name: 'write', arguments: args } }
      yield { type: 'usage', usage: { inputTokens: 9, outputTokens: 3, cacheReadTokens: 2 } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    // Step 4: final text marker.
    const reply = 'APP_BUILDER_KEYLESS_SMOKE_OK tool_calls=' + toolCalls
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: reply }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: reply } }
    yield { type: 'usage', usage: { inputTokens: 6, outputTokens: 5, reasoningTokens: 1 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

export const name = 'app-builder-mock-llm'
export const inject = ['llm']

/** Register the keyless `app-builder-mock` adapter. */
export function apply(ctx: Context): void {
  ctx.llm.registerAdapter(['app-builder-mock'], new AppBuilderMockAdapter())
  ctx.on('agent/request', async ({ step }, next) => {
    const config = await next()
    return step === 4 ? { ...config, reasoningEffort: OFF } : config
  })
}
