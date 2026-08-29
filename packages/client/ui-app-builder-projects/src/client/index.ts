/**
 * App Builder projects pane plugin, browser half. Registers the projects list
 * into the host-declared `app-builder.projects` slot through
 * `ctx.slots.inject` (chain take-over for child slots), then drives a
 * background polling effect that writes the latest snapshot into the slot-
 * declared store. The selection callback closes over the shell's
 * `ctx.appBuilder` service handle; cross-package store sharing is forbidden
 * by design, so the only escape hatch is a callback typed through the host
 * `Context` augmentation (the consumer view in `./contract/slots.ts`).
 *
 * The polling interval defaults to 5 s (the planning step's documented value)
 * and is configurable for tests. Phase 2 replaces polling with SSE.
 *
 * Phase 1 wired details:
 * - `snapshotUrl` is a static URL configured at boot from apps/web's static
 *   modules payload; empty disables polling entirely.
 * - `selectProject` is the shell's selection callback; the projects pane
 *   never touches the shell's store handle directly.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin Context merge (ctx.locale) and the shell's
// appBuilder service merge (ctx.appBuilder).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-app-builder-shell/client'
import type { AppBuilderShellService } from './app-builder.ts'
import { createAppBuilderProjectsSnapshotStore } from './stores.ts'
import { ProjectsList } from './ProjectsList.tsx'
import { en, zh, type AppBuilderProjectsKey } from './locales.ts'
import { EMPTY_SNAPSHOT, type AppBuilderDevServer, type AppBuilderProject, type AppBuilderSnapshot } from './snapshot.ts'

export type {
  AppBuilderProjectsComponentProps, AppBuilderProjectsHooks, AppBuilderProjectsInjected,
  UseAppBuilderSnapshot,
} from './contract/slots.ts'
export type { AppBuilderProjectsKey } from './locales.ts'
export type { AppBuilderProjectsState } from './stores.ts'
export type {
  AppBuilderDevServer, AppBuilderProject, AppBuilderSnapshot, DevServerStatus,
} from './snapshot.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** App Builder projects pane copy (header, empty states, status labels). */
    'app-builder-projects': AppBuilderProjectsKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'app-builder-projects'

/** Default snapshot poll interval (ms). */
export const DEFAULT_POLL_INTERVAL_MS = 5_000

/** Plugin configuration: drives the snapshot bridge and the take-over. */
export interface Config {
  /** Snapshot endpoint URL; empty disables polling. Configured at boot from apps/web. */
  snapshotUrl?: string
  /** Poll interval (ms); clamped to [1000, 60000]. */
  pollIntervalMs?: number
}

/** Required services (cordis fiber inject — the loader passes all module exports as an object plugin). */
export const inject = ['slots', 'locale', 'appBuilder']

/**
 * Register the App Builder projects pane into the host-declared
 * `app-builder.projects` slot and drive the snapshot polling effect.
 * @param ctx - Client root context.
 * @param config - Plugin configuration (see Config).
 */
export function apply(ctx: ClientContext, config: Config = {}): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-app-builder-projects: dictionaries')

  const snapshotUrl = config.snapshotUrl ?? ''
  const pollIntervalMs = clampInterval(config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS)

  // One snapshot store per apply: the polling effect writes via `set` /
  // `update`, and the inject `hooks` compartment exposes the same instance
  // as a HostObservable so the component reads via the standard
  // `useSnapshot` selector hook. The store's writable face stays in apply
  // world; components never see `update` or `set`.
  const snapshotStore = createAppBuilderProjectsSnapshotStore()

  if (snapshotUrl !== '') {
    ctx.effect(() => {
      let cancelled = false
      let timer: ReturnType<typeof setTimeout> | null = null
      const poll = async (): Promise<void> => {
        if (cancelled) return
        snapshotStore.set({ ...snapshotStore.getSnapshot(), loading: true })
        try {
          const snapshot = await fetchSnapshot(snapshotUrl)
          if (cancelled) return
          snapshotStore.set({ snapshot, error: null, lastSuccessAt: Date.now(), loading: false })
        } catch (reason: unknown) {
          if (cancelled) return
          const message = reason instanceof Error ? reason.message : String(reason)
          snapshotStore.update((draft) => { draft.error = message; draft.loading = false })
        }
        if (cancelled) return
        timer = setTimeout(poll, pollIntervalMs)
      }
      void poll()
      return () => {
        cancelled = true
        if (timer !== null) clearTimeout(timer)
      }
    }, 'ui-app-builder-projects: snapshot polling')
  } else {
    snapshotStore.set({ snapshot: EMPTY_SNAPSHOT, error: 'snapshot_unconfigured', lastSuccessAt: 0, loading: false })
  }

  // The service handle is captured once at apply time. The shell's slot
  // re-declaration tears down and rebuilds our registration; the closure
  // re-reads `ctx.appBuilder` on every rebuild so HMR swaps are picked up.
  const selectProject = (id: string): void => {
    ;(ctx.appBuilder as AppBuilderShellService).selectProject(id)
  }

  ctx.slots.inject('app-builder.projects', () => ctx.slots.register({
    name: 'app-builder.projects',
    locale: NS,
    inject: () => ({
      snapshotUrl,
      selectProject,
      hooks: { snapshot: snapshotStore },
    }),
  }, ProjectsList))
}

