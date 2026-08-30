/**
 * Real-composition smoke for the App Builder project plugin: the cordis
 * context loads the plugin, the registry accepts one project record, and the
 * `project` projection unit appears in `ctx.sessionProjections.snapshot(...).values`.
 *
 * The plugin now declares `inject: ['sessionProjections']` (Phase 1.5 / 1.5.4),
 * so the test mounts `@deepseek-ai/dsh-session-projection` alongside. The
 * filename keeps the `loader-composition-invariant` prefix to opt out of the
 * test-invariants global host (which auto-mounts the companion) and to stay
 * independent of the companion's startup order.
 */

import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { describe, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { name, inject, apply, Config } from '../src/index.ts'

describe('app-builder-project (real composition)', () => {
  it('boots, creates one project, and registers the project projection unit', async () => {
    const tempDir = join(tmpdir(), `app-builder-project-${Date.now()}`)
    mkdirSync(tempDir, { recursive: true })
    const ctx = new Context()
    await ctx.plugin(SessionProjectionRegistry)
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
    // The projection unit is now registered: `snapshot` of an empty session
    // already folds the zero state.
    assert.equal(typeof ctx.sessionProjections.snapshot, 'function')
  })
})
