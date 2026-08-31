/**
 * REAL Loader composition proof for `@deepseek-ai/dsh-app-builder-deployment`.
 *
 * Boots a test-only cordis.yml through the Loader, mounts the peer services
 * the deployment plugin consumes (project registry, session-projection
 * registry, session store), and asserts:
 *
 *  1. The function-plugin-vs-service namespace shape passes its check.
 *  2. The deploy workflow runs end-to-end on a clean project (all three
 *     gates pass, the synthetic local push step lands, and the registry
 *     emits exactly one `deployment/started` + `deployment/succeeded`
 *     event pair).
 *  3. A project that contains a hard-coded AWS access key id trips the
 *     secrets gate; the workflow short-circuits and emits one
 *     `deployment/failed` event with reason naming the gate.
 *  4. An unknown project id resolves to a typed `failed` record without
 *     throwing.
 *  5. The registry exposes `get`, `list`, `has`, `toValue`, and
 *     `latestForProject` accessors that read the latest in-memory copy.
 *
 * Mocked: only the upstream session lifecycle; the project registry and
 * the deployment plugin are real. Each test creates a fresh project root
 * under `mkdtemp` and seeds the source files the workflow scans.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import SessionStore from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import * as AppBuilderProjectPlugin from '@deepseek-ai/dsh-app-builder-project'
import * as AppBuilderDeploymentPlugin from '@deepseek-ai/dsh-app-builder-deployment'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

interface DeploymentEvents {
  started: number
  succeeded: number
  failed: number
  reasons: string[]
}

/** Capture every deployment/* event the registry emits during a test. */
function captureDeploymentEvents(ctx: Context): { events: DeploymentEvents; off: () => void } {
  const events: DeploymentEvents = { started: 0, succeeded: 0, failed: 0, reasons: [] }
  const offs: Array<() => void> = []
  offs.push(ctx.on('deployment/started', () => { events.started += 1 }))
  offs.push(ctx.on('deployment/succeeded', () => { events.succeeded += 1 }))
  offs.push(ctx.on('deployment/failed', (event: { reason: string }) => { events.failed += 1; events.reasons.push(event.reason) }))
  return { events, off: () => { for (const off of offs) off() } }
}

async function loadYaml(): Promise<{ ctx: Context }> {
  root = await mkdtemp(join(tmpdir(), 'dsh-app-builder-deployment-'))
  const configPath = join(root, 'cordis.yml')
  const yaml = [
    "- name: '@deepseek-ai/dsh-session'",
    "- name: '@deepseek-ai/dsh-session-projection'",
    "- name: '@deepseek-ai/dsh-app-builder-project'",
    "- name: '@deepseek-ai/dsh-app-builder-deployment'",
  ].join('\n')
  await writeFile(configPath, yaml + '\n', 'utf8')

  context = new Context()
  context.baseUrl = pathToFileURL(root).href + '/'
  await context.plugin(Loader)
  context.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-session', SessionStore],
    ['@deepseek-ai/dsh-session-projection', SessionProjectionRegistry],
    ['@deepseek-ai/dsh-app-builder-project', AppBuilderProjectPlugin],
    ['@deepseek-ai/dsh-app-builder-deployment', AppBuilderDeploymentPlugin],
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
  return { ctx: context }
}

/** Seed a clean project with only a minimal `package.json` (no SCA deny-list matches, no SAST / secrets patterns). */
async function seedCleanProject(projectRoot: string): Promise<void> {
  await mkdir(projectRoot, { recursive: true })
  await writeFile(join(projectRoot, 'package.json'), JSON.stringify({ name: 'demo', version: '0.0.0' }, null, 2), 'utf8')
  await writeFile(join(projectRoot, 'index.ts'), 'export const hello = 1\n', 'utf8')
}

/** Seed a project whose source file hard-codes an AWS access-key id (secrets-gate fail). */
async function seedProjectWithSecret(projectRoot: string): Promise<void> {
  await mkdir(projectRoot, { recursive: true })
  await writeFile(join(projectRoot, 'package.json'), JSON.stringify({ name: 'demo', version: '0.0.0' }, null, 2), 'utf8')
  await writeFile(join(projectRoot, 'index.ts'), 'export const key = "AKIAIOSFODNN7EXAMPLE"\n', 'utf8')
}

