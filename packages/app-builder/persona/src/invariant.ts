/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-app-builder-persona`.
 *
 * The persona plugin owns no event stream or mutable runtime data; it
 * delegates to `@deepseek-ai/dsh-persona` which in turn owns the prompt
 * section identity, complete-prompt enforcement, shadowing, and disposal.
 * The companion reserves the package name so `verify-package-invariants`
 * does not flag an unexplained empty installer.
 * @module @deepseek-ai/dsh-app-builder-persona/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-app-builder-persona'

/** Cordis companion plugin name. */
export const name = 'app-builder-persona-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this row delegates to `dsh-persona`, which owns
 * the prompt section identity and disposal. The companion only claims
 * package ownership.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
