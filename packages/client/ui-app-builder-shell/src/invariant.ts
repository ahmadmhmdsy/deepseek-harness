/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-app-builder-shell`.
 * @module @deepseek-ai/dsh-client-ui-app-builder-shell/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-app-builder-shell'

/** Cordis companion plugin name. */
export const name = 'client-ui-app-builder-shell-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: a pure-presentational layout shell that occupies
 * the root layout and renders three child slots; it owns no cross-plugin
 * mutable state and emits no cordis events. The owner selection state is
 * a slot-declared store confined to this package's runtime.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
