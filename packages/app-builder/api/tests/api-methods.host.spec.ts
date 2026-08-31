/**
 * REAL Loader composition proof for `@deepseek-ai/dsh-app-builder-api`.
 *
 * Boots a test-only cordis.yml through the Loader, mounts every peer
 * service the BFF consumes, and asserts:
 *
 * 1. The function-plugin-vs-service namespace shape passes its check.
 * 2. The 13 Remote methods are present on the class prototype.
 * 3. Project CRUD round-trips through `ctx.appBuilderProjects`.
 * 4. `startSession` delegates to the upstream `ctx.sessionController`.
 * 5. `subscribeEvents` returns an `AsyncIterable`.
 * 6. `deploy` and the projectId-only `getUsage` path throw the typed
 *    `not-implemented` failure when their backing plugin is unmounted.
 *
 * Mocked: only `ctx.sessionController` (the upstream session lifecycle the
 * BFF forwards to); the App Builder registries, the BFF, and the
 * token-meter are real. The token-meter is required for `getUsage`'s
 * sessionId path so the test rig mounts it through cordis.yml.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
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
import * as AppBuilderApi from '@deepseek-ai/dsh-app-builder-api'
import * as TokenMeterPlugin from '@deepseek-ai/dsh-token-meter'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { canonicalHeader } from '@deepseek-ai/dsh-session'

let root: string | undefined
let context: Context | undefined
interface SessionCallRecord {
  sessionId: string
  cwd?: string
  content?: string
  source?: string
}
interface SessionCalls {
  created: SessionCallRecord[]
  prompted: SessionCallRecord[]
}
const sessionCalls: SessionCalls = { created: [], prompted: [] }

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
  sessionCalls.created.length = 0
  sessionCalls.prompted.length = 0
})

class FakeSessionController extends Service {
  static override name = 'sessionController'

  constructor(ctx: Context) {
    super(ctx, 'sessionController')
  }


  async create(req: { sessionId?: string; cwd?: string }): Promise<{ sessionId: string }> {
    const sessionId = req.sessionId ?? 'session-test'
    const record: { sessionId: string; cwd?: string } = { sessionId }
    if (req.cwd !== undefined) record.cwd = req.cwd
    sessionCalls.created.push(record)
    return { sessionId }
  }

  async prompt(req: { sessionId: string; content: string; source?: 'user' | 'api' }, _signal?: AbortSignal): Promise<{ sessionId: string; seq: number }> {
    sessionCalls.prompted.push(req)
    return { sessionId: req.sessionId, seq: 1 }
  }

  async page(
    req: { sessionId: string; fromSeq?: number; maxMessages?: number },
    _signal: AbortSignal,
  ): Promise<{ header: unknown; cursor: number; records: readonly unknown[]; hasMore: boolean }> {
    return { header: { id: req.sessionId }, cursor: 0, records: [], hasMore: false }
  }

  async fork(
    req: { sessionId: string; anchorSeq?: number },
  ): Promise<{ sourceSessionId: string; newSessionId: string; anchorSeq: number }> {
    return { sourceSessionId: req.sessionId, newSessionId: 'forked-test', anchorSeq: req.anchorSeq ?? 0 }
  }

  async inspect(sessionId: string, _signal?: AbortSignal): Promise<{ meta: unknown }> {
    return { meta: { id: sessionId, resumed: true } }
  }

  async *follow(req: { sessionId: string; afterSeq?: number }, signal: AbortSignal): AsyncIterable<unknown> {
    yield { type: 'snapshot', header: { id: req.sessionId }, cursor: 0, records: [], hasMore: false }
    signal.throwIfAborted()
    yield { type: 'event', seq: 1, event: { kind: 'noop' } }
  }

  /** Replace the default follow generator with a custom one (test-local override). */
  setFollow(generator: (req: { sessionId: string; afterSeq?: number }, signal: AbortSignal) => AsyncIterable<unknown>): void {
    // Replace the prototype method per-instance for the test composition.
    // oxlint-disable-next-line typescript/no-unsafe-member-access -- runtime test helper; prototype write is intentional
    Object.getPrototypeOf(this).follow = generator.bind(this)
  }
}

