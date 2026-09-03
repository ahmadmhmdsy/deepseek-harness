/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-app-builder-preview-iframe`.
 * @module @deepseek-ai/dsh-client-ui-app-builder-preview-iframe/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-app-builder-preview-iframe'

/** Cordis companion plugin name. */
export const name = 'client-ui-app-builder-preview-iframe-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: a pure-presentational preview iframe pane that
 * subscribes to the App Builder preview stream and renders the dev-server URL
 * for the selected project; it owns no cross-plugin mutable state, emits no
 * cordis events, and reads only through the documented `appBuilder` service
 * handle for selection.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
