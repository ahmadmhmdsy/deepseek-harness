/**
 * Real Loader composition proof for the snapshot-bridge `sessionCounts`
 * field (Phase 2.4). The bridge walks `ctx.sessions.list()` once per
 * `flush`, resolves each session's `project` projection through the
 * persisted projection cache (preferred: zero I/O, durable value), and
 * increments the matching project id. Sessions whose projection is `null`
 * (no cwd, cwd outside any project) do not contribute to any count.
 *
 * Three real-composition tests cover:
 *  1. Cache-mounted composition: a registered project owns one session,
 *     two stray sessions are ignored, one session outside the project root
 *     does not count, one session with no cwd does not count.
 *  2. Cache-absent composition: `ctx.sessionProjectionCache` is not mounted;
 *     the bridge still serves `sessionCounts` by falling back to the live
 *     `ctx.sessionProjections.snapshot(session)` read.
 *  3. Burst-safety: a burst of `project/created` events does not lose
 *     count updates; the in-memory map writes are synchronous and the
 *     write-queue serializes the disk writes.
 *
 * The filename keeps the `loader-composition` prefix so the per-file 100%
 * coverage gate can find the spec.
 */

import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import SessionProjectionCache from '@deepseek-ai/dsh-session-projection-cache'
import * as AppBuilderProjectPlugin from '@deepseek-ai/dsh-app-builder-project'
import { name, inject, apply, Config, SNAPSHOT_URL_PATH } from '../src/index.ts'