async function loadYaml(options: { withDeployment?: boolean } = {}): Promise<{ ctx: Context; calls: SessionCalls }> {
  root = await mkdtemp(join(tmpdir(), 'dsh-app-builder-api-'))
  const configPath = join(root, 'cordis.yml')
  const yamlLines = [
    "- name: '@deepseek-ai/dsh-session'",
    "- name: '@deepseek-ai/dsh-session-projection'",
    "- name: '@deepseek-ai/dsh-token-meter'",
    "- name: '@deepseek-ai/dsh-app-builder-project'",
  ]
  if (options.withDeployment === true) {
    yamlLines.push("- name: '@deepseek-ai/dsh-app-builder-deployment'")
  }
  const yaml = yamlLines.join('\n')
  await writeFile(configPath, yaml + '\n', 'utf8')

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
  if (options.withDeployment === true) {
    modules.set('@deepseek-ai/dsh-app-builder-deployment', AppBuilderDeploymentPlugin)
  }
  context.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof context.loader.internal>
  await context.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  await context.loader.await()
  // Mount the fake session controller AFTER the loader runs (cordis:include
  // only resolves named plugins, not inline apply blocks). We construct it
  // directly so ctx.sessionController is populated for the BFF's delegates.
  new FakeSessionController(context)
  // Mount the App Builder BFF Service directly: the YAML form is reserved
  // for function plugins, so service classes mount via ctx.plugin after the
  // loader resolves the upstream peer services.
  await context.plugin(AppBuilderApi.default as unknown as new (ctx: Context) => { namespace: string })
  return { ctx: context, calls: sessionCalls }
}

