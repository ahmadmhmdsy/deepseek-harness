/**
 * @module @deepseek-ai/dsh-app-builder-project/invariant
 *
 * Phase 1 ships an empty installer: the registry's state is process-local and
 * the durable truth lives in the session-log `project/created` event. A
 * later phase adds the registry-vs-log relation check.
 */
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-app-builder-project'

const install: InvariantInstaller = () => {}

export function registerInvariant(ctx: { invariants: { register(name: string, installer: InvariantInstaller): () => void } }): () => void {
  return ctx.invariants.register(PACKAGE_NAME, install)
}

export default install
