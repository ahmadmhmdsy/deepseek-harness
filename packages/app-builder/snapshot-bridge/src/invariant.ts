/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-app-builder-snapshot-bridge`.
 *
 * No runtime invariant: the bridge is a file projection of upstream state owned
 * by the project registry and the preview tool. There is no source-of-truth
 * relation to assert; every write is a derived view, not a service claim.
 * @module @deepseek-ai/dsh-app-builder-snapshot-bridge/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-app-builder-snapshot-bridge'

/** Cordis companion plugin name. */
export const name = 'app-builder-snapshot-bridge-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the snapshot is a derived file projection of
 * upstream-owned state (project registry + preview job lifecycle). Every
 * write is a view, not a claim — there is no invariant relation to check.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
