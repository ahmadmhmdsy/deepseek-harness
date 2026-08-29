/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-app-builder-project`.
 *
 * Phase 1 ships an empty installer: the registry's state is process-local and
 * the durable truth lives in the session-log `project/created` event. A later
 * phase adds the registry-vs-log relation check that owns the package name.
 * @module @deepseek-ai/dsh-app-builder-project/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-app-builder-project'

/** Cordis companion plugin name. */
export const name = 'app-builder-project-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: Phase 1 keeps the registry in process memory and
 * persists the durable truth through the `project/created` session-log event;
 * a later phase adds the registry-vs-log relation check this companion will own.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
