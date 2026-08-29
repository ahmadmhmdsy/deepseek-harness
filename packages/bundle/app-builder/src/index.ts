/**
 * @module @deepseek-ai/dsh-app-builder
 *
 * The App Builder MVP bundle. `cordis.patch.yml` registers the four App Builder
 * plugins over the dsh-base profile. The JavaScript surface here is intentionally
 * minimal: the bundle's behavior is the patch itself, not a runtime plugin.
 */

export const name = 'app-builder-bundle'

/** This bundle has no per-row runtime. Patch loading IS the apply step. */
export function apply() {}