/** Fetch the snapshot JSON, normalizing the response shape. */
async function fetchSnapshot(url: string): Promise<AppBuilderSnapshot> {
  const response = await fetch(url, {
    headers: { 'accept': 'application/json' },
    credentials: 'same-origin',
  })
  if (!response.ok) {
    throw new Error('snapshot fetch failed: ' + String(response.status) + ' ' + String(response.statusText))
  }
  const json: unknown = await response.json()
  return normalizeSnapshot(json)
}

/** Clamp the poll interval to a sane range. */
function clampInterval(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_POLL_INTERVAL_MS
  if (value < 1_000) return 1_000
  if (value > 60_000) return 60_000
  return value
}

/** Coerce a JSON value into the canonical snapshot shape. */
function normalizeSnapshot(value: unknown): AppBuilderSnapshot {
  if (typeof value !== 'object' || value === null) {
    return EMPTY_SNAPSHOT
  }
  const record = value as Record<string, unknown>
  const tsRaw = record['ts']
  const projectsRaw = record['projects']
  const devServersRaw = record['devServers']
  return {
    ts: typeof tsRaw === 'number' && Number.isFinite(tsRaw) ? tsRaw : 0,
    projects: Array.isArray(projectsRaw)
      ? projectsRaw.map(normalizeProject).filter((p): p is AppBuilderProject => p !== null)
      : [],
    devServers: isPlainRecord(devServersRaw)
      ? Object.fromEntries(
        Object.entries(devServersRaw)
          .map(([id, dev]) => [id, normalizeDevServer(dev)])
          .filter((entry): entry is [string, AppBuilderDevServer] => entry[1] !== null),
      )
      : {},
  }
}

function normalizeProject(value: unknown): AppBuilderProject | null {
  if (typeof value !== 'object' || value === null) return null
  const r = value as Record<string, unknown>
  const id = typeof r['id'] === 'string' ? r['id'] : ''
  const title = typeof r['title'] === 'string' ? r['title'] : ''
  const rootPath = typeof r['rootPath'] === 'string' ? r['rootPath'] : ''
  if (id === '' || title === '' || rootPath === '') return null
  const createdAtRaw = r['createdAt']
  const template = typeof r['template'] === 'string' ? r['template'] : undefined
  return {
    id,
    title,
    rootPath,
    createdAt: typeof createdAtRaw === 'number' && Number.isFinite(createdAtRaw) ? createdAtRaw : 0,
    ...(template !== undefined ? { template } : {}),
  }
}

function normalizeDevServer(value: unknown): AppBuilderDevServer | null {
  if (typeof value !== 'object' || value === null) return null
  const r = value as Record<string, unknown>
  const portRaw = r['port']
  const status = typeof r['status'] === 'string' ? r['status'] : 'idle'
  if (status !== 'idle' && status !== 'starting' && status !== 'ready' && status !== 'failed') return null
  const url = typeof r['url'] === 'string' ? r['url'] : undefined
  const message = typeof r['message'] === 'string' ? r['message'] : undefined
  const updatedAt = typeof r['updatedAt'] === 'number' ? r['updatedAt'] : undefined
  return {
    port: typeof portRaw === 'number' && Number.isFinite(portRaw) ? portRaw : -1,
    status,
    ...(url !== undefined ? { url } : {}),
    ...(message !== undefined ? { message } : {}),
    ...(updatedAt !== undefined ? { updatedAt } : {}),
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
