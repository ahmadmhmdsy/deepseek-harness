import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'

const binScript = fileURLToPath(new URL('./fixtures/keyless-driver.ts', import.meta.url))
const configPath = fileURLToPath(new URL('../cordis.yml', import.meta.url))
const tsconfigPath = fileURLToPath(new URL('../../../../../../tsconfig.json', import.meta.url))
const hasKey = Boolean(process.env.DEEPSEEK_API_KEY)

describe.skipIf(!hasKey)('app-builder with real model', () => {
  it('asks the App Builder agent to scaffold a fresh project and inspects the workspace', async () => {
    let scaffolded = false
    const { stdout } = await runLoaderSmoke({
      label: 'app-builder real model',
      tempDirPrefix: 'app-builder-real-',
      binScript,
      libBinScript: binScript,
      configPath,
      binArgs: [
        configPath,
        'Use app_builder_scaffold to create a fresh svelte-spa project called demo-app under the session cwd, with npmInstall: false. Then call app_builder_preview against demo-app with framework: unknown and readyTimeoutMs: 10000. Report the preview URL.',
      ],
      tsconfigPath,
      processTimeoutMs: 180_000,
      inspect: async (cwd) => {
        const files = await readdir(join(cwd, 'demo-app'), { recursive: true })
        scaffolded = files.some(file => file.endsWith('package.json'))
      },
    })
    expect(scaffolded).toBe(true)
    expect(stdout.trim().length).toBeGreaterThan(0)
  }, 195_000)
})