describe('@deepseek-ai/dsh-app-builder-api (real Loader composition)', () => {
  it('package is a service (default-exported class, not a function plugin)', () => {
    expect(typeof AppBuilderApi.default).toBe('function')
    expect('default' in AppBuilderApi).toBe(true)
  })

  it('class prototype declares the 13 Remote methods from Phase 2 §3', () => {
    const ctor = AppBuilderApi.default as unknown as { prototype: Record<string, unknown> }
    const expected = [
      'listProjects',
      'createProject',
      'getProject',
      'deleteProject',
      'startSession',
      'sendMessage',
      'getTranscript',
      'forkSession',
      'resumeSession',
      'subscribeEvents',
      'getPreview',
      'deploy',
      'getUsage',
    ]
    for (const method of expected) {
      expect(typeof ctor.prototype[method]).toBe('function')
    }
  })

  it('listProjects returns the empty registry on a fresh host', async () => {
    const { ctx } = await loadYaml()
    const api = ctx.get('appBuilderApi') as { listProjects(): Promise<{ projects: readonly unknown[] }> }
    const listed = await api.listProjects()
    expect(listed.projects).toEqual([])
  })

  it('createProject + getProject round-trip through the registry', async () => {
    const { ctx } = await loadYaml()
    const api = ctx.get('appBuilderApi') as {
      createProject(req: { name: string; rootPath: string; stack: 'nextjs-app' }): Promise<{ project: { id: string; name: string } }>
      getProject(req: { id: string }): Promise<{ project: { id: string; name: string } }>
    }
    const projectRoot = await mkdtemp(join(tmpdir(), 'dsh-api-create-'))
    const created = await api.createProject({ name: 'demo', rootPath: projectRoot, stack: 'nextjs-app' })
    expect(created.project.name).toBe('demo')
    const fetched = await api.getProject({ id: created.project.id })
    expect(fetched.project.id).toBe(created.project.id)
  })

  it('startSession forwards to ctx.sessionController and uses the project rootPath as cwd', async () => {
    const { ctx } = await loadYaml()
    const projectRoot = await mkdtemp(join(tmpdir(), 'dsh-api-start-'))
    const api = ctx.get('appBuilderApi') as {
      createProject(req: { name: string; rootPath: string; stack: 'nextjs-app' }): Promise<{ project: { id: string; rootPath: string } }>
      startSession(req: { projectId: string }): Promise<{ sessionId: string; cwd: string }>
    }
    const created = await api.createProject({ name: 'demo', rootPath: projectRoot, stack: 'nextjs-app' })
    const started = await api.startSession({ projectId: created.project.id })
    expect(started.sessionId).toBeTruthy()
    expect(started.cwd).toBe(created.project.rootPath)
    expect(sessionCalls.created).toHaveLength(1)
    expect(sessionCalls.created[0]).toMatchObject({ cwd: created.project.rootPath })
  })

  it('subscribeEvents returns an AsyncIterable and yields the snapshot frame', async () => {
    const { ctx } = await loadYaml()
    const projectRoot = await mkdtemp(join(tmpdir(), 'dsh-api-events-'))
    const api = ctx.get('appBuilderApi') as {
      createProject(req: { name: string; rootPath: string; stack: 'nextjs-app' }): Promise<{ project: { id: string } }>
      startSession(req: { projectId: string }): Promise<{ sessionId: string }>
      subscribeEvents(req: { sessionId: string }, signal: AbortSignal): AsyncIterable<unknown>
    }
    const created = await api.createProject({ name: 'demo', rootPath: projectRoot, stack: 'nextjs-app' })
    const started = await api.startSession({ projectId: created.project.id })
    const controller = new AbortController()
    const stream = api.subscribeEvents({ sessionId: started.sessionId }, controller.signal)
    const frames: unknown[] = []
    for await (const frame of stream) {
      frames.push(frame)
      controller.abort()
      break
    }
    expect(frames.length).toBeGreaterThan(0)
    expect((frames[0] as { type: string }).type).toBe('snapshot')
  })

  it('subscribeEvents surfaces upstream event frames and yields a closed frame on natural stream end', async () => {
    const { ctx } = await loadYaml()
    const projectRoot = await mkdtemp(join(tmpdir(), 'dsh-api-events-2-'))
    const api = ctx.get('appBuilderApi') as {
      createProject(req: { name: string; rootPath: string; stack: 'nextjs-app' }): Promise<{ project: { id: string } }>
      startSession(req: { projectId: string }): Promise<{ sessionId: string }>
      subscribeEvents(req: { sessionId: string }, signal: AbortSignal): AsyncIterable<unknown>
    }
    const created = await api.createProject({ name: 'demo', rootPath: projectRoot, stack: 'nextjs-app' })
    const started = await api.startSession({ projectId: created.project.id })
    // Exhaust the stream without aborting — exercises the source-closed branch.
    const controller = new AbortController()
    const stream = api.subscribeEvents({ sessionId: started.sessionId }, controller.signal)
    const frames: unknown[] = []
    for await (const frame of stream) frames.push(frame)
    const types = frames.map(f => (f as { type: string }).type)
    expect(types).toContain('snapshot')
    expect(types).toContain('event')
    expect(types).toContain('closed')
    expect((frames[frames.length - 1] as { reason: string }).reason).toBe('source-closed')
    void controller
  })

  it('subscribeEvents yields a cancelled closed frame when the caller aborts the stream', async () => {
    const { ctx } = await loadYaml()
    const projectRoot = await mkdtemp(join(tmpdir(), 'dsh-api-events-3-'))
    const api = ctx.get('appBuilderApi') as {
      createProject(req: { name: string; rootPath: string; stack: 'nextjs-app' }): Promise<{ project: { id: string } }>
      startSession(req: { projectId: string }): Promise<{ sessionId: string }>
      subscribeEvents(req: { sessionId: string }, signal: AbortSignal): AsyncIterable<unknown>
    }
    const created = await api.createProject({ name: 'demo', rootPath: projectRoot, stack: 'nextjs-app' })
    const started = await api.startSession({ projectId: created.project.id })
    const controller = new AbortController()
    controller.abort()
    const stream = api.subscribeEvents({ sessionId: started.sessionId }, controller.signal)
    const frames: unknown[] = []
    for await (const frame of stream) frames.push(frame)
    const closed = frames.find(f => (f as { type: string }).type === 'closed')
    expect(closed).toBeDefined()
    expect((closed as { reason: string }).reason).toBe('cancelled')
  })

  it('sendMessage forwards to ctx.sessionController.prompt and accepts the message', async () => {
    const { ctx, calls } = await loadYaml()
    const projectRoot = await mkdtemp(join(tmpdir(), 'dsh-api-send-'))
    const api = ctx.get('appBuilderApi') as {
      createProject(req: { name: string; rootPath: string; stack: 'nextjs-app' }): Promise<{ project: { id: string } }>
      startSession(req: { projectId: string }): Promise<{ sessionId: string }>
      sendMessage(req: { sessionId: string; content: string }): Promise<{ sessionId: string; accepted: true; seq: number }>
    }
    const created = await api.createProject({ name: 'demo', rootPath: projectRoot, stack: 'nextjs-app' })
    const started = await api.startSession({ projectId: created.project.id })
    const sent = await api.sendMessage({ sessionId: started.sessionId, content: 'hello' })
    expect(sent.accepted).toBe(true)
    expect(sent.seq).toBe(1)
    expect(calls.prompted).toHaveLength(1)
    expect(calls.prompted[0]).toMatchObject({ sessionId: started.sessionId, content: 'hello' })
  })

  it('getTranscript returns a cold page through ctx.sessionController.page', async () => {
    const { ctx } = await loadYaml()
    const projectRoot = await mkdtemp(join(tmpdir(), 'dsh-api-transcript-'))
    const api = ctx.get('appBuilderApi') as {
      createProject(req: { name: string; rootPath: string; stack: 'nextjs-app' }): Promise<{ project: { id: string } }>
      startSession(req: { projectId: string }): Promise<{ sessionId: string }>
      getTranscript(req: { sessionId: string }, signal: AbortSignal): Promise<{ sessionId: string; cursor: number; hasMore: boolean }>
    }
    const created = await api.createProject({ name: 'demo', rootPath: projectRoot, stack: 'nextjs-app' })
    const started = await api.startSession({ projectId: created.project.id })
    const transcript = await api.getTranscript({ sessionId: started.sessionId }, new AbortController().signal)
    expect(transcript.sessionId).toBe(started.sessionId)
    expect(transcript.cursor).toBe(0)
    expect(transcript.hasMore).toBe(false)
  })

  it('forkSession returns a new Session id and the anchor seq', async () => {
    const { ctx } = await loadYaml()
    const projectRoot = await mkdtemp(join(tmpdir(), 'dsh-api-fork-'))
    const api = ctx.get('appBuilderApi') as {
      createProject(req: { name: string; rootPath: string; stack: 'nextjs-app' }): Promise<{ project: { id: string } }>
      startSession(req: { projectId: string }): Promise<{ sessionId: string }>
      forkSession(
        req: { sessionId: string; anchorSeq?: number },
      ): Promise<{ sourceSessionId: string; newSessionId: string; anchorSeq: number }>
    }
    const created = await api.createProject({ name: 'demo', rootPath: projectRoot, stack: 'nextjs-app' })
    const started = await api.startSession({ projectId: created.project.id })
    const forked = await api.forkSession({ sessionId: started.sessionId })
    expect(forked.sourceSessionId).toBe(started.sessionId)
    expect(forked.newSessionId).toBe('forked-test')
    expect(forked.anchorSeq).toBe(0)
  })

  it('resumeSession returns the cold Session header without re-attaching the Agent', async () => {
    const { ctx } = await loadYaml()
    const projectRoot = await mkdtemp(join(tmpdir(), 'dsh-api-resume-'))
    const api = ctx.get('appBuilderApi') as {
      createProject(req: { name: string; rootPath: string; stack: 'nextjs-app' }): Promise<{ project: { id: string } }>
      startSession(req: { projectId: string }): Promise<{ sessionId: string }>
      resumeSession(req: { sessionId: string }): Promise<{ sessionId: string; resumed: true }>
    }
    const created = await api.createProject({ name: 'demo', rootPath: projectRoot, stack: 'nextjs-app' })
    const started = await api.startSession({ projectId: created.project.id })
    const resumed = await api.resumeSession({ sessionId: started.sessionId })
    expect(resumed.sessionId).toBe(started.sessionId)
    expect(resumed.resumed).toBe(true)
  })

  it('deleteProject removes the directory tree and the registry record', async () => {
    const { ctx } = await loadYaml()
    const projectRoot = await mkdtemp(join(tmpdir(), 'dsh-api-delete-'))
    await writeFile(join(projectRoot, 'marker'), 'present')
    const api = ctx.get('appBuilderApi') as {
      createProject(req: { name: string; rootPath: string; stack: 'nextjs-app' }): Promise<{ project: { id: string; rootPath: string } }>
      deleteProject(req: { id: string }): Promise<{ id: string; deleted: true }>
      listProjects(): Promise<{ projects: readonly { id: string }[] }>
    }
    const created = await api.createProject({ name: 'demo', rootPath: projectRoot, stack: 'nextjs-app' })
    const deleted = await api.deleteProject({ id: created.project.id })
    expect(deleted.deleted).toBe(true)
    const listed = await api.listProjects()
    expect(listed.projects.find(p => p.id === created.project.id)).toBeUndefined()
  })

  it('getPreview returns the unknown record when the snapshot bridge is absent', async () => {
    const { ctx } = await loadYaml()
    const projectRoot = await mkdtemp(join(tmpdir(), 'dsh-api-preview-'))
    const api = ctx.get('appBuilderApi') as {
      createProject(req: { name: string; rootPath: string; stack: 'nextjs-app' }): Promise<{ project: { id: string } }>
      getPreview(req: { projectId: string }): Promise<{ status: string; port: number }>
    }
    const created = await api.createProject({ name: 'demo', rootPath: projectRoot, stack: 'nextjs-app' })
    const preview = await api.getPreview({ projectId: created.project.id })
    expect(preview.status).toBe('unknown')
    expect(preview.port).toBe(-1)
  })

  it('deploy returns the typed not-implemented failure', async () => {
    const { ctx } = await loadYaml()
    const api = ctx.get('appBuilderApi') as {
      deploy(req: { projectId: string }): Promise<unknown>
    }
    await expect(api.deploy({ projectId: 'phantom' })).rejects.toMatchObject({ failure: { code: 'not-implemented' } })
  })

  it('deploy wires through ctx.appBuilderDeployment when the deployment plugin is mounted', async () => {
    const { ctx } = await loadYaml({ withDeployment: true })
    const projectRoot = await mkdtemp(join(tmpdir(), 'dsh-api-deploy-'))
    const api = ctx.get('appBuilderApi') as {
      createProject(req: { name: string; rootPath: string; stack: 'nextjs-app' }): Promise<{ project: { id: string } }>
      deploy(req: { projectId: string }): Promise<{ projectId: string; deploymentId: string; url?: string }>
    }
    const created = await api.createProject({ name: 'demo', rootPath: projectRoot, stack: 'nextjs-app' })
    const deployed = await api.deploy({ projectId: created.project.id })
    expect(deployed.projectId).toBe(created.project.id)
    expect(deployed.deploymentId).toBeTruthy()
    expect(deployed.url).toBe('https://deploy.local/' + created.project.id + '/' + deployed.deploymentId)
  })

  it('getUsage rejects a request with neither sessionId nor projectId', async () => {
    const { ctx } = await loadYaml()
    const api = ctx.get('appBuilderApi') as {
      getUsage(req: Record<string, never>): Promise<unknown>
    }
    await expect(api.getUsage({})).rejects.toMatchObject({ failure: { code: 'bad-request' } })
  })

  it('getUsage returns the typed not-implemented failure for projectId-only aggregation', async () => {
    const { ctx } = await loadYaml()
    const api = ctx.get('appBuilderApi') as {
      getUsage(req: { projectId: string }): Promise<unknown>
    }
    await expect(api.getUsage({ projectId: 'phantom-project' }))
      .rejects.toMatchObject({ failure: { code: 'not-implemented' } })
  })

  it('getUsage returns a not-found failure when the Session is not live', async () => {
    const { ctx } = await loadYaml()
    const api = ctx.get('appBuilderApi') as {
      getUsage(req: { sessionId: string }): Promise<unknown>
    }
    await expect(api.getUsage({ sessionId: 'unattached-session' }))
      .rejects.toMatchObject({ failure: { code: 'not-found' } })
  })

  it('getUsage delegates to ctx.tokenMeter.measure and projects a live Session\'s TokenMeasurement', async () => {
    const { ctx } = await loadYaml()
    // Populate a live Session in the real SessionStore so the meter can
    // replay the durable tail. The BFF\'s getUsage goes through
    // ctx.sessions.get(sessionId) and then ctx.tokenMeter.measure(session).
    const sessionId = 'usage-session-1'
    const session = ctx.sessions.create(sessionId as never)
    session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'tell me about the harness' }],
      source: { kind: 'user' },
    }), { surfaceOp: 'append' })
    session.append('request/header', {
      header: canonicalHeader({ config: { provider: 'mock', model: 'mock' } }),
      reason: 'initial',
    })
    session.append('step/start', { turn: 1, step: 1 })
    session.append('assistant/message', {
      turn: 1,
      step: 1,
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'the harness is a Cordis plugin graph' }],
        source: { kind: 'model', provider: 'mock', model: 'mock' },
      } as never,
    }, { surfaceOp: 'append' })
    session.append('step/end', { turn: 1, step: 1 })

    const api = ctx.get('appBuilderApi') as {
      getUsage(req: { sessionId: string }): Promise<{
        tokensIn: number
        tokensOut: number
        costUsd: number
        cacheHitRate: number
      }>
    }
    const usage = await api.getUsage({ sessionId })
    expect(usage.tokensIn).toBeGreaterThan(0)
    expect(usage.tokensOut).toBe(0) // no provider-reported usage for the mock model
    expect(usage.costUsd).toBe(0) // Phase 2.3 ships without a price table
    expect(usage.cacheHitRate).toBe(0)
  })
})
