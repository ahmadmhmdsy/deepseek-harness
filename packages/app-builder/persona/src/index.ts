/**
 * @module @deepseek-ai/dsh-app-builder-persona
 *
 * App Builder persona plugin. On `apply()` it mounts the App Builder
 * identity as the `deployment:persona` system-prompt section for the
 * mounting context scope, by delegating to `@deepseek-ai/dsh-persona`.
 *
 * The plugin exists so the App Builder bundle can patch in a single
 * `app-builder-persona` row and inherit one consistent identity across
 * every preset that uses it. Mounting it unscoped collides with the
 * prompt registry's own persona registration (re-exported from
 * `@deepseek-ai/dsh-persona`); a deployment that needs a process-wide
 * persona change belongs in `dsh-system-prompt`'s own config.
 */

import type { Context } from '@deepseek-ai/cordis'
import { apply as applyPersona, Config as PersonaConfig } from '@deepseek-ai/dsh-persona'
import { APP_BUILDER_PERSONA } from './text.ts'

/** Cordis plugin name used by loader diagnostics and the bundle patch row. */
export const name = 'app-builder-persona'

/** The prompt registry this row delegates to. */
export const inject = ['systemPrompt']

/** Re-export the canonical PERSONA_SECTION identifier so consumers can import one package. */
export { PERSONA_ORDER, PERSONA_SECTION } from '@deepseek-ai/dsh-persona'

/** Plugin-level config: the App Builder identity overrides for one agent preset. */
export interface Config {
  /** Persona text rendered as the `deployment:persona` section. Defaults to the App Builder identity. */
  text?: string
  /** Make this persona the complete system prompt, suppressing every other section. */
  complete?: boolean
  /** Suppress dynamic runtime-context snapshots for this persona's agent scope. */
  includeRuntimeContext?: boolean
}

export { APP_BUILDER_PERSONA } from './text.ts'

/**
 * Mount the App Builder persona as the `deployment:persona` section for
 * the mounting context's scope. Delegates to `@deepseek-ai/dsh-persona` so
 * the canonical prompt-registry integration (scope check, complete mode,
 * runtime-context suppression, HMR-safe disposal) is reused unchanged.
 * @param ctx - an agent scope context; an unscoped context collides with
 * the prompt registry's own persona registration and rejects.
 * @param config - the persona overrides; `text` defaults to the App Builder identity.
 */
export function apply(ctx: Context, config: Config = {}): void {
  const resolved = PersonaConfig({
    text: config.text ?? APP_BUILDER_PERSONA,
    ...(config.complete !== undefined ? { complete: config.complete } : {}),
    ...(config.includeRuntimeContext !== undefined ? { includeRuntimeContext: config.includeRuntimeContext } : {}),
  })
  applyPersona(ctx, resolved)
}
