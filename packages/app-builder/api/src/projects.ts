/**
 * Project CRUD methods for the App Builder Host BFF. Each Remote method
 * delegates to `ctx.appBuilderProjects` (the in-memory registry added in
 * Phase 1.5.4). `createProject` re-implements the template-file write that
 * the model-facing scaffold tool exposes: it imports the same
 * `TEMPLATES` and `validateProjectName` so both surfaces agree on the
 * template catalog and the validation rules.
 * @module @deepseek-ai/dsh-app-builder-api/projects
 */

import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { TypertRemoteFailure } from '@deepseek-ai/dsh-typert-protocol'
import type { Context } from '@deepseek-ai/cordis'
import type { Project, ProjectId, ProjectStack } from '@deepseek-ai/dsh-app-builder-project'
import { TEMPLATES, validateProjectName, validateTemplatePath } from '@deepseek-ai/dsh-app-builder-scaffold'
import type {
  CreateProjectRequest,
  CreateProjectValue,
  DeleteProjectRequest,
  DeleteProjectValue,
  GetProjectRequest,
  GetProjectValue,
  ListProjectsValue,
  ProjectShape,
} from './types.ts'

/** Cast a branded `ProjectId` back to a plain string for the public shape. */
function toShape(project: Project): ProjectShape {
  return {
    id: project.id,
    name: project.name,
    rootPath: project.rootPath,
    stack: project.stack,
    gitUrl: project.gitUrl,
    dshProfile: project.dshProfile,
    createdAt: project.createdAt,
  }
}

/**
 * Reject any request whose `stack` is not part of the closed template set.
 * @param stack - candidate stack id.
 */
function isProjectStack(stack: string): stack is ProjectStack {
  return stack === 'nextjs-app' || stack === 'nextjs-pages' || stack === 'svelte-spa'
}

/**
 * List every durable project in creation order. The empty registry returns
 * `{ projects: [] }`, not an error — a freshly booted host is the empty
 * state, not an error state.
 * @param ctx - Cordis context carrying `ctx.appBuilderProjects`.
 * @returns the empty-request value (the type-level field is `never`).
 */
export async function listProjectsRemote(ctx: Context): Promise<ListProjectsValue> {
  await Promise.resolve()
  const registry = ctx.appBuilderProjects
  return { projects: registry.list().map(toShape) }
}

/**
 * Create one durable project. Validates the name and rootPath, writes the
 * template's files verbatim (same catalog the model-facing tool uses),
 * registers the record with the project registry, and returns its public
 * shape. npm install is NOT started here — a Phase 2 follow-up will expose
 * it as a separate job (the model-facing tool calls `ctx.shell.start`).
 * @param ctx - Cordis context.
 * @param request - the create payload.
 * @returns the created project's public shape.
 */
export async function createProjectRemote(
  ctx: Context,
  request: CreateProjectRequest,
): Promise<CreateProjectValue> {
  validateProjectName(request.name)
  if (!isProjectStack(request.stack)) {
    throw new TypertRemoteFailure({
      code: 'bad-request',
      message: `createProject: unknown stack '${String(request.stack)}'`,
      details: { stack: request.stack },
    })
  }
  const canonicalRoot = resolve(request.rootPath)
  const definition = TEMPLATES[request.stack]
  for (const file of definition.files) {
    validateTemplatePath(file.path)
    await mkdir(join(canonicalRoot, ...file.path.split('/').slice(0, -1)), { recursive: true })
    await writeFile(join(canonicalRoot, file.path), file.content, { encoding: 'utf8', mode: 0o644 })
  }
  const project = await ctx.appBuilderProjects.create({
    name: request.name,
    rootPath: canonicalRoot,
    stack: request.stack,
    gitUrl: request.gitUrl ?? null,
    dshProfile: request.dshProfile ?? 'app-builder',
  })
  return { project: toShape(project) }
}

/**
 * Look up one project by id. Returns a typed `not-found` failure when the
 * registry has no record so the gateway surfaces a 4xx-class rejection the
 * UI can render (rather than a generic internal error).
 * @param ctx - Cordis context.
 * @param request - lookup payload.
 * @returns the public shape.
 */
export async function getProjectRemote(
  ctx: Context,
  request: GetProjectRequest,
): Promise<GetProjectValue> {
  await Promise.resolve()
  const id = request.id as ProjectId
  const project = ctx.appBuilderProjects.get(id)
  if (project === undefined) {
    throw new TypertRemoteFailure({
      code: 'not-found',
      message: `getProject: no project with id ${String(id)}`,
      details: { id },
    })
  }
  return { project: toShape(project) }
}

/**
 * Remove one project from the in-memory registry AND remove its directory
 * tree. The registry emits `project/deleted` which the snapshot bridge
 * subscribes to, so the projects pane refreshes synchronously after the
 * method returns. The delete is irreversible: the file-system removal is
 * not transactional, and a partial failure leaves the registry without its
 * directory. The caller (UI / Agent) is expected to confirm with the user
 * before invoking.
 * @param ctx - Cordis context.
 * @param request - delete payload.
 * @returns the deleted id.
 */
export async function deleteProjectRemote(
  ctx: Context,
  request: DeleteProjectRequest,
): Promise<DeleteProjectValue> {
  const id = request.id as ProjectId
  const project = ctx.appBuilderProjects.get(id)
  if (project === undefined) {
    throw new TypertRemoteFailure({
      code: 'not-found',
      message: `deleteProject: no project with id ${String(id)}`,
      details: { id },
    })
  }
  // Remove the directory tree first; a removal failure throws before the
  // registry drop, so a failed delete never advertises a stale state.
  await rm(project.rootPath, { recursive: true, force: true })
  ctx.appBuilderProjects.delete(id)
  return { id, deleted: true }
}
