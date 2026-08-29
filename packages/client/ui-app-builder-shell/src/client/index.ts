/**
 * App Builder shell plugin, browser half. Registers the 3-pane shell into
 * the root layout through the slot-declaration-injection chain pattern: the
 * chain entry waits on the actual root declaration and tears down with the
 * caller plugin fiber. The shell declares three child slots - projects,
 * preview (root scope) and conversation (session scope) - and renders them
 * through the four prop shares.
 *
 * The enabled config controls whether the chain entry takes over: when false
 * the chain callback returns no registration and the existing root layout
 * remains in place.
 *
 * Phase 1 placeholder: selection state lives in the slot-declared store; the
 * children (projects pane) read selection through their own PropsStore share
 * and call the store actions directly. The shell inject face is empty.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pull the locale plugin Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { createAppBuilderShellStore } from './stores.ts'
import { Shell } from './Shell.tsx'
import { en, zh, type AppBuilderShellKey } from './locales.ts'

export type {
  AppBuilderConversationOwnerProps, AppBuilderPreviewOwnerProps, AppBuilderProjectsOwnerProps,
  AppBuilderShellComponentProps, AppBuilderShellOwnerProps,
} from './contract/slots.ts'
export type { AppBuilderShellKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** App Builder shell chrome copy (header title, pane labels). */
    'app-builder-shell': AppBuilderShellKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'app-builder-shell'

/** Plugin configuration: enabled gates the chain take-over. */
export interface Config {
  /**
   * When true (default), the shell takes over the root layout. When false,
   * the chain entry does not register and the existing root layout renders.
   * Configured at boot from apps/web via the static modules payload.
   */
  enabled?: boolean
}

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale']

/**
 * Register the App Builder shell.
 * @param ctx - Client root context.
 * @param config - Plugin configuration (see Config).
 */
export function apply(ctx: ClientContext, config: Config = {}): void {
  const enabled = config.enabled !== false
  if (!enabled) return

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-app-builder-shell: dictionaries')

  // Chain take-over: wait for the root slot to be declared by the existing
  // root layout, then register the shell as an alternate renderer. The shell
  // entry lifetime ties to the caller plugin fiber.
  ctx.slots.inject('root', () => ctx.slots.register({
    name: 'app-builder-shell',
    locale: NS,
    children: {
      'app-builder.projects': { kind: 'single', scope: 'root' },
      'app-builder.preview': { kind: 'single', scope: 'root' },
      'app-builder.conversation': { kind: 'single', scope: 'session' },
    },
    store: createAppBuilderShellStore(),
  }, Shell))
}
