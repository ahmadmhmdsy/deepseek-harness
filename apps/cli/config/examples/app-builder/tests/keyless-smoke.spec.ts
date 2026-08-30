import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'
import type { SessionEvent } from '@deepseek-ai/dsh-session'

const binScript = fileURLToPath(new URL('./fixtures/keyless-driver.ts', import.meta.url))
const configPath = fileURLToPath(new URL('./fixtures/keyless.cordis.yml', import.meta.url))
const tsconfigPath = fileURLToPath(new URL('../../../../../../tsconfig.json', import.meta.url))

/**
 * Find the tool call event for one named tool and return its callId.
 */
function findToolCallId(events: SessionEvent[], name: string): string | undefined {
  const call = events.find(event => event.type === 'tool/call' && event.data.name === name)
  if (call?.type !== 'tool/call') return undefined
  return String(call.data.callId)
}

describe('app-builder keyless smoke', () => {
  it('drives scaffold + write through the App Builder bundle, verifies tools and persona', async () => {
    let scaffoldedFiles = ''
    let previewPkgText = ''
    let systemPromptText = ''
    const { stdout, stderr } = await runLoaderSmoke({
      label: 'app-builder',
      tempDirPrefix: 'app-builder-smoke-',
      binScript,
      libBinScript: binScript,
      configPath,
      binArgs: [configPath, 'scaffold a svelte-spa project, override the dev script with our preview-server.js, then list visible App Builder tools'],
      tsconfigPath,
      processTimeoutMs: 60_000,
      inspect: async (cwd) => {
        const files = await readdir(join(cwd, 'smoke-app'), { recursive: true })
        scaffoldedFiles = files.join('\n')
        previewPkgText = await readFile(join(cwd, 'smoke-app', 'package.json'), 'utf8')
      },
    })
    expect(stderr).toBe('')

    // Scaffold wrote the template files (recursive readdir uses backslashes on Windows).
    const normalisedFiles = scaffoldedFiles.replace(/\\/g, '/')
    expect(normalisedFiles).toContain('package.json')
    expect(normalisedFiles).toContain('src/App.svelte')
    expect(normalisedFiles).toContain('index.html')

    // After the read + write calls, the package.json dev script is the
    // Node-only preview-server override.
    expect(previewPkgText).toContain('preview-server.js')

    const streamLines = stdout.trimEnd().split('\n').map(line => JSON.parse(line) as Record<string, unknown>)
    const events = streamLines.slice(0, -1).map(line => line['event'] as SessionEvent)
    const result = streamLines.at(-1)

    // The system prompt carries the App Builder persona + tool list.
    const header = events.find(event => event.type === 'request/header')
    if (header?.type === 'request/header') {
      systemPromptText = JSON.stringify(header.data.header)
    }
    expect(systemPromptText).toContain('app_builder_scaffold')
    expect(systemPromptText).toContain('app_builder_preview')

    // Two model-emitted tool calls in the documented order.
    const toolCallNames = events
      .filter(event => event.type === 'tool/call')
      .map(event => (event.type === 'tool/call' ? event.data.name : ''))
    expect(toolCallNames).toContain('app_builder_scaffold')
    expect(toolCallNames).toContain('write')

    // Scaffold result carries a rootPath that points inside the workspace.
    const scaffoldCallId = findToolCallId(events, 'app_builder_scaffold')
    expect(scaffoldCallId).toBeDefined()
    const scaffoldResultText = events.find((event) => {
      if (event.type !== 'tool/result') return false
      const block = event.data.message.content[0]
      return block?.toolCallId === scaffoldCallId
    })
    expect(scaffoldResultText).toBeDefined()

    // The final assistant text carries the smoke marker.
    expect(String(result?.['output'])).toContain('APP_BUILDER_KEYLESS_SMOKE_OK')
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
