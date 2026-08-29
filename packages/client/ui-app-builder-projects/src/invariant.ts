/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-app-builder-projects`.
 * @module @deepseek-ai/dsh-client-ui-app-builder-projects/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-app-builder-projects'

/** Cordis companion plugin name. */
export const name = 'client-ui-app-builder-projects-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: a pure-presentational projects pane that polls the
 * server-state snapshot endpoint and renders the list; it owns no cross-plugin
 * mutable state, emits no cordis events, and writes only to the shell's
 * selection store through the documented `appBuilder` service handle.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
