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
 * The shell also publishes a `appBuilder` Cordis service so sibling packages
 * (the projects pane today, the preview pane tomorrow) can read and write
 * the selection without leaking the store handle across the package
 * boundary. Cross-package store sharing is forbidden by slot-system design;
 * service handles are the sanctioned channel.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pull the locale plugin Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { createAppBuilderShellStore, type AppBuilderShellStore } from './stores.ts'
import { Shell } from './Shell.tsx'
import { en, zh, type AppBuilderShellKey } from './locales.ts'

export type {
  AppBuilderConversationOwnerProps, AppBuilderPreviewOwnerProps, AppBuilderProjectsOwnerProps,
  AppBuilderShellComponentProps, AppBuilderShellOwnerProps,
} from './contract/slots.ts'
export type { AppBuilderShellKey } from './locales.ts'
export type { AppBuilderShellStore } from './stores.ts'

/**
 * Cordis service handle the shell publishes for sibling packages. The
 * projects pane writes selection through `selectProject`; future panes may
 * add their own narrow members. The shape is the consumer-facing contract;
 * the implementation owns the bound selection store.
 */
export interface AppBuilderShellService {
  /**
   * Write the selected project id into the shell's selection store. Idempotent
   * on equal values; the preview pane observes the store through its standard
   * PropsStore share.
   * @param id - the App Builder project id to select.
   */
  selectProject: (id: string) => void
  /**
   * Read the current selected project id; used by preview-pane callers that
   * arrive without owner props. Returns `undefined` when no project is
   * selected.
   */
  getSelectedProjectId: () => string | undefined
}

/**
 * Cordis Context merge: the shell exposes `ctx.appBuilder` to sibling
 * packages. The shell owns the implementation; consumer packages declare
 * their own narrower view (the merge is additive in TypeScript and the
 * shell's full implementation wins at runtime).
 */
declare module '@deepseek-ai/cordis' {
  interface Context {
    appBuilder: AppBuilderShellService
  }
}

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

  // One store handle: the slot entry owns it as its exclusive seat, and the
  // service handle exposes its actions to sibling packages. Module-level
  // handles are forbidden; the apply closure scopes this one to the plugin
  // fiber.
  const storeHandle: AppBuilderShellStore = createAppBuilderShellStore()

  // Expose the selection service as a Cordis service so the projects pane
  // (a separate package) can write the selection without leaking the store
  // Resolve one engine instance up front: the framework's storeOf() caches
  // per (handle, scope) and would resolve the same handle to the same
  // instance, but capturing it here lets the service closure avoid the
  // framework lookup on every selectProject call.
  const storeInstance = storeHandle.create()
  ctx.effect(() => {
    const service: AppBuilderShellService = {
      selectProject: (id) => { storeInstance.actions.selectProject(id) },
      getSelectedProjectId: () => storeInstance.getSnapshot().selectedProjectId,
    }
    return ctx.reflect.provide('appBuilder', service)
  }, 'ui-app-builder-shell: appBuilder service')

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
    store: storeHandle,
  }, Shell))
}
