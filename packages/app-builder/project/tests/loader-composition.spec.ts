/**
 * Real-composition smoke for the App Builder project plugin: the cordis
 * context loads the plugin and the registry accepts one project record.
 */

import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { Context } from '@deepseek-ai/cordis'
import { name, apply, Config } from '../src/index.ts'

describe('app-builder-project (real composition)', () => {
  it('boots and creates one project', async () => {
    const tempDir = join(tmpdir(), `app-builder-project-${Date.now()}`)
    mkdirSync(tempDir, { recursive: true })
    const ctx = new Context()
    await ctx.plugin({ name, inject, apply }, Config({}))
    const created = await ctx.appBuilderProjects.create({
      name: 'hello',
      rootPath: tempDir,
      stack: 'nextjs-app',
    })
    assert.equal(created.name, 'hello')
    assert.equal(created.stack, 'nextjs-app')
    assert.equal(created.rootPath, tempDir)
    assert.ok(ctx.appBuilderProjects.has(created.id))
    assert.equal(ctx.appBuilderProjects.list().length, 1)
  })
})
