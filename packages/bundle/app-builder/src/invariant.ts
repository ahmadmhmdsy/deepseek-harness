/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-app-builder`.
 *
 * The bundle patch layer carries no runtime invariant of its own: each loaded
 * plugin (project, scaffold, preview, persona) registers its own installer
 * when activated. The companion reserves the bundle package name so
 * `verify-package-invariants` does not flag the empty bundle.
 * @module @deepseek-ai/dsh-app-builder/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-app-builder'

/** Cordis companion plugin name. */
export const name = 'app-builder-bundle-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this bundle is a `cordis.patch.yml` patch layer; the
 * four plugin invariants (project, scaffold, preview, persona) own the
 * relationship checks. The companion exists only to claim package ownership.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
