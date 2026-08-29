/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-app-builder-scaffold`.
 *
 * The scaffold tool's durable effects (`fs/observed` for each write, `job/done`
 * for the optional background `npm install`) already feed their own
 * authoritative event streams; the companion reserves the package name so
 * `verify-package-invariants` does not flag an unexplained empty installer.
 * @module @deepseek-ai/dsh-app-builder-scaffold/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-app-builder-scaffold'

/** Cordis companion plugin name. */
export const name = 'app-builder-scaffold-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the tool's durable effects ride `fs/observed` and
 * `job/done`; observing them from this registry would only duplicate those
 * streams. The companion's only job is to claim package ownership.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
