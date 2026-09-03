/**
 * App Builder snapshot bridge types. The snapshot is a flat file-projection
 * the host publishes under `/__dsh/app-builder/snapshot.json`; the projects
 * pane polls it every `pollIntervalMs` and renders the resulting list.
 *
 * Two-level shape: a top-level `ts` echo of the last write, a `projects`
 * list of every durable project, a `devServers` map keyed by project id
 * for live preview state, and a `sessionCounts` map keyed by project id
 * carrying the count of live sessions whose `project` projection resolves
 * to the matching project. The host may add new fields; the projects pane
 * reads every entry point but only renders `projects` and surfaces the
 * matching dev-server status and session count from `devServers` and
 * `sessionCounts`.
 */

/** Status a project's preview dev server is currently in. */
export type DevServerStatus = 'idle' | 'starting' | 'ready' | 'failed'

/** Live preview state for one App Builder project. */
export interface AppBuilderDevServer {
  /** Localhost URL the dev server is bound to (e.g. `http://127.0.0.1:5173`); absent while idle. */
  url?: string
  /** Port the dev server is bound to; `-1` while idle or pending. */
  port: number
  /** Current status of the preview dev server. */
  status: DevServerStatus
  /** Last status message from the host (e.g. framework-detected, framework: `vite`). */
  message?: string
  /** Last update timestamp (epoch ms); absent on the first idle entry. */
  updatedAt?: number
}

/** One durable App Builder project as published in the snapshot. */
export interface AppBuilderProject {
  /** Stable project id; opaque to the client (matches `@deepseek-ai/dsh-app-builder-project`). */
  id: string
  /** Display title for the projects list row. */
  title: string
  /** Absolute host cwd of the scaffolded project root. */
  rootPath: string
  /** Scaffold template id (e.g. `svelte-spa`, `nextjs-app`); undefined for hand-built projects. */
  template?: string
  /** Creation timestamp (epoch ms). */
  createdAt: number
}

/** Full App Builder snapshot as served by the host snapshot endpoint. */
export interface AppBuilderSnapshot {
  /** Last write timestamp (epoch ms); zero on the initial empty file. */
  ts: number
  /** All durable projects, in host-publication order. */
  projects: readonly AppBuilderProject[]
  /** Per-project preview state; absent keys mean no preview has run yet. */
  devServers: Readonly<Record<string, AppBuilderDevServer>>
  /**
   * Per-project live-session count, derived from the host's `project`
   * projection unit (Phase 1.5.4). The host counts every live session whose
   * projection resolves to a registered project; sessions outside every
   * project (no cwd, cwd outside any project root) do not contribute to any
   * key. Missing on snapshots published by hosts older than Phase 2.4; the
   * pane renders no badge when the key is absent or the value is zero.
   */
  sessionCounts: Readonly<Record<string, number>>
}

/** Initial empty snapshot used before the first host write. */
export const EMPTY_SNAPSHOT: AppBuilderSnapshot = {
  ts: 0,
  projects: [],
  devServers: {},
  sessionCounts: {},
}
