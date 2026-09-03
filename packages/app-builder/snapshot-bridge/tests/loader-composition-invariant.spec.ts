/**
 * Real-composition smoke for the App Builder snapshot bridge: the plugin
 * registers the snapshot route, mirrors `project/created` events into the
 * in-memory snapshot, and serves a 503 until the first flush and a 200 after.
 *
 * The filename contains `invariant` to opt out of the test-invariants
 * global host (the bridge ships a no-op companion and we exercise it through
 * the direct PluginFiber path here).
 *
 * The `webServer` service is mocked with a tiny stand-in that captures
 * registered routes; the bridge never depends on a listening socket, so this
 * exercises the route handler in isolation. The project registry uses the
 * real plugin.
 */

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strict as assert } from 'node:assert'
import { afterEach, describe, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import * as Project from '@deepseek-ai/dsh-app-builder-project'
import { name, inject, apply, Config, SNAPSHOT_URL_PATH, EMPTY_SNAPSHOT } from '../src/index.ts'

/** Minimal WebServer stand-in: a plain object with just the `register` shape; bypasses Service auto-registration. */
function makeFakeWebServer(): {
  routes: Map<string, (req: unknown, res: {
    writeHead: (status: number, headers?: Record<string, string>) => void
    end: (body?: string) => void
  }) => void>
  register(route: { kind: 'exact' | 'prefix'; path: string; handler: (req: unknown, res: unknown) => void }): () => void
} {
  const routes = new Map<string, (req: unknown, res: unknown) => void>()
  return {
    routes,
    register(route) {
      if (route.kind !== 'exact') throw new Error('fake: only exact routes supported')
      routes.set(route.path, route.handler)
      return () => { routes.delete(route.path) }
    },
  }
}

let tempDir: string | undefined

afterEach(async () => {
  if (tempDir !== undefined) await rm(tempDir, { recursive: true, force: true })
  tempDir = undefined
})

describe('app-builder-snapshot-bridge (real composition)', () => {
  it('serves the empty snapshot before any project exists and 200 after project/created', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'app-builder-snapshot-bridge-'))
    const projectDir = join(tempDir, 'demo')
    await mkdir(projectDir, { recursive: true })
    await writeFile(join(tempDir, 'marker'), 'present')

    const ctx = new Context()
    await ctx.plugin({ name: Project.name, inject: Project.inject, apply: Project.apply }, Project.Config({}))

    const fake = makeFakeWebServer()
    ctx.provide('webServer', fake)
    await ctx.plugin({ name, inject, apply }, Config({ snapshotUrlPath: SNAPSHOT_URL_PATH }))

    const handler = fake.routes.get(SNAPSHOT_URL_PATH)
    assert.ok(handler !== undefined, 'route not registered: ' + SNAPSHOT_URL_PATH)

    const pre = captureResponse()
    handler({}, pre)
    assert.equal(pre.status, 200)
    const emptyBody = JSON.parse(pre.body ?? '{}') as { projects: unknown[]; devServers: Record<string, unknown>; ts: number }
    assert.equal(emptyBody.projects.length, 0)
    assert.deepEqual(emptyBody.devServers, {})
    assert.ok(emptyBody.ts > 0)

    const project = await ctx.appBuilderProjects.create({
      name: 'demo',
      rootPath: projectDir,
      stack: 'svelte-spa',
    })
    const post = captureResponse()
    handler({}, post)
    assert.equal(post.status, 200)
    const body = JSON.parse(post.body ?? '{}') as { ts: number; projects: { id: string; name: string; rootPath: string }[]; devServers: Record<string, unknown> }
    assert.ok(body.ts > 0)
    assert.equal(body.projects.length, 1)
    assert.equal(body.projects[0]?.id, project.id)
    assert.equal(body.projects[0]?.name, 'demo')
    assert.equal(body.projects[0]?.rootPath, projectDir)
    assert.deepEqual(body.devServers, {})

    assert.equal(EMPTY_SNAPSHOT.ts, 0)
    assert.equal(EMPTY_SNAPSHOT.projects.length, 0)
    assert.deepEqual(EMPTY_SNAPSHOT.devServers, {})
  })

  it('writes the snapshot file under the configured path', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'app-builder-snapshot-bridge-fs-'))
    const projectDir = join(tempDir, 'demo')
    await mkdir(projectDir, { recursive: true })
    const snapshotPath = join(tempDir, 'state', 'app-builder-snapshot.json')

    const ctx = new Context()
    await ctx.plugin({ name: Project.name, inject: Project.inject, apply: Project.apply }, Project.Config({}))

    const fake = makeFakeWebServer()
    ctx.provide('webServer', fake)
    await ctx.plugin(
      { name, inject, apply },
      Config({ snapshotPath, snapshotUrlPath: SNAPSHOT_URL_PATH }),
    )

    await ctx.appBuilderProjects.create({
      name: 'demo',
      rootPath: projectDir,
      stack: 'nextjs-pages',
    })

    // Poll the file until the bridge has written it (fire-and-forget async).
    const fsPromises = await import('node:fs/promises')
    let written: { projects: { name: string }[] } = { projects: [] }
    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        await fsPromises.stat(snapshotPath)
        written = JSON.parse(await fsPromises.readFile(snapshotPath, 'utf8')) as { projects: { name: string }[] }
        if (written.projects.length === 1) break
      } catch {
        /* file not yet written; try again */
      }
      await new Promise<void>((resolve) => { setTimeout(resolve, 10) })
    }
    assert.equal(written.projects.length, 1)
    assert.equal(written.projects[0]?.name, 'demo')
  })
})

/** Capture writeHead + end calls so the bridge handler can be asserted on. */
function captureResponse() {
  const captured = {
    status: 0,
    body: undefined as string | undefined,
    headers: undefined as Record<string, string> | undefined,
    writeHead(status: number, headers?: Record<string, string>) {
      this.status = status
      this.headers = headers
    },
    end(body?: string) {
      this.body = body
    },
  }
  return captured
}
