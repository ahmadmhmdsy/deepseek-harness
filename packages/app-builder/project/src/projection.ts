/**
 * The `project` projection unit: per-session owning project derived from the
 * session's `cwd` against the App Builder project registry.
 *
 * Init folds the cwd → registry lookup exactly once: a session's cwd is set at
 * creation and never changes, so the owning project is determined by the
 * initial fold and `apply` returns the same state reference for every
 * committed event (Object.is gates the change feed — no per-event work). The
 * persisted projection cache (`@deepseek-ai/dsh-session-projection-cache`,
 * mounted by `bundle/base`) checkpoints the unit's state on its throttled
 * write-behind alongside `sessionStats`, so a listing read seeds from the
 * cache without re-reading the full session log.
 *
 * @module @deepseek-ai/dsh-app-builder-project/projection
 */

import { z } from 'zod'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionHeader } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import type { Project, ProjectId } from './types.ts'

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    project: ProjectView
  }
  interface SessionProjectionStateMap {
    project: ProjectState
  }
}

/**
 * Persisted fold state: the owning project for one session, or `null` when
 * the session's cwd lives outside any registered project. Plain JSON per the
 * persisted-cache precondition.
 */
export interface ProjectState {
  readonly owningProjectId: ProjectId | null
  readonly owningProjectName: string | null
  readonly owningProjectRootPath: string | null
}

/**
 * Client-visible projection value: the same fields as the state, minus the
 * branded id type. Strict subset of the state shape — the wire schema is the
 * state schema with the two nullable arms.
 */
export interface ProjectView {
  readonly owningProjectId: string | null
  readonly owningProjectName: string | null
  readonly owningProjectRootPath: string | null
}

// The persisted row holds plain strings at runtime: `ProjectId` is a
// compile-time brand only (`string & { ... }`), so the schema's output type
// is widened to `ProjectState` via a single cast at the boundary. The
// projection registry validates the persisted cache row through this schema
// after `ver`-gate, so any non-string value would fail loud here.
const projectStateSchema = z.object({
  owningProjectId: z.string().nullable(),
  owningProjectName: z.string().nullable(),
  owningProjectRootPath: z.string().nullable(),
}).strict() as unknown as z.ZodType<ProjectState>

const projectViewSchema = z.object({
  owningProjectId: z.string().nullable(),
  owningProjectName: z.string().nullable(),
  owningProjectRootPath: z.string().nullable(),
}).strict() as unknown as z.ZodType<ProjectView>

/** The empty-log state: a session without a cwd has no owning project. */
function initState(): ProjectState {
  return { owningProjectId: null, owningProjectName: null, owningProjectRootPath: null }
}

/**
 * Pick the project whose canonical root is a directory-prefix ancestor of the
 * session's cwd. Returns `null` when the session has no cwd, when the
 * registry is not mounted, or when no project matches. The `+ sep` test
 * guards against a substring false positive (`/home/me` is not under
 * `/home/mex`).
 * @param ctx - Cordis context carrying `ctx.appBuilderProjects`.
 * @param header - the session header whose `cwd` names the session's root.
 * @returns the matched project record, or `null`.
 */
function resolveOwner(ctx: Context, header: SessionHeader): Project | null {
  const cwd = header.cwd
  if (cwd === undefined) return null
  const registry = ctx.get('appBuilderProjects') as
    | { list(): readonly Project[] }
    | undefined
  if (registry === undefined) return null
  const projects = registry.list()
  for (const project of projects) {
    const root = project.rootPath
    if (cwd === root || cwd.startsWith(root + '/') || cwd.startsWith(root + '\\')) {
      return project
    }
  }
  return null
}

/**
 * The Cordis context the unit was registered against — `init` runs in the
 * projection registry's drive path without a context argument, so the unit
 * captures the registrant fiber's context at registration time and resolves
 * `ctx.appBuilderProjects` through it.
 */
let serviceContext: Context

/**
 * Bind the context the unit resolves `appBuilderProjects` against. Called
 * once by `apply()` before the unit is registered.
 * @param ctx - the registrant Cordis context.
 */
export function bindProjectionContext(ctx: Context): void {
  serviceContext = ctx
}

/**
 * The `project` projection unit registered on `ctx.sessionProjections`.
 * The `apply` fold is the identity on `state`: a session's cwd is set once
 * at creation and never mutates, so every event returns the same reference
 * and `Object.is` gates the change feed (zero downstream work per event).
 * `stateVersion` is `1`; bump on any change to the persisted fields.
 */
export const projectProjectionDefinition = {
  key: 'project' as const,
  stateVersion: 1,
  stateSchema: projectStateSchema,
  init: (header: SessionHeader): ProjectState => {
    const owner = resolveOwner(serviceContext, header)
    if (owner === null) return initState()
    return {
      owningProjectId: owner.id,
      owningProjectName: owner.name,
      owningProjectRootPath: owner.rootPath,
    }
  },
  apply: (state: ProjectState): ProjectState => state,
  wire: {
    viewSchema: projectViewSchema,
    view: (state: ProjectState): ProjectView => ({
      owningProjectId: state.owningProjectId,
      owningProjectName: state.owningProjectName,
      owningProjectRootPath: state.owningProjectRootPath,
    }),
  },
} satisfies ProjectionDefinition<'project', ProjectState>
