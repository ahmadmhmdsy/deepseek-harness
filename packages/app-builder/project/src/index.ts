/**
 * @module @deepseek-ai/dsh-app-builder-project
 *
 * Cordis plugin that owns the App Builder `Project` entity and its in-memory
 * registry. Phase 1 keeps the registry process-local; durability lives in the
 * session-log `project/created` event. See README 'Known Limitations'.
 */

import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

import type { CreateProjectInput, Project, ProjectCreatedEvent, ProjectId } from './types.ts'

export type { CreateProjectInput, Project, ProjectCreatedEvent, ProjectId, ProjectStack } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    appBuilderProjects: ProjectRegistry
  }
  interface Events {
    'project/created'(event: ProjectCreatedEvent): void
  }
}

/**
 * Process-local project registry. Phase 1 keeps every project in memory and
 * emits one `project/created` event per durable record; a Phase 2 follow-up
 * replaces this with a `dsh-storage-domain` backed implementation.
 */
export class ProjectRegistry extends Service {
  private readonly projects = new Map<ProjectId, Project>()

  constructor(ctx: Context, name = 'appBuilderProjects') {
    super(ctx, name)
  }

  /**
   * Create one project. Canonicalizes the path, validates the root exists and
   * is a directory, then emits a `project/created` event before publishing.
   * @param input - Validated project input.
   * @returns the new project.
   */
  async create(input: CreateProjectInput): Promise<Project> {
    const canonical = resolve(input.rootPath)
    if (!(await stat(canonical)).isDirectory()) {
      throw new Error(`cannot create project at '${input.rootPath}': path is not a directory`)
    }
    const id = brandProjectId(randomUUID())
    const project: Project = {
      id,
      name: input.name,
      rootPath: canonical,
      stack: input.stack,
      gitUrl: input.gitUrl ?? null,
      dshProfile: input.dshProfile ?? 'app-builder',
      createdAt: new Date().toISOString(),
    }
    const event: ProjectCreatedEvent = { type: 'project/created', project }
    await this.ctx.emit('project/created', event)
    this.projects.set(id, project)
    this.ctx.logger('app-builder-project').info(`project '${project.name}' created at ${project.rootPath}`)
    return project
  }

  /**
   * Look up a project by id.
   * @param id - Project id.
   * @returns the project, or `undefined` when unknown.
   */
  get(id: ProjectId): Project | undefined {
    return this.projects.get(id)
  }

  /**
   * Project list in creation order. Process-local: no persistence yet.
   * @returns all registered projects.
   */
  list(): readonly Project[] {
    return [...this.projects.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  /**
   * Whether the registry has a record for the given id.
   * @param id - Project id.
   */
  has(id: ProjectId): boolean {
    return this.projects.has(id)
  }

  /**
   * Enumerate session ids whose `cwd` lives under the project's canonical
   * root. Returns an empty array when no `ctx.sessions` service is mounted.
   * @param id - Project id.
   */
  listSessionIds(id: ProjectId): readonly string[] {
    const project = this.projects.get(id)
    if (project === undefined) return []
    const sessions = this.ctx.get('sessions') as { list(): readonly { header: { cwd?: string; id: string } }[] } | undefined
    if (sessions === undefined) return []
    const root = project.rootPath
    return sessions
      .list()
      .filter(session => session.header.cwd !== undefined && session.header.cwd.startsWith(root))
      .map(session => session.header.id)
  }
}

function brandProjectId(id: string): ProjectId {
  return id as ProjectId
}

/** Plugin config — all optional; defaults are the MVP shipped values. */
export interface Config {
  /** Default `dshProfile` when a project is created without one. */
  defaultProfile?: string
}

/** Schemastery schema for plugin config. */
export const Config: z<Config> = z.object({
  defaultProfile: z.string().default('app-builder'),
})

/** Cordis plugin name. */
export const name = 'app-builder-project'

/** Services required by the project plugin. The plugin reads `ctx.logger` directly; no `inject` entries are needed. */
export const inject: readonly string[] = []

/**
 * Plugin entry. The `ProjectRegistry` constructor calls
 * `ctx.reflect.provide('appBuilderProjects', this, ...)` so the service is
 * registered automatically and disposed when the owning fiber unloads. The
 * name is passed explicitly: Service's base constructor would otherwise fall
 * back to the static `provide` field, which `ProjectRegistry` does not set.
 * @param ctx - Cordis context.
 * @param config - Plugin config (validated through `Config`).
 */
export function apply(ctx: Context, config: Config): void {
  const project = new ProjectRegistry(ctx, 'appBuilderProjects')
  void project
  void config
}

export default ProjectRegistry
