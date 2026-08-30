/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-app-builder-api`.
 *
 * The Typert Remote surface here is a thin delegated shell: every Remote
 * method routes a request to a registered owner that already proves its own
 * relation (ProjectRegistry creates durable records; SessionController owns
 * the Session lifecycle; SessionProjectionRegistry owns the per-session
 * projections). The companion stays empty by design — no App Builder
 * API-specific relation needs runtime checking on top of what each owner
 * already asserts. A Phase 2 follow-up that adds `deploy`/`getUsage`
 * implementations will replace this with the relation that ties the new
 * remote methods to their owners.
 * @module @deepseek-ai/dsh-app-builder-api/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-app-builder-api'

/** Cordis companion plugin name. */
export const name = 'app-builder-api-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: every Remote method delegates to an owner that owns
 * and runtime-checks its own relation. Project CRUD maps 1:1 onto
 * `ctx.appBuilderProjects` (the registry validates the rootPath is a
 * directory on create); session lifecycle delegates to the upstream
 * `@deepseek-ai/dsh-api-session-controller` Service whose Remote methods
 * already enforce workspace / cwd / preset conflicts; SSE event
 * subscription is the same controller's `follow` stream and inherits its
 * gap-free guarantee; preview reads the snapshot bridge's in-memory state
 * which is itself a derived view of the preview tool's `dev-state`
 * transitions. The two deferred methods (`deploy`, `getUsage`) return a
 * typed `not-implemented` failure so a missing owner never silently
 * succeeds.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
