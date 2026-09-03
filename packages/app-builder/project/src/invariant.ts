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
 * No runtime invariant: the package owns a single pure projection fold whose
 * wire payload is schema-validated by the projection registry at every
 * snapshot and change-feed emission. The cwd → owning-project relation the
 * fold consumes is owned and runtime-checked by `ProjectRegistry.create()`
 * (which validates the rootPath is a directory) and by
 * `ProjectRegistry.listSessionIds()` (which derives the prefix-match set); the
 * persisted projection cache checkpoints the unit's state on its throttled
 * write-behind and a stale or version-mismatched row is discarded on read
 * (no migration). The event relations the registry relies on
 * (`project/created` exactly once per durable record, the `add-then-emit`
 * ordering the snapshot bridge depends on) are owned here and asserted by
 * the snapshot-bridge test.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