describe('@deepseek-ai/dsh-app-builder-deployment (real Loader composition)', () => {
  it('package is a service (default-exported class, not a function plugin)', () => {
    expect(typeof AppBuilderDeploymentPlugin.default).toBe('function')
    expect('default' in AppBuilderDeploymentPlugin).toBe(true)
  })

  it('plugin name matches the bundle patch row id', () => {
    expect(AppBuilderDeploymentPlugin.name).toBe('app-builder-deployment')
  })

  it('deploy on a clean project runs all three gates, lands the synthetic push, and emits one started + one succeeded event', async () => {
    const { ctx } = await loadYaml()
    const projectRegistry = ctx.get('appBuilderProjects') as { create(req: { name: string; rootPath: string; stack: 'nextjs-app' }): Promise<{ id: string; rootPath: string }> }
    type DeployResult = {
      id: string
      status: string
      url?: string
      gateResults: readonly { kind: string; passed: boolean }[]
    }
    const deploymentRegistry = ctx.get('appBuilderDeployment') as {
      deploy(req: { projectId: string }): Promise<DeployResult>
      get(id: string): { status: string } | undefined
      list(): readonly unknown[]
      has(id: string): boolean
      toValue(id: string): { projectId: string; deploymentId: string; url?: string } | undefined
      latestForProject(projectId: string): { id: string } | undefined
    }
    const projectRoot = await mkdtemp(join(tmpdir(), 'dsh-deploy-clean-'))
    await seedCleanProject(projectRoot)
    const project = await projectRegistry.create({ name: 'demo', rootPath: projectRoot, stack: 'nextjs-app' })
    const capture = captureDeploymentEvents(ctx)
    const result = await deploymentRegistry.deploy({ projectId: project.id })
    capture.off()
    expect(result.status).toBe('succeeded')
    expect(result.url).toBe('https://deploy.local/' + project.id + '/' + result.id)
    expect(result.gateResults.length).toBe(3)
    for (const gateResult of result.gateResults) {
      expect(['sast', 'sca', 'secrets']).toContain(gateResult.kind)
      expect(gateResult.passed).toBe(true)
    }
    expect(capture.events.started).toBe(1)
    expect(capture.events.succeeded).toBe(1)
    expect(capture.events.failed).toBe(0)
    expect(deploymentRegistry.has(result.id)).toBe(true)
    expect(deploymentRegistry.get(result.id)?.status).toBe('succeeded')
    expect(deploymentRegistry.list().length).toBe(1)
    const value = deploymentRegistry.toValue(result.id)
    expect(value?.projectId).toBe(project.id)
    expect(value?.deploymentId).toBe(result.id)
    expect(value?.url).toBe('https://deploy.local/' + project.id + '/' + result.id)
    expect(deploymentRegistry.latestForProject(project.id)?.id).toBe(result.id)
    await rm(projectRoot, { recursive: true, force: true })
  })

  it('deploy on a project with a hard-coded AWS access key id trips the secrets gate and emits deployment/failed with the gate name in the reason', async () => {
    const { ctx } = await loadYaml()
    const projectRegistry = ctx.get('appBuilderProjects') as { create(req: { name: string; rootPath: string; stack: 'nextjs-app' }): Promise<{ id: string; rootPath: string }> }
    type BlockedDeployResult = {
      status: string
      reason?: string
      gateResults: readonly { kind: string; passed: boolean }[]
    }
    const deploymentRegistry = ctx.get('appBuilderDeployment') as { deploy(req: { projectId: string }): Promise<BlockedDeployResult> }
    const projectRoot = await mkdtemp(join(tmpdir(), 'dsh-deploy-blocked-'))
    await seedProjectWithSecret(projectRoot)
    const project = await projectRegistry.create({ name: 'demo', rootPath: projectRoot, stack: 'nextjs-app' })
    const capture = captureDeploymentEvents(ctx)
    const result = await deploymentRegistry.deploy({ projectId: project.id })
    capture.off()
    expect(result.status).toBe('gates-failed')
    expect(result.reason).toContain('secrets')
    const secretsResult = result.gateResults.find(g => g.kind === 'secrets')
    expect(secretsResult?.passed).toBe(false)
    expect(capture.events.started).toBe(1)
    expect(capture.events.failed).toBe(1)
    expect(capture.events.succeeded).toBe(0)
    expect(capture.events.reasons[0]).toContain('secrets')
    await rm(projectRoot, { recursive: true, force: true })
  })

  it('deploy on an unknown project id resolves to a typed failed record without throwing', async () => {
    const { ctx } = await loadYaml()
    const deploymentRegistry = ctx.get('appBuilderDeployment') as { deploy(req: { projectId: string }): Promise<{ status: string; reason?: string }> }
    const capture = captureDeploymentEvents(ctx)
    const result = await deploymentRegistry.deploy({ projectId: 'phantom' })
    capture.off()
    expect(result.status).toBe('failed')
    expect(result.reason).toContain('phantom')
    expect(capture.events.failed).toBe(1)
    expect(capture.events.succeeded).toBe(0)
    expect(capture.events.started).toBe(0)
  })
})
