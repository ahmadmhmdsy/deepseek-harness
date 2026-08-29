/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-app-builder-preview`.
 *
 * The preview tool durable effects (`job/done` for the spawned dev server,
 * `tools/call` for the readiness probe HTTP request) already feed their own
 * authoritative event streams; the companion reserves the package name so
 * `verify-package-invariants` does not flag an unexplained empty installer.
 * @module @deepseek-ai/dsh-app-builder-preview/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-app-builder-preview'

/** Cordis companion plugin name. */
export const name = 'app-builder-preview-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the dev server lifecycle rides `job/done` and the
 * HTTP probe is one read-only network dial. Observing them from this
 * registry would only duplicate those streams. The companion only claims
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
