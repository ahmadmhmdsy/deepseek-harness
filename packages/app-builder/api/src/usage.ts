/**
 * \`getUsage\` Remote method for the App Builder Host BFF.
 *
 * Delegates to \`@deepseek-ai/dsh-token-meter\` (\`ctx.tokenMeter.measure\`)
 * and projects the resulting \`TokenMeasurement\` into the public
 * \`GetUsageValue\` shape. The meter owns the replay-aware token fold
 * (cache-aware request pressure + signed surface delta); this method is a
 * thin projection that also normalises the cold-paths the BFF accepts:
 *
 * - \`sessionId\` (live Session): the meter replays the durable tail; the
 *   current surface and the latest \`assistant/message\` anchor drive the
 *   measurement.
 * - \`projectId\` alone: requires enumerating every Session of the project,
 *   which lands when Phase 2.4 wires the project projection unit. The
 *   method answers with a typed \`not-implemented\` failure until then so
 *   a missing owner never silently succeeds.
 *
 * The cost surface is intentionally zero in Phase 2.3: the LLM package
 * exposes \`LlmImageRequestPricing\` for visual tokens only and no per-route
 * price table is in tree. The \`costUsd: 0\` value is the honest answer; a
 * Phase 2.5 follow-up introduces a DeepSeek price table the BFF projects
 * into the same field without changing the wire shape.
 * @module @deepseek-ai/dsh-app-builder-api/usage
 */

import { TypertRemoteFailure } from '@deepseek-ai/dsh-typert-protocol'
import type { Context } from '@deepseek-ai/cordis'
import type { Session, SessionId } from '@deepseek-ai/dsh-session'
import type { TokenMeasurement, TokenMeter } from '@deepseek-ai/dsh-token-meter'
import type { GetUsageRequest, GetUsageValue } from './types.ts'

/**
 * Resolve the token-meter service. The meter is a required peer of the App
 * Builder BFF (every App Builder composition mounts it through dsh-base or
 * the App Builder bundle), so an absent meter is a misconfiguration; the
 * helper throws a typed \`service-unavailable\` failure rather than a
 * generic TypeError.
 * @param ctx - Cordis context.
 * @returns the TokenMeter service.
 */
function tokenMeterOf(ctx: Context): TokenMeter {
  const candidate = ctx.get('tokenMeter') as unknown
  if (candidate === undefined || candidate === null) {
    throw new TypertRemoteFailure({
      code: 'service-unavailable',
      message: 'app-builder.api.getUsage requires @deepseek-ai/dsh-token-meter to be mounted',
      details: {},
    })
  }
  return candidate as TokenMeter
}

/**
 * Resolve the live Session for a \`sessionId\` query. The token meter only
 * measures live Sessions: the meter keeps a per-session fold over the
 * durable tail, so an attached Session is the only state in which a
 * current-pressure measurement is meaningful. Cold-replay measurement
 * belongs to the Phase 2.4 projection unit; until then, an unattached
 * Session returns a typed \`not-found\` failure so a caller can fall back
 * to \`getTranscript\` + offline accounting.
 * @param ctx - Cordis context.
 * @param sessionId - durable Session identity.
 * @returns the live Session.
 */
function sessionOf(ctx: Context, sessionId: SessionId): Session {
  const candidate = ctx.get('sessions')?.get(sessionId)
  if (candidate === undefined) {
    throw new TypertRemoteFailure({
      code: 'not-found',
      message: `getUsage: no live Session with id ${sessionId}`,
      details: { sessionId },
    })
  }
  return candidate
}

/**
 * Project a \`TokenMeasurement\` into the public \`GetUsageValue\` shape.
 *
 * - \`tokensIn\` is the meter's current request pressure (baseline + signed
 *   surface delta). It already includes cache reads / writes when the
 *   baseline carries a provider-reported \`usage\`.
 * - \`tokensOut\` is the provider-reported output token count, only
 *   available when the baseline \`kind\` is \`'usage'\`; otherwise zero.
 * - \`costUsd\` is zero because Phase 2.3 ships without a per-route price
 *   table; see the module JSDoc for the Phase 2.5 follow-up.
 * - \`cacheHitRate\` is the input-side cache-hit rate (cache read / total
 *   baseline tokens) when the baseline carries a provider-reported
 *   \`usage\`; otherwise zero. The denominator is clamped at zero when the
 *   baseline is empty so a cold session never reports \`NaN\`.
 * @param measurement - replay-aware token meter output.
 * @returns the public \`GetUsageValue\` shape.
 */
function toValue(measurement: TokenMeasurement): GetUsageValue {
  const baseline = measurement.baseline
  if (baseline.kind === 'usage') {
    const usage = baseline.usage
    const denominator = Math.max(1, baseline.tokens)
    const cacheReadTokens = usage.cacheReadTokens ?? 0
    return {
      tokensIn: measurement.totalTokens,
      tokensOut: usage.outputTokens,
      costUsd: 0,
      cacheHitRate: cacheReadTokens / denominator,
    }
  }
  return {
    tokensIn: measurement.totalTokens,
    tokensOut: 0,
    costUsd: 0,
    cacheHitRate: 0,
  }
}

/**
 * \`getUsage\` implementation. Reads \`ctx.tokenMeter.measure(session)\` for
 * the requested Session and projects the measurement into the public
 * \`GetUsageValue\` shape.
 * @param ctx - Cordis context carrying the token meter + Session store.
 * @param request - usage query (projectId and / or sessionId).
 * @returns the public \`GetUsageValue\`.
 */
export async function getUsageRemote(
  ctx: Context,
  request: GetUsageRequest,
): Promise<GetUsageValue> {
  await Promise.resolve()
  if (request.sessionId === undefined && request.projectId === undefined) {
    throw new TypertRemoteFailure({
      code: 'bad-request',
      message: 'getUsage requires either sessionId or projectId',
      details: {},
    })
  }
  if (request.sessionId === undefined) {
    // Project-scoped aggregation requires enumerating every Session of the
    // project; the project projection unit lands in Phase 2.4. Until then
    // the wire method answers with a typed \`not-implemented\` failure so a
    // missing owner never silently succeeds.
    throw new TypertRemoteFailure({
      code: 'not-implemented',
      message: 'app-builder.api.getUsage projectId-only aggregation lands with the Phase 2.4 projection unit',
      details: { projectId: request.projectId ?? null },
    })
  }
  const meter = tokenMeterOf(ctx)
  const session = sessionOf(ctx, request.sessionId as SessionId)
  const measurement = meter.measure(session)
  return toValue(measurement)
}
