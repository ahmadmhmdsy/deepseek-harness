/**
 * Deferred Remote method bodies for the App Builder Host BFF.
 *
 * `deploy` and `getUsage` are part of the public Typert Remote surface
 * listed in `planning/Phase 2 prompt.md §3` but depend on packages that
 * Phase 1.5 does not yet adopt: `deploy` requires
 * `@deepseek-ai/dsh-app-builder-deployment` and `getUsage` requires
 * token / cost accounting sourced from `@deepseek-ai/dsh-tool-policy`.
 * Each method returns a typed `not-implemented` failure so a missing
 * owner never silently succeeds and the gateway surfaces the typed
 * rejection to the client (the Agent / UI distinguishes `not-implemented`
 * from `internal` failures on the same path).
 * @module @deepseek-ai/dsh-app-builder-api/deferred
 */

import { TypertRemoteFailure } from '@deepseek-ai/dsh-typert-protocol'
import type { Context } from '@deepseek-ai/cordis'
import type { DeployRequest, DeployValue, GetUsageRequest, GetUsageValue } from './types.ts'

/**
 * Build the typed `not-implemented` failure the two deferred methods throw.
 * @param method - Remote method name the caller requested.
 * @param reason - one-line summary of the missing owner.
 * @returns the failure instance, suitable for `throw` or `Promise.reject`.
 */
export function notImplemented(method: string, reason: string): TypertRemoteFailure {
  return new TypertRemoteFailure({
    code: 'not-implemented',
    message: `app-builder.api.${method} is deferred: ${reason}`,
    details: { method },
  })
}

/**
 * `deploy` placeholder. The Real implementation lands when Phase 2 adopts
 * `@deepseek-ai/dsh-app-builder-deployment`; today it returns the typed
 * `not-implemented` failure so callers can wire against the method today.
 * @param _ctx - unused; the real implementation will read `appBuilderDeployment`.
 * @param _request - the deploy payload (projectId + optional target).
 * @returns never — throws.
 */
export async function deployRemote(_ctx: Context, _request: DeployRequest): Promise<DeployValue> {
  await Promise.resolve()
  throw notImplemented('deploy', '@deepseek-ai/dsh-app-builder-deployment is not adopted in this fork yet (Phase 2 follow-up)')
}

/**
 * `getUsage` placeholder. The real implementation lands when Phase 2
 * adopts the token / cost accounting policy package; today it returns the
 * typed `not-implemented` failure so callers can wire against the method
 * today.
 * @param _ctx - unused; the real implementation will read `tokenMeter` and the session projection.
 * @param _request - the usage query (projectId and / or sessionId).
 * @returns never — throws.
 */
export async function getUsageRemote(_ctx: Context, _request: GetUsageRequest): Promise<GetUsageValue> {
  await Promise.resolve()
  throw notImplemented('getUsage', 'token / cost accounting is Phase 2 deferred (no @deepseek-ai/dsh-tool-policy in tree yet)')
}
