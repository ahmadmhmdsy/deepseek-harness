/**
 * REAL Loader composition proof: the App Builder `project` projection unit
 * is registered on `ctx.sessionProjections` when the
 * `@deepseek-ai/dsh-app-builder-project` plugin boots, a session's cwd is
 * resolved to its owning project on init, and a cwd with no matching project
 * folds to the zero state. The persisted projection cache
 * (`@deepseek-ai/dsh-session-projection-cache`) is mounted alongside so the
 * unit's checkpoint path runs end-to-end.
 *
 * The filename keeps the `loader-composition` prefix so the policy gate
 * that requires Loader boots for product-visible plugins stays green.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import SessionProjectionCache from '@deepseek-ai/dsh-session-projection-cache'
import * as AppBuilderProjectPlugin from '@deepseek-ai/dsh-app-builder-project'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

async function loadYaml(lines: readonly string[]): Promise<Context> {
  root = await mkdtemp(join(tmpdir(), 'dsh-app-builder-project-projection-'))
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [...lines, ''].join('\n'))

  context = new Context()
  context.baseUrl = pathToFileURL(root).href + '/'
  await context.plugin(Loader)
  context.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-session', SessionStore],
    ['@deepseek-ai/dsh-session-projection', SessionProjectionRegistry],
    ['@deepseek-ai/dsh-session-projection-cache', SessionProjectionCache],
    ['@deepseek-ai/dsh-storage', Storage],
    ['@deepseek-ai/dsh-storage-domain', StorageDomain],
    ['@deepseek-ai/dsh-storage-json', StorageJson],
    ['@deepseek-ai/dsh-app-builder-project', AppBuilderProjectPlugin],
  ])
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
  return context
}

function baselineYaml(storageRoot: string): string[] {
  return [
    "- name: '@deepseek-ai/dsh-session'",
    "- name: '@deepseek-ai/dsh-session-projection'",
    "- name: '@deepseek-ai/dsh-storage'",
    '- name: \'@deepseek-ai/dsh-storage-json\'',
    '  config:',
    `    root: ${JSON.stringify(storageRoot)}`,
    "- name: '@deepseek-ai/dsh-storage-domain'",
    '  config:',
    '    backend: json',
    "- name: '@deepseek-ai/dsh-session-projection-cache'",
    '  config:',
    '    writeEveryEvents: 5',
    '    writeIntervalMs: 100',
    "- name: '@deepseek-ai/dsh-app-builder-project'",
  ]
}

describe('app-builder-project projection unit (real Loader composition)', () => {
  it('keeps the function-plugin namespace free of a default export', () => {
    // A default export beside the named form makes the Loader discard the
    // namespace (postmortem 0001) — pin its absence for the App Builder plugin.
    expect('default' in AppBuilderProjectPlugin).toBe(false)
  })

  it('resolves a session cwd under a registered project to its owning project', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'dsh-app-builder-proj-'))
    const storageRoot = await mkdtemp(join(tmpdir(), 'dsh-app-builder-storage-'))

    const loaded = await loadYaml(baselineYaml(storageRoot))

    const project = await loaded.appBuilderProjects.create({
      name: 'demo',
      rootPath: projectRoot,
      stack: 'nextjs-app',
    })

    const session = loaded.sessions.create(SessionId('matches'), { meta: { cwd: projectRoot } })

    const snapshot = loaded.sessionProjections.snapshot(session)
    expect(snapshot.values.project).toEqual({
      owningProjectId: project.id,
      owningProjectName: 'demo',
      owningProjectRootPath: resolve(projectRoot),
    })
  })

  it('folds to the zero state when the session cwd lives outside any project', async () => {
    const storageRoot = await mkdtemp(join(tmpdir(), 'dsh-app-builder-storage-'))
    const strayDir = await mkdtemp(join(tmpdir(), 'dsh-app-builder-stray-'))

    const loaded = await loadYaml(baselineYaml(storageRoot))

    // No project is created — the registry is empty.
    const session = loaded.sessions.create(SessionId('no-project'), { meta: { cwd: strayDir } })
    const snapshot = loaded.sessionProjections.snapshot(session)
    expect(snapshot.values.project).toEqual({
      owningProjectId: null,
      owningProjectName: null,
      owningProjectRootPath: null,
    })
  })

  it('does not re-resolve when the registry grows after the session is created', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'dsh-app-builder-proj-'))
    const storageRoot = await mkdtemp(join(tmpdir(), 'dsh-app-builder-storage-'))

    const loaded = await loadYaml(baselineYaml(storageRoot))

    const session = loaded.sessions.create(SessionId('late-project'), { meta: { cwd: projectRoot } })
    // Snapshot first while the registry is empty.
    expect(loaded.sessionProjections.snapshot(session).values.project).toEqual({
      owningProjectId: null,
      owningProjectName: null,
      owningProjectRootPath: null,
    })

    // Add the project AFTER the session's init has run.
    await loaded.appBuilderProjects.create({ name: 'late', rootPath: projectRoot, stack: 'svelte-spa' })
    // The unit's apply is the identity on every event: a project added later
    // does not retroactively own an existing session.
    expect(loaded.sessionProjections.snapshot(session).values.project).toEqual({
      owningProjectId: null,
      owningProjectName: null,
      owningProjectRootPath: null,
    })
  })
})
