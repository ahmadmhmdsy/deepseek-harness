/**
 * REAL Loader composition proof for the Phase 2.5 option-2 preview Remote
 * stream. Boots a test-only cordis.yml through the Loader, mounts every
 * peer service the new method consumes (project registry, session +
 * projection fixtures + token-meter), then `ctx.plugin`s the AppBuilderApi
 * class service. The snapshot bridge is applied as a function plugin
 * directly (not via the YAML loader) so the FakeWebServer Service mounts
 * in the same fiber as the bridge's `apply` and the inject check
 * `ctx.webServer` resolves to the fake.
 *
 * The stream opens with one `snapshot` frame (the bridge's current
 * `devServers` map, filtered by `projectId` when requested) and then
 * yields `event` frames as `app-builder-preview/dev-state` transitions
 * land. Tests exercise both paths:
 *
 *  - the snapshot frame is sourced from a populated bridge;
 *  - the event stream faithfully mirrors the upstream events for
 *    `starting`, `ready`, and `failed` transitions;
 *  - the `projectId` filter applies to both the snapshot and the events;
 *  - the listener disposes on `signal.abort()` and emits a closing
 *    `closed` frame;
 *  - the stream is a no-op when the snapshot bridge is unmounted
 *    (the deployment shape stays uniform for bundles that omit the bridge);
 *  - dev-state events whose `rootPath` matches no registered project
 *    are dropped.
 *
 * No real dev server runs in this rig: the tests emit
 * `app-builder-preview/dev-state` events directly through `ctx.emit`
 * to simulate the preview tool. Mocked: only `ctx.sessionController`
 * (the BFF does not exercise session paths here).
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import SessionStore from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import * as AppBuilderProjectPlugin from '@deepseek-ai/dsh-app-builder-project'
import { apply as applySnapshotBridge } from '@deepseek-ai/dsh-app-builder-snapshot-bridge'
import * as TokenMeterPlugin from '@deepseek-ai/dsh-token-meter'
import * as AppBuilderApiPlugin from '@deepseek-ai/dsh-app-builder-api'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

class FakeSessionController extends Service {
  static override name = 'sessionController'

  constructor(ctx: Context) {
    super(ctx, 'sessionController')
  }

  async create(): Promise<{ sessionId: string }> {
    return { sessionId: 'session-test' }
  }

  async prompt(req: { sessionId: string; content: string }): Promise<{ sessionId: string; seq: number }> {
    return { sessionId: req.sessionId, seq: 1 }
  }

  async page(): Promise<{ header: unknown; cursor: number; records: readonly unknown[]; hasMore: boolean }> {
    return { header: { id: 'session-test' }, cursor: 0, records: [], hasMore: false }
  }

  async fork(): Promise<{ sourceSessionId: string; newSessionId: string; anchorSeq: number }> {
    return { sourceSessionId: 'session-test', newSessionId: 'forked-test', anchorSeq: 0 }
  }

  async inspect(): Promise<{ meta: unknown }> {
    return { meta: { id: 'session-test', resumed: true } }
  }

  async *follow(): AsyncIterable<unknown> {
    yield { type: 'snapshot', header: { id: 'session-test' }, cursor: 0, records: [], hasMore: false }
  }
}

class FakeWebServer extends Service {
  static override name = 'webServer'

  constructor(ctx: Context) {
    super(ctx, 'webServer')
  }

  register(): () => void {
    return () => undefined
  }
}

interface PreviewFrame {
  readonly type: string
  readonly cursor?: number
  readonly records?: readonly { readonly projectId: string; readonly status: string; readonly url?: string }[]
  readonly event?: {
    readonly type: string
    readonly record: { readonly projectId: string; readonly status: string; readonly url?: string }
    readonly reason?: string
  }
  readonly reason?: string
}

interface BridgeEntry {
  readonly rootPath: string
  readonly status: 'starting' | 'ready' | 'failed'
  readonly framework: 'next' | 'vite' | 'unknown'
  readonly url?: string
  readonly port?: number
  readonly message?: string
  readonly reason?: string
  readonly sinceMs: number
}

async function loadYaml(options: { withBridge?: boolean } = {}): Promise<{ ctx: Context }> {
  root = await mkdtemp(join(tmpdir(), 'dsh-app-builder-api-preview-stream-'))
  const configPath = join(root, 'cordis.yml')
  const yamlLines: string[] = [
    "- name: '@deepseek-ai/dsh-session'",
    "- name: '@deepseek-ai/dsh-session-projection'",
    "- name: '@deepseek-ai/dsh-token-meter'",
    "- name: '@deepseek-ai/dsh-app-builder-project'",
  ]
  await writeFile(configPath, yamlLines.join('\n') + '\n', 'utf8')

  context = new Context()
  context.baseUrl = pathToFileURL(root).href + '/'
  await context.plugin(Loader)
  context.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-session', SessionStore],
    ['@deepseek-ai/dsh-session-projection', SessionProjectionRegistry],
    ['@deepseek-ai/dsh-token-meter', TokenMeterPlugin],
    ['@deepseek-ai/dsh-app-builder-project', AppBuilderProjectPlugin],
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
  new FakeSessionController(context)
  if (options.withBridge ?? true) {
    // Apply the bridge directly so the FakeWebServer Service (registered
    // in this same fiber) satisfies the bridge's `ctx.webServer` access.
    new FakeWebServer(context)
    applySnapshotBridge(context)
  }
  await context.plugin(AppBuilderApiPlugin.default as unknown as new (ctx: Context) => { namespace: string })
  return { ctx: context! }
}

async function seedProject(name: string): Promise<{ id: string; rootPath: string }> {
  if (root === undefined) throw new Error('seedProject called outside loadYaml')
  const projectRoot = join(root, name)
  await mkdir(projectRoot, { recursive: true })
  await writeFile(join(projectRoot, 'package.json'), JSON.stringify({ name, version: '0.0.0' }, null, 2), 'utf8')
  await writeFile(join(projectRoot, 'index.ts'), 'export const hello = 1\n', 'utf8')
  const projectRegistry = context!.get('appBuilderProjects') as {
    create(req: { name: string; rootPath: string; stack: 'nextjs-app' }): Promise<{ id: string; rootPath: string }>
  }
  const project = await projectRegistry.create({ name, rootPath: projectRoot, stack: 'nextjs-app' })
  return project
}

async function consume(
  stream: AsyncIterable<PreviewFrame>,
  ctrl: AbortController,
  stopAfter: number,
): Promise<PreviewFrame[]> {
  const collected: PreviewFrame[] = []
  const consumer = (async () => {
    for await (const f of stream) {
      collected.push(f)
      if (collected.length >= stopAfter) break
    }
  })()
  await Promise.race([
    consumer,
    new Promise<void>((_, reject) => {
      setTimeout(() => reject(new Error('subscriber timed out')), 4000)
    }),
  ])
  ctrl.abort()
  await consumer.catch(() => undefined)
  return collected
}

describe('@deepseek-ai/dsh-app-builder-api Phase 2.5 option-2 preview stream', () => {
  it('subscribePreview opens with an empty snapshot on a fresh bridge', async () => {
    const { ctx } = await loadYaml()
    const api = ctx.get('appBuilderApi') as {
      subscribePreview(req: { projectId?: string }, signal: AbortSignal): AsyncIterable<PreviewFrame>
    }
    const ctrl = new AbortController()
    const collected = await consume(api.subscribePreview({}, ctrl.signal), ctrl, 1)
    expect(collected[0]?.type).toBe('snapshot')
    expect(collected[0]?.records).toEqual([])
  })

  it('subscribePreview returns an empty snapshot when the bridge is unmounted', async () => {
    const { ctx } = await loadYaml({ withBridge: false })
    const api = ctx.get('appBuilderApi') as {
      subscribePreview(req: { projectId?: string }, signal: AbortSignal): AsyncIterable<PreviewFrame>
    }
    const ctrl = new AbortController()
    const collected = await consume(api.subscribePreview({}, ctrl.signal), ctrl, 1)
    expect(collected[0]?.type).toBe('snapshot')
    expect(collected[0]?.records).toEqual([])
  })

  it('subscribePreview surfaces a prior dev-state transition in its snapshot', async () => {
    const { ctx } = await loadYaml()
    const project = await seedProject('proj-snap')
    const entry: BridgeEntry = {
      rootPath: project.rootPath,
      status: 'ready',
      framework: 'vite',
      url: 'http://127.0.0.1:5173/',
      port: 5173,
      message: 'framework: vite',
      sinceMs: 1700,
    }
    await ctx.emit('app-builder-preview/dev-state', entry)
    await new Promise<void>((r) => { setImmediate(r) })
    const api = ctx.get('appBuilderApi') as {
      subscribePreview(req: { projectId?: string }, signal: AbortSignal): AsyncIterable<PreviewFrame>
    }
    const ctrl = new AbortController()
    const collected = await consume(api.subscribePreview({}, ctrl.signal), ctrl, 1)
    const snapshot = collected[0]
    expect(snapshot?.type).toBe('snapshot')
    expect(snapshot?.records).toHaveLength(1)
    expect(snapshot?.records?.[0]?.projectId).toBe(project.id)
    expect(snapshot?.records?.[0]?.status).toBe('ready')
    expect(snapshot?.records?.[0]?.url).toBe('http://127.0.0.1:5173/')
  })

  it('subscribePreview yields starting then ready for sequential dev-state emissions', async () => {
    const { ctx } = await loadYaml()
    const project = await seedProject('proj-stream')
    const api = ctx.get('appBuilderApi') as {
      subscribePreview(req: { projectId?: string }, signal: AbortSignal): AsyncIterable<PreviewFrame>
    }
    const ctrl = new AbortController()
    const stream = api.subscribePreview({}, ctrl.signal)
    const collected: PreviewFrame[] = []
    const consumer = (async () => {
      for await (const f of stream) {
        collected.push(f)
        if (collected.length >= 3) break
      }
    })()
    await new Promise<void>((r) => { setTimeout(r, 30) })
    await ctx.emit('app-builder-preview/dev-state', {
      rootPath: project.rootPath,
      status: 'starting',
      framework: 'next',
      port: 3000,
      message: 'framework: next',
      sinceMs: 1000,
    } satisfies BridgeEntry)
    await ctx.emit('app-builder-preview/dev-state', {
      rootPath: project.rootPath,
      status: 'ready',
      framework: 'next',
      url: 'http://127.0.0.1:3000/',
      port: 3000,
      message: 'framework: next',
      sinceMs: 1200,
    } satisfies BridgeEntry)
    await Promise.race([
      consumer,
      new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error('subscriber timed out')), 4000)
      }),
    ])
    ctrl.abort()
    await consumer.catch(() => undefined)
    expect(collected[0]?.type).toBe('snapshot')
    const events = collected.filter(f => f.type === 'event')
    expect(events.length).toBe(2)
    expect(events[0]?.event?.type).toBe('starting')
    expect(events[0]?.event?.record.status).toBe('starting')
    expect(events[1]?.event?.type).toBe('ready')
    expect(events[1]?.event?.record.status).toBe('ready')
    expect(events[1]?.event?.record.url).toBe('http://127.0.0.1:3000/')
  })

  it('subscribePreview yields a failed event with the upstream reason', async () => {
    const { ctx } = await loadYaml()
    const project = await seedProject('proj-fail')
    const api = ctx.get('appBuilderApi') as {
      subscribePreview(req: { projectId?: string }, signal: AbortSignal): AsyncIterable<PreviewFrame>
    }
    const ctrl = new AbortController()
    const stream = api.subscribePreview({}, ctrl.signal)
    const collected: PreviewFrame[] = []
    const consumer = (async () => {
      for await (const f of stream) {
        collected.push(f)
      }
    })()
    await new Promise<void>((r) => { setTimeout(r, 30) })
    await ctx.emit('app-builder-preview/dev-state', {
      rootPath: project.rootPath,
      status: 'failed',
      framework: 'vite',
      port: 5173,
      reason: 'readiness timeout',
      message: 'framework: vite',
      sinceMs: 500,
    } satisfies BridgeEntry)
    await new Promise<void>((r) => { setTimeout(r, 30) })
    ctrl.abort()
    await consumer.catch(() => undefined)
    const failed = collected.find(f => f.type === 'event')
    expect(failed?.event?.type).toBe('failed')
    expect(failed?.event?.reason).toBe('readiness timeout')
    expect(failed?.event?.record.status).toBe('failed')
  })

  it('subscribePreview with a projectId filter omits other projects from snapshot and events', async () => {
    const { ctx } = await loadYaml()
    const a = await seedProject('proj-filter-a')
    const b = await seedProject('proj-filter-b')
    await ctx.emit('app-builder-preview/dev-state', {
      rootPath: a.rootPath, status: 'ready', framework: 'vite',
      url: 'http://127.0.0.1:5173/', port: 5173, message: 'framework: vite', sinceMs: 1,
    } satisfies BridgeEntry)
    await ctx.emit('app-builder-preview/dev-state', {
      rootPath: b.rootPath, status: 'starting', framework: 'next', port: 3000, message: 'framework: next', sinceMs: 2,
    } satisfies BridgeEntry)
    await new Promise<void>((r) => { setImmediate(r) })
    const api = ctx.get('appBuilderApi') as {
      subscribePreview(req: { projectId?: string }, signal: AbortSignal): AsyncIterable<PreviewFrame>
    }
    const ctrl = new AbortController()
    const stream = api.subscribePreview({ projectId: a.id }, ctrl.signal)
    const collected: PreviewFrame[] = []
    const consumer = (async () => {
      for await (const f of stream) {
        collected.push(f)
      }
    })()
    await new Promise<void>((r) => { setTimeout(r, 30) })
    await ctx.emit('app-builder-preview/dev-state', {
      rootPath: b.rootPath, status: 'ready', framework: 'next',
      url: 'http://127.0.0.1:3000/', port: 3000, message: 'framework: next', sinceMs: 3,
    } satisfies BridgeEntry)
    await new Promise<void>((r) => { setTimeout(r, 30) })
    ctrl.abort()
    await consumer.catch(() => undefined)
    const snapshot = collected[0]
    expect(snapshot?.records).toHaveLength(1)
    expect(snapshot?.records?.[0]?.projectId).toBe(a.id)
    const events = collected.filter(f => f.type === 'event')
    expect(events).toEqual([])
  })

  it('subscribePreview drops dev-state events whose rootPath matches no project', async () => {
    const { ctx } = await loadYaml()
    const api = ctx.get('appBuilderApi') as {
      subscribePreview(req: { projectId?: string }, signal: AbortSignal): AsyncIterable<PreviewFrame>
    }
    const ctrl = new AbortController()
    const stream = api.subscribePreview({}, ctrl.signal)
    const collected: PreviewFrame[] = []
    const consumer = (async () => {
      for await (const f of stream) {
        collected.push(f)
      }
    })()
    await new Promise<void>((r) => { setTimeout(r, 30) })
    await ctx.emit('app-builder-preview/dev-state', {
      rootPath: '/tmp/hand-built-dir',
      status: 'ready',
      framework: 'unknown',
      url: 'http://127.0.0.1:4000/',
      port: 4000,
      message: 'framework: unknown',
      sinceMs: 9,
    } satisfies BridgeEntry)
    await new Promise<void>((r) => { setTimeout(r, 30) })
    ctrl.abort()
    await consumer.catch(() => undefined)
    expect(collected[0]?.type).toBe('snapshot')
    const events = collected.filter(f => f.type === 'event')
    expect(events).toEqual([])
  })

  it('subscribePreview closes the stream with reason cancelled when the signal aborts', async () => {
    const { ctx } = await loadYaml()
    const api = ctx.get('appBuilderApi') as {
      subscribePreview(req: { projectId?: string }, signal: AbortSignal): AsyncIterable<PreviewFrame>
    }
    const ctrl = new AbortController()
    const collected: PreviewFrame[] = []
    const consumer = (async () => {
      for await (const f of api.subscribePreview({}, ctrl.signal)) {
        collected.push(f)
        if (collected.some(c => c.type === 'closed')) break
      }
    })()
    await new Promise<void>((r) => { setTimeout(r, 20) })
    ctrl.abort()
    await Promise.race([
      consumer,
      new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error('subscriber timed out')), 4000)
      }),
    ])
    await consumer.catch(() => undefined)
    const closing = collected.find(f => f.type === 'closed')
    expect(closing?.reason).toBe('cancelled')
  })

  it('subscribePreview keeps the filtered event stream open across a new transition', async () => {
    const { ctx } = await loadYaml()
    const a = await seedProject('proj-live-a')
    await ctx.emit('app-builder-preview/dev-state', {
      rootPath: a.rootPath, status: 'ready', framework: 'vite',
      url: 'http://127.0.0.1:5173/', port: 5173, message: 'framework: vite', sinceMs: 4,
    } satisfies BridgeEntry)
    await new Promise<void>((r) => { setImmediate(r) })
    const api = ctx.get('appBuilderApi') as {
      subscribePreview(req: { projectId?: string }, signal: AbortSignal): AsyncIterable<PreviewFrame>
    }
    const ctrl = new AbortController()
    const stream = api.subscribePreview({ projectId: a.id }, ctrl.signal)
    const collected: PreviewFrame[] = []
    const consumer = (async () => {
      for await (const f of stream) {
        collected.push(f)
        if (collected.some(c => c.type === 'event')) break
      }
    })()
    await new Promise<void>((r) => { setTimeout(r, 30) })
    await ctx.emit('app-builder-preview/dev-state', {
      rootPath: a.rootPath, status: 'starting', framework: 'vite',
      port: 5174, message: 'framework: vite', sinceMs: 5,
    } satisfies BridgeEntry)
    await Promise.race([
      consumer,
      new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error('subscriber timed out')), 4000)
      }),
    ])
    ctrl.abort()
    await consumer.catch(() => undefined)
    const event = collected.find(f => f.type === 'event')
    expect(event?.event?.record.projectId).toBe(a.id)
    expect(event?.event?.type).toBe('starting')
  })

  it('subscribePreview is present on the AppBuilderApi class prototype', () => {
    const ctor = AppBuilderApiPlugin.default as unknown as { prototype: Record<string, unknown> }
    expect(typeof ctor.prototype['subscribePreview']).toBe('function')
  })
})