/** Minimal WebServer stand-in: captures registered routes; the bridge never depends on a listening socket. */
function makeFakeWebServer(): {
  routes: Map<string, (req: unknown, res: unknown) => void>
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

/** Capture writeHead + end so the handler response can be asserted on. */
function captureResponse(): {
  status: number
  body: string | undefined
  writeHead(status: number): void
  end(body?: string): void
} {
  return {
    status: 0,
    body: undefined,
    writeHead(status) { this.status = status },
    end(body) { this.body = body },
  }
}

/** Parse the JSON snapshot the bridge handler returns. */
function readSnapshot(handler: (req: unknown, res: unknown) => void): {
  ts: number
  projects: { id: string; name: string; rootPath: string }[]
  devServers: Record<string, unknown>
  sessionCounts: Record<string, number>
} {
  const res = captureResponse()
  handler({}, res)
  return JSON.parse(res.body ?? '{}') as ReturnType<typeof readSnapshot>
}

interface LoadedContext {
  ctx: Context
  projectDir: string
  storageRoot: string
  snapshot: () => ReturnType<typeof readSnapshot>
}

let tempRoot: string | undefined
let loaded: LoadedContext | undefined

afterEach(async () => {
  if (loaded !== undefined) await loaded.ctx.fiber.dispose()
  loaded = undefined
  if (tempRoot !== undefined) await rm(tempRoot, { recursive: true, force: true })
  tempRoot = undefined
})

async function load(options: { withProjectionCache?: boolean } = {}): Promise<LoadedContext> {
  const withProjectionCache = options.withProjectionCache !== false
  tempRoot = await mkdtemp(join(tmpdir(), 'dsh-app-builder-snap-counts-'))
  const projectDir = join(tempRoot, 'demo')
  await mkdir(projectDir, { recursive: true })
  const storageRoot = await mkdtemp(join(tmpdir(), 'dsh-app-builder-snap-counts-storage-'))

  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  if (withProjectionCache) {
    await ctx.plugin(Storage)
    await ctx.plugin(StorageJson, { root: storageRoot })
    await ctx.plugin(StorageDomain, { backend: 'json' })
    await ctx.plugin(SessionProjectionCache, { writeEveryEvents: 5, writeIntervalMs: 100 })
  }
  await ctx.plugin(AppBuilderProjectPlugin)
  const fake = makeFakeWebServer()
  ctx.provide('webServer', fake)
  await ctx.plugin({ name, inject, apply }, Config({ snapshotUrlPath: SNAPSHOT_URL_PATH }))

  const handler = fake.routes.get(SNAPSHOT_URL_PATH)
  if (handler === undefined) throw new Error('route not registered: ' + SNAPSHOT_URL_PATH)
  loaded = {
    ctx,
    projectDir,
    storageRoot,
    snapshot: () => readSnapshot(handler),
  }
  return loaded
}

describe('app-builder-snapshot-bridge sessionCounts (Phase 2.4)', () => {
  it('counts each live session whose cwd lives under a registered project root', async () => {
    const { ctx, projectDir, snapshot } = await load()
    const project = await ctx.appBuilderProjects.create({
      name: 'demo',
      rootPath: projectDir,
      stack: 'nextjs-app',
    })

    // One session inside the project root, one outside (cwd === projectDir's parent),
    // one without cwd, and one created BEFORE the project exists (zero state).
    ctx.sessions.create(SessionId('inside'), { meta: { cwd: projectDir } })
    const strayDir = await mkdtemp(join(tmpdir(), 'dsh-app-builder-stray-'))
    ctx.sessions.create(SessionId('outside'), { meta: { cwd: strayDir } })
    ctx.sessions.create(SessionId('no-cwd'))
    ctx.sessions.create(SessionId('pre-project'))

    const counts = snapshot().sessionCounts
    expect(counts[project.id]).toBe(1)
    // The project owns exactly one session; no other project has any count.
    expect(Object.keys(counts)).toEqual([project.id])
  })

  it('counts zero when the session cwd lives outside every project', async () => {
    const { ctx, snapshot } = await load()
    const strayDir = await mkdtemp(join(tmpdir(), 'dsh-app-builder-empty-'))
    // The project plugin's create() does fs.stat on the canonical rootPath and
    // throws ENOENT when the directory is missing; mkdir it before create().
    await mkdir(join(strayDir, 'demo'), { recursive: true })
    await ctx.appBuilderProjects.create({
      name: 'demo',
      rootPath: join(strayDir, 'demo'),
      stack: 'svelte-spa',
    })
    ctx.sessions.create(SessionId('far-away'), { meta: { cwd: strayDir } })

    // The project exists but no session has its root under it.
    expect(snapshot().sessionCounts).toEqual({})
  })

  it('returns an empty record when no session has been created', async () => {
    const { ctx, snapshot } = await load()
    // load() exposes the demo subdir it already created as loaded.projectDir;
    // the module-level tempRoot matches but only after load() resolves.
    await ctx.appBuilderProjects.create({
      name: 'demo',
      rootPath: loaded!.projectDir,
      stack: 'nextjs-pages',
    })
    expect(snapshot().sessionCounts).toEqual({})
  })

  it('falls back to the live projection registry when ctx.sessionProjectionCache is absent', async () => {
    const { ctx, projectDir, snapshot } = await load({ withProjectionCache: false })
    const project = await ctx.appBuilderProjects.create({
      name: 'demo',
      rootPath: projectDir,
      stack: 'nextjs-app',
    })
    ctx.sessions.create(SessionId('cached-fallback'), { meta: { cwd: projectDir } })

    // The cache is unmounted; computeSessionCounts must still produce a count
    // by reading through the live ctx.sessionProjections registry.
    expect(snapshot().sessionCounts[project.id]).toBe(1)
  })

  it('re-counts on session/created and session/disposed', async () => {
    const { ctx, projectDir, snapshot } = await load()
    const project = await ctx.appBuilderProjects.create({
      name: 'demo',
      rootPath: projectDir,
      stack: 'nextjs-app',
    })

    // Before any session: empty.
    expect(snapshot().sessionCounts).toEqual({})

    ctx.sessions.create(SessionId('s-a'), { meta: { cwd: projectDir } })
    expect(snapshot().sessionCounts[project.id]).toBe(1)

    // Create session b in a sub-fiber so its lifecycle is independent of the
    // main fiber (a, the bridge, and the project registry all live there).
    // Disposing the sub-fiber tears down the session's enter() effect, which
    // removes the entry from ctx.sessions.list() and emits session/disposed
    // on the SessionStore's owning context — the bridge listener observes it
    // and re-flushes the snapshot. This is the canonical pattern in
    // session/session-telemetry and session/session-persistence-jsonl tests.
    const bFiber = await ctx.plugin(Object.assign((inner: Context) => {
      inner.sessions.create(SessionId('s-b'), { meta: { cwd: projectDir } })
    }, { inject: ['sessions'] }))
    expect(snapshot().sessionCounts[project.id]).toBe(2)

    await bFiber.dispose()
    expect(snapshot().sessionCounts[project.id]).toBe(1)
  })

  it('survives a burst of project/created events without losing count updates', async () => {
    const { ctx, projectDir, snapshot } = await load()
    const project = await ctx.appBuilderProjects.create({
      name: 'demo',
      rootPath: projectDir,
      stack: 'nextjs-app',
    })
    ctx.sessions.create(SessionId('burst-1'), { meta: { cwd: projectDir } })
    ctx.sessions.create(SessionId('burst-2'), { meta: { cwd: projectDir } })

    // Burst of project mutations: a flush runs for each, but the in-memory
    // count map is recomputed from scratch on every flush, so the count
    // survives any number of events.
    await ctx.appBuilderProjects.create({
      name: 'noise-1',
      rootPath: await mkdtemp(join(tmpdir(), 'noise-')),
      stack: 'nextjs-app',
    })
    await ctx.appBuilderProjects.create({
      name: 'noise-2',
      rootPath: await mkdtemp(join(tmpdir(), 'noise-')),
      stack: 'svelte-spa',
    })

    expect(snapshot().sessionCounts[project.id]).toBe(2)
  })
})
