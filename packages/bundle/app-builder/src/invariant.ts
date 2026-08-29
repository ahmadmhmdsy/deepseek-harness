/**
 * @module @deepseek-ai/dsh-app-builder/invariant
 *
 * Registers the bundle manifest name with the runtime-diagnostics invariant registry.
 * No runtime invariant is asserted by this bundle itself: the patch is the unit of
 * composition, and individual package invariants assert each plugin's relationship.
 */
import { registerManifest } from '@deepseek-ai/dsh-invariants'

registerManifest({
  name: '@deepseek-ai/dsh-app-builder',
  reason: 'No runtime invariant: this bundle is a `cordis.patch.yml` patch layer; the four plugin invariants (project, scaffold, preview, persona) own the relationship checks.',
})

export {}
