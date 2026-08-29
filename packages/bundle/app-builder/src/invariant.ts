/**
 * @module @deepseek-ai/dsh-app-builder/invariant
 *
 * The bundle patch layer carries no runtime invariant of its own: each
 * loaded plugin (project, scaffold, preview, persona) registers its own
 * installer when activated. The bundle records package ownership here so
 * `verify-package-invariants` does not flag the empty bundle.
 */
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-app-builder'

const install: InvariantInstaller = () => {}

export function registerInvariant(ctx: { invariants: { register(name: string, installer: InvariantInstaller): () => void } }): () => void {
  return ctx.invariants.register(PACKAGE_NAME, install)
}

export default install
