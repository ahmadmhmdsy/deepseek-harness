/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-app-builder-deployment`.
 *
 * The deployment workflow owns three runtime-checked relations:
 *
 *  1. The `deployment/started` event is emitted exactly once per
 *     durable deployment record (add-then-emit ordering); a listener
 *     that calls `list()` / `get(id)` observes the new record on
 *     `deployment/started`, mirroring the project registry's contract.
 *  2. The push step runs only after all three gates pass and approval
 *     resolves `allowed-once`; a failed gate or rejection short-circuits
 *     with a `deployment/failed` event carrying the reason.
 *  3. The deployment registry holds the latest in-memory copy of every
 *     completed workflow (success or failure); a downstream consumer
 *     reading `latestForProject(projectId)` observes the most recent
 *     record for that project.
 *
 * The Phase 2.1 ship installs an empty companion: the relations are
 * owned by the registry and the workflow, and a later phase adds the
 * runtime check that the deployment record stream mirrors the
 * `deployment/*` event log exactly once per workflow.
 * @module @deepseek-ai/dsh-app-builder-deployment/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-app-builder-deployment'

/** Cordis companion plugin name. */
export const name = 'app-builder-deployment-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the package owns the deployment workflow which
 * runtime-checks its own gate / approval / push ordering; the registry
 * stores every completed workflow in memory; the deploy Remote method
 * delegates to the registry. A Phase 2.4 follow-up that backs the
 * registry with `dsh-storage-domain` will replace this with the relation
 * that ties the durable `deployment/*` event log to the registry's
 * in-memory state.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
