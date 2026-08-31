/** Package-owned ToolPolicy event invariants. @module @deepseek-ai/dsh-app-builder-tool-policy/invariant */

import type { Context } from '@deepseek-ai/cordis'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type { InvariantFailure, InvariantInstaller } from '@deepseek-ai/dsh-invariants'
import { TOOL_ACTIONS } from './types.ts'

const PACKAGE_NAME = '@deepseek-ai/dsh-app-builder-tool-policy'

/** Cordis companion plugin name. */
export const name = 'tool-policy-invariant'

/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * Validate that every logged toolPolicy/decision event references a
 * registered policy (or carries the explicit null policy id on the
 * fallback path) and an action drawn from the closed ToolAction
 * vocabulary. The invariant cannot check the upstream evaluation
 * pipeline — only that the recorded event satisfies the closed
 * vocabularies the registry declares.
 */
function validateEvent(ctx: Context, event: SessionEvent, fail: InvariantFailure): void {
  if (event.type !== 'toolPolicy/decision') return
  const data = event.data
  const registry = ctx.get('toolPolicy') as { get(id: string): unknown } | undefined
  if (registry === undefined) return
  if (data.policyId !== null && registry.get(data.policyId) === undefined) {
    fail(`toolPolicy/decision references unknown policy id ${JSON.stringify(data.policyId)}`)
  }
  if (data.action !== null && !(TOOL_ACTIONS as readonly string[]).includes(data.action)) {
    fail(`toolPolicy/decision carries unknown action ${JSON.stringify(data.action)}`)
  }
  if (data.kind === 'fallback' && data.policyId !== null) {
    fail('toolPolicy/decision kind=fallback requires policyId=null')
  }
  if (data.kind !== 'fallback' && data.policyId === null) {
    fail(`toolPolicy/decision kind=${data.kind} requires a non-null policyId`)
  }
}

/** Install validation that loaded and newly appended toolPolicy/decision events remain coherent. */
const install: InvariantInstaller = Object.assign((ctx: Context, fail: InvariantFailure) => {
  for (const session of ctx.sessions.list()) {
    for (const event of session.events) validateEvent(ctx, event, fail)
  }
  ctx.on('internal/dispatch', (_mode, eventName, args) => {
    if (eventName !== 'session/event') return
    const event = (args as [Session, SessionEvent])[1]
    validateEvent(ctx, event, fail)
  }, { global: true })
}, { inject: ['toolPolicy', 'sessions'] })

/**
 * Register the ToolPolicy invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
