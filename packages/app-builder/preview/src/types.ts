/**
 * Public types for the App Builder preview tool.
 *
 * The preview tool runs a project dev server in the background and waits for
 * HTTP readiness before returning the URL the model can hand to the App
 * Builder UI iframe pane. The shape stays narrow: arguments are validated
 * up front and the result is a flat record with the runtime facts the UI
 * needs (job id, port, URL, host).
 * @module @deepseek-ai/dsh-app-builder-preview/types
 */

/**
 * Detected framework for the project dev script. The preview tool
 * branches on this to pick the right port flag (`-p` for next, `--port`
 * for vite); `unknown` falls through to running the script verbatim with
 * `PORT` exposed through the environment.
 */
export type PreviewFramework = 'next' | 'vite' | 'unknown'

/** Inputs to the `app_builder_preview` model-facing tool. */
export interface PreviewToolArgs {
  /** Project root path (default: session workspace cwd). */
  rootPath?: string
  /** Explicit port to bind (default: pick a free ephemeral port). */
  port?: number
  /** Framework override; auto-detected from the project package.json when omitted. */
  framework?: PreviewFramework
  /** Readiness poll timeout in milliseconds (default 30000). */
  readyTimeoutMs?: number
  /** Poll interval in milliseconds (default 250). */
  pollIntervalMs?: number
}

/**
 * Successful preview start result. `status` is always `ready` for this
 * shape; non-ready results surface as a thrown error so the model sees the
 * readiness timeout message instead of a half-formed record.
 */
export interface PreviewResult {
  /** Background job id (owner-fenced by the session). */
  jobId: string
  /** Detected framework. */
  framework: PreviewFramework
  /** Localhost bind host. */
  host: '127.0.0.1'
  /** TCP port the dev server bound to. */
  port: number
  /** Model-facing URL pointing at the dev server root. */
  url: string
  /** Number of readiness polls performed before the server responded. */
  polls: number
  /** Wall-clock milliseconds spent waiting for readiness. */
  readyMs: number
}

/**
 * Pure readiness helper inputs. Kept narrow so unit tests can drive the
 * poll loop without spinning a real server.
 */
export interface ReadinessProbe {
  /** Hostname or IP to dial (default: 127.0.0.1). */
  host: string
  /** TCP port. */
  port: number
  /** Path to GET (default: `/`). */
  path?: string
  /** Max wall-clock milliseconds to wait (default 30000). */
  timeoutMs: number
  /** Interval between polls (default 250). */
  pollIntervalMs: number
  /** Abort signal - when fired, the helper throws and stops polling. */
  signal: AbortSignal
}
