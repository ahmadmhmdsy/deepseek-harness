/**
 * Types for the App Builder project entity. No runtime code lives here.
 * @module @deepseek-ai/dsh-app-builder-project/types
 */

import type {} from '@deepseek-ai/dsh-invariants'

/** Branded project id (see `dsh-brand` rationale in the root AGENTS.md). */
export type ProjectId = string & { readonly __projectIdBrand: unique symbol }

/** Stack family for a scaffolded project; drives scaffold tool defaults. */
export type ProjectStack = 'nextjs-app' | 'nextjs-pages' | 'svelte-spa'

/**
 * Public, JSON-safe project record. `createdAt` is ISO-8601; `gitUrl` is
 * the optional remote URL when the project was cloned rather than scaffolded.
 */
export interface Project {
  readonly id: ProjectId
  readonly name: string
  readonly rootPath: string
  readonly stack: ProjectStack
  readonly gitUrl: string | null
  readonly dshProfile: string
  readonly createdAt: string
}

/** Event payload for `project/created`; emitted once per durable project record. */
export interface ProjectCreatedEvent {
  readonly type: 'project/created'
  readonly project: Project
}

/** Event payload for `project/deleted`; emitted when a durable project record is removed. */
export interface ProjectDeletedEvent {
  readonly type: 'project/deleted'
  readonly project: Project
}

/** Input shape for `ProjectRegistry.create`; schemastery validates it. */
export interface CreateProjectInput {
  readonly name: string
  readonly rootPath: string
  readonly stack: ProjectStack
  readonly gitUrl?: string | null
  readonly dshProfile?: string
}
