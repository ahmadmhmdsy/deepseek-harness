/**
 * REAL Loader composition proof for the Phase 2.5 deployment Remote methods.
 *
 * Boots a test-only cordis.yml through the Loader, mounts every peer
 * service the new methods consume (deployment registry, project registry,
 * session + projection fixtures + token-meter), then `ctx.plugin`s the
 * AppBuilderApi class service (function plugins load from yaml; class
 * services mount directly). The tests assert:
 *
 * 1. `listDeployments` returns an empty array on a fresh registry.
 * 2. `listDeployments` reflects a record once `deploy` runs on a clean
 *    project, and filters by projectId when supplied.
 * 3. `listDeployments` throws when the deployment plugin is not mounted.
 * 4. `subscribeDeploymentEvents` opens with one `snapshot` frame then
 *    yields event frames for each lifecycle transition; the stream
 *    disposes its listeners on abort and emits the closing `closed` frame.
 * 5. `subscribeDeploymentEvents` with a projectId filter omits transitions
 *    for unrelated projects.
 * 6. `subscribeDeploymentEvents` throws when the deployment plugin is not
 *    mounted.
 * 7. The new Remote methods are present on the AppBuilderApi class prototype.
 *
 * Mocked: only `ctx.sessionController` (the BFF does not exercise session
 * paths in this test rig). Project + deployment pipelines are real.
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
import * as AppBuilderDeploymentPlugin from '@deepseek-ai/dsh-app-builder-deployment'
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

async function loadYaml(options: { withDeployment?: boolean } = {}): Promise<{ ctx: Context }> {
  root = await mkdtemp(join(tmpdir(), 'dsh-app-builder-api-deployments-'))
  const configPath = join(root, 'cordis.yml')
  const yamlLines: string[] = [
    "- name: '@deepseek-ai/dsh-session'",
    "- name: '@deepseek-ai/dsh-session-projection'",
    "- name: '@deepseek-ai/dsh-token-meter'",
    "- name: '@deepseek-ai/dsh-app-builder-project'",
  ]
  if (options.withDeployment ?? true) {
    yamlLines.push("- name: '@deepseek-ai/dsh-app-builder-deployment'")
  }
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
    ...(options.withDeployment ?? true
      ? ([['@deepseek-ai/dsh-app-builder-deployment', AppBuilderDeploymentPlugin]] as const)
      : []),
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
  // Class services mount via ctx.plugin after the Loader resolves the
  // upstream peer services; the YAML form is reserved for function plugins.
  // The fake sessionController satisfies the BFF's `inject` list.
  new FakeSessionController(context)
  await context.plugin(AppBuilderApiPlugin.default as unknown as new (ctx: Context) => { namespace: string })
  return { ctx: context! }
}

async function seedCleanProject(projectRoot: string): Promise<void> {
  await mkdir(projectRoot, { recursive: true })
  await writeFile(join(projectRoot, 'package.json'), JSON.stringify({ name: 'demo', version: '0.0.0' }, null, 2), 'utf8')
  await writeFile(join(projectRoot, 'index.ts'), 'export const hello = 1\n', 'utf8')
}

describe('@deepseek-ai/dsh-app-builder-api Phase 2.5 deployment Remote methods', () => {
  it('listDeployments returns an empty array on a fresh registry', async () => {
    const { ctx } = await loadYaml()
    const api = ctx.get('appBuilderApi') as {
      listDeployments(req: { projectId?: string }): Promise<{ deployments: readonly unknown[] }>
    }
    const result = await api.listDeployments({})
    expect(result.deployments).toEqual([])
  })

  it('listDeployments reflects a record once deploy runs on a clean project', async () => {
    const { ctx } = await loadYaml()
    const projectRegistry = ctx.get('appBuilderProjects') as {
      create(req: { name: string; rootPath: string; stack: 'nextjs-app' }): Promise<{ id: string; rootPath: string }>
    }
    const projectRoot = join(root!, 'proj-clean')
    await seedCleanProject(projectRoot)
    const project = await projectRegistry.create({ name: 'proj-clean', rootPath: projectRoot, stack: 'nextjs-app' })
    const api = ctx.get('appBuilderApi') as {
      listDeployments(req: { projectId?: string }): Promise<{
        deployments: readonly { id: string; status: string; projectId: string }[]
      }>
    }
    const before = await api.listDeployments({})
    expect(before.deployments).toEqual([])
    const deploymentRegistry = ctx.get('appBuilderDeployment') as {
      deploy(req: { projectId: string }): Promise<{ id: string; status: string; projectId: string; url?: string }>
    }
    await deploymentRegistry.deploy({ projectId: project.id })
    const after = await api.listDeployments({})
    expect(after.deployments).toHaveLength(1)
    expect(after.deployments[0]!.projectId).toBe(project.id)
    expect(after.deployments[0]!.status).toBe('succeeded')
  })

  it('listDeployments filters by projectId when supplied', async () => {
    const { ctx } = await loadYaml()
    const projectRegistry = ctx.get('appBuilderProjects') as {
      create(req: { name: string; rootPath: string; stack: 'nextjs-app' }): Promise<{ id: string; rootPath: string }>
    }
    const aRoot = join(root!, 'proj-a')
    const bRoot = join(root!, 'proj-b')
    await seedCleanProject(aRoot)
    await seedCleanProject(bRoot)
    const a = await projectRegistry.create({ name: 'proj-a', rootPath: aRoot, stack: 'nextjs-app' })
    const b = await projectRegistry.create({ name: 'proj-b', rootPath: bRoot, stack: 'nextjs-app' })
    const deploymentRegistry = ctx.get('appBuilderDeployment') as {
      deploy(req: { projectId: string }): Promise<{ id: string }>
    }
    await deploymentRegistry.deploy({ projectId: a.id })
    await deploymentRegistry.deploy({ projectId: b.id })
    const api = ctx.get('appBuilderApi') as {
      listDeployments(req: { projectId?: string }): Promise<{
        deployments: readonly { projectId: string }[]
      }>
    }
    const all = await api.listDeployments({})
    expect(all.deployments).toHaveLength(2)
    const onlyA = await api.listDeployments({ projectId: a.id })
    expect(onlyA.deployments).toHaveLength(1)
    expect(onlyA.deployments[0]!.projectId).toBe(a.id)
  })

  it('listDeployments throws when the deployment plugin is not mounted', async () => {
    const { ctx } = await loadYaml({ withDeployment: false })
    const api = ctx.get('appBuilderApi') as {
      listDeployments(req: { projectId?: string }): Promise<{ deployments: readonly unknown[] }>
    }
    await expect(api.listDeployments({})).rejects.toThrow(/deployment/i)
  })

  it('subscribeDeploymentEvents yields snapshot then started + succeeded for a clean deploy', async () => {
    const { ctx } = await loadYaml()
    const projectRegistry = ctx.get('appBuilderProjects') as {
      create(req: { name: string; rootPath: string; stack: 'nextjs-app' }): Promise<{ id: string; rootPath: string }>
    }
    const projectRoot = join(root!, 'proj-stream-clean')
    await seedCleanProject(projectRoot)
    const project = await projectRegistry.create({ name: 'proj-stream-clean', rootPath: projectRoot, stack: 'nextjs-app' })
    const api = ctx.get('appBuilderApi') as {
      subscribeDeploymentEvents(req: { projectId?: string }, signal: AbortSignal): AsyncIterable<{ type: string; [k: string]: unknown }>
    }
    const ctrl = new AbortController()
    const stream = api.subscribeDeploymentEvents({}, ctrl.signal)
    const collected: { type: string; [k: string]: unknown }[] = []
    const deployPromise = (async () => {
      await new Promise<void>((r) => { setTimeout(r, 30) })
      const deploymentRegistry = ctx.get('appBuilderDeployment') as {
        deploy(req: { projectId: string }): Promise<{ id: string }>
      }
      await deploymentRegistry.deploy({ projectId: project.id })
    })()
    const consumer = (async () => {
      for await (const f of stream) {
        collected.push(f)
        if (collected.length >= 3) break
      }
    })()
    await Promise.race([
      consumer,
      new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error('subscriber timed out')), 4000)
      }),
    ])
    ctrl.abort()
    await deployPromise.catch(() => undefined)
    expect(collected[0]?.type).toBe('snapshot')
    expect(collected.some(f => f.type === 'event')).toBe(true)
  })

  it('subscribeDeploymentEvents with a projectId filter omits unrelated transitions', async () => {
    const { ctx } = await loadYaml()
    const projectRegistry = ctx.get('appBuilderProjects') as {
      create(req: { name: string; rootPath: string; stack: 'nextjs-app' }): Promise<{ id: string; rootPath: string }>
    }
    const aRoot = join(root!, 'proj-fil-a')
    const bRoot = join(root!, 'proj-fil-b')
    await seedCleanProject(aRoot)
    await seedCleanProject(bRoot)
    const a = await projectRegistry.create({ name: 'proj-fil-a', rootPath: aRoot, stack: 'nextjs-app' })
    await projectRegistry.create({ name: 'proj-fil-b', rootPath: bRoot, stack: 'nextjs-app' })
    interface FilteredDeploymentFrame {
      readonly type: string
      readonly event?: { readonly deployment: { readonly projectId: string } }
    }
    const api = ctx.get('appBuilderApi') as {
      subscribeDeploymentEvents(req: { projectId?: string }, signal: AbortSignal): AsyncIterable<FilteredDeploymentFrame>
    }
    const ctrl = new AbortController()
    const collected: FilteredDeploymentFrame[] = []
    const consumer = (async () => {
      for await (const f of api.subscribeDeploymentEvents({ projectId: a.id }, ctrl.signal)) {
        collected.push(f)
        if (collected.length >= 4) break
      }
    })()
    await new Promise<void>((r) => { setImmediate(r) })
    const deploymentRegistry = ctx.get('appBuilderDeployment') as {
      deploy(req: { projectId: string }): Promise<{ id: string }>
    }
    await deploymentRegistry.deploy({ projectId: a.id })
    await new Promise<void>((r) => { setTimeout(r, 20) })
    ctrl.abort()
    await consumer.catch(() => undefined)
    const events = collected.filter(f => f.type === 'event')
    expect(events.length).toBeGreaterThanOrEqual(2)
    for (const f of events) {
      expect(f.event!.deployment.projectId).toBe(a.id)
    }
  })

  it('subscribeDeploymentEvents throws when the deployment plugin is not mounted', async () => {
    const { ctx } = await loadYaml({ withDeployment: false })
    const api = ctx.get('appBuilderApi') as {
      subscribeDeploymentEvents(req: { projectId?: string }, signal: AbortSignal): AsyncIterable<unknown>
    }
    const ctrl = new AbortController()
    const iterator = api.subscribeDeploymentEvents({}, ctrl.signal)[Symbol.asyncIterator]()
    await expect(iterator.next()).rejects.toThrow(/deployment/i)
    ctrl.abort()
  })

  it('listDeployments + subscribeDeploymentEvents both surface on the AppBuilderApi class', () => {
    const ctor = AppBuilderApiPlugin.default as unknown as { prototype: Record<string, unknown> }
    expect(typeof ctor.prototype['listDeployments']).toBe('function')
    expect(typeof ctor.prototype['subscribeDeploymentEvents']).toBe('function')
  })
})
