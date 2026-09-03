/**
 * Deferred Remote method bodies for the App Builder Host BFF.
 *
 * \`deploy\` is wired through the Phase 2.1 deployment package
 * (\`@deepseek-ai/dsh-app-builder-deployment\`); it is kept here because the
 * deployment plugin is a soft dependency and the wire method returns a
 * typed \`not-implemented\` failure when the bundle omits it. \`getUsage\`
 * moved to \`./usage.ts\` in Phase 2.3 once the token / cost accounting
 * path (\`@deepseek-ai/dsh-token-meter\`) was adopted. Deferred methods
 * throw a typed \`not-implemented\` failure so a missing owner never
 * silently succeeds; the gateway surfaces the typed rejection to the
 * client (the Agent / UI distinguishes \`not-implemented\` from \`internal\`
 * failures on the same path).
 * @module @deepseek-ai/dsh-app-builder-api/deferred
 */

import { TypertRemoteFailure } from '@deepseek-ai/dsh-typert-protocol'
import type { Context } from '@deepseek-ai/cordis'
import type { DeploymentRegistry } from '@deepseek-ai/dsh-app-builder-deployment'
import type { DeployRequest, DeployValue } from './types.ts'

/**
 * Build the typed \`not-implemented\` failure the deferred methods throw.
 * @param method - Remote method name the caller requested.
 * @param reason - one-line summary of the missing owner.
 * @returns the failure instance, suitable for \`throw\` or \`Promise.reject\`.
 */
export function notImplemented(method: string, reason: string): TypertRemoteFailure {
  return new TypertRemoteFailure({
    code: 'not-implemented',
    message: `app-builder.api.${method} is deferred: ${reason}`,
    details: { method },
  })
}

/**
 * Resolve the deployment registry. The BFF treats the deployment service
 * as a soft dependency: when the plugin is not mounted, the Remote method
 * returns the typed \`not-implemented\` failure so a deployment bundle
 * that omits the plugin still answers the wire method with a typed
 * rejection rather than a hard property-access throw.
 * @param ctx - Cordis context carrying the App Builder registries.
 * @returns the registry, or \`undefined\` when the plugin is unmounted.
 */
function readDeploymentRegistry(ctx: Context): DeploymentRegistry | undefined {
  const candidate = ctx.get('appBuilderDeployment') as unknown
  if (candidate === undefined || candidate === null) return undefined
  return candidate as DeploymentRegistry
}

/**
 * \`deploy\` implementation. Delegates to \`ctx.appBuilderDeployment.deploy\`
 * and projects the resulting record into the public \`DeployValue\` shape
 * (projectId + deploymentId + resolved url). Returns the typed
 * \`not-implemented\` failure when the deployment plugin is not mounted.
 * @param ctx - Cordis context carrying the deployment registry.
 * @param request - the deploy payload (projectId + optional target).
 * @returns the public deploy value, or never (throws) on missing owner.
 */
export async function deployRemote(ctx: Context, request: DeployRequest): Promise<DeployValue> {
  await Promise.resolve()
  const registry = readDeploymentRegistry(ctx)
  if (registry === undefined) {
    throw notImplemented('deploy', '@deepseek-ai/dsh-app-builder-deployment is not mounted in this composition')
  }
  const deployment = await registry.deploy(request)
  const value = registry.toValue(deployment.id)
  if (value === undefined) {
    throw new TypertRemoteFailure({
      code: 'internal',
      message: 'deployment registry returned no value for the just-completed deployment id',
      details: { deploymentId: deployment.id },
    })
  }
  return value
}
