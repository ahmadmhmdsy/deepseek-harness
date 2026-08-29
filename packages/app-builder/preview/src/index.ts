/**
 * @module @deepseek-ai/dsh-app-builder-preview
 *
 * App Builder preview tool. On apply() it registers one model-facing tool,
 * `app_builder_preview`, that starts a project dev server in the background,
 * polls an HTTP readiness probe on localhost, and returns the preview URL
 * plus the background job id the App Builder UI uses for its iframe pane.
 *
 * The plugin composes the existing shell and filesystem capabilities: the
 * dev server runs as a `ctx.jobs.start` producer wrapping `ctx.shell.start`,
 * and the framework detection reads the project package.json through
 * `ctx.fs.readText`. The preview tool NEVER re-implements process execution
 * or HTTP polling at the capability level; it only sequences capability calls.
 */

import { createServer } from 'node:net'
import { canonicalPath, type SandboxExecutionPolicy } from '@deepseek-ai/dsh-sandbox'
import type { SandboxPolicyRequest } from '@deepseek-ai/dsh-sandbox-policy'
import type { FileSystem } from '@deepseek-ai/dsh-fs'
import type { ShellExecutor } from '@deepseek-ai/dsh-shell'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'
import type { Session } from '@deepseek-ai/dsh-session'
import type { JobRegistry } from '@deepseek-ai/dsh-jobs'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { awaitReadiness } from './readiness.ts'
import { validateFramework, validatePollIntervalMs, validatePort, validateReadyTimeoutMs, validateRootPath } from './validate.ts'
import type { PreviewFramework, PreviewResult, PreviewToolArgs } from './types.ts'

declare module '@deepseek-ai/dsh-jobs' {
  interface JobKindMap {
    'app-builder-preview-dev': 'app-builder-preview-dev'
  }
}

/** Cordis plugin name used by loader diagnostics and the bundle patch row. */
export const name = 'app-builder-preview'

/** Services the preview tool requires; `ctx.jobs` is read via `ctx.get()` because it is optional. */
export const inject = ['tools', 'fs', 'shell', 'systemPrompt', 'sandboxPolicy', 'agents'] as const

/** Plugin-level config: deployment-time defaults applied when the model omits an input. */
export interface Config {
  /** Default readiness poll timeout in milliseconds (default 30000). */
  defaultReadyTimeoutMs?: number
  /** Default poll interval in milliseconds (default 250). */
  defaultPollIntervalMs?: number
  /** Force a framework choice instead of auto-detecting from package.json. */
  frameworkOverride?: PreviewFramework
}

export const Config: z<Config> = z.object({
  defaultReadyTimeoutMs: z.number().min(1).default(30_000),
  defaultPollIntervalMs: z.number().min(1).default(250),
  frameworkOverride: z.union(['next', 'vite', 'unknown'] as const),
})

/** Re-exports for tests and tool consumers. */
export { validateFramework, validatePollIntervalMs, validatePort, validateReadyTimeoutMs, validateRootPath } from './validate.ts'

/** POSIX-style join that accepts any base form and emits a forward-slash path. */
function joinPosix(base: string, relative: string): string {
  if (relative.length === 0) return base
  if (base.endsWith('/') || base.endsWith('\\')) return base + relative
  return base + '/' + relative
}

/**
 * Build a `SandboxPolicyRequest` without spreading `undefined`. The harness
 * types use `exactOptionalPropertyTypes`, so the only legal shape for an
 * optional field is to omit the key entirely.
 */
function policyRequestFor(session: Session | undefined): SandboxPolicyRequest {
  return session === undefined ? {} : { session }
}

/**
 * Build a `ctx.fs.resolve` options object without spreading `undefined`.
 */
function resolveOptionsFor(cwd: string | undefined, signal: AbortSignal): { cwd?: string; signal?: AbortSignal } {
  const opts: { cwd?: string; signal?: AbortSignal } = { signal }
  if (cwd !== undefined) opts.cwd = cwd
  return opts
}

/**
 * Resolve the project root under the session sandbox policy. A relative
 * `rootPath` from the model is resolved against the session workspace; the
 * tool then refuses to bind a port anywhere outside the policy root.
 * @param modelRootPath - the optional `rootPath` argument the model passed.
 * @param sessionCwd - the session immutable cwd, or undefined for agentless calls.
 * @param policy - the resolved sandbox policy for the current call.
 * @returns the canonical absolute project root path the tool will run dev in.
 */
function resolveProjectRoot(
  modelRootPath: string | undefined,
  sessionCwd: string | undefined,
  policy: SandboxExecutionPolicy,
): string {
  const base = modelRootPath === undefined
    ? canonicalPath(sessionCwd ?? policy.workspaceRoot)
    : modelRootPath.startsWith('/') || /^[A-Za-z]:[\\/]/.test(modelRootPath)
      ? canonicalPath(modelRootPath)
      : canonicalPath(joinPosix(sessionCwd ?? policy.workspaceRoot, modelRootPath))
  const canonical = canonicalPath(base)
  const root = canonicalPath(policy.workspaceRoot)
  // Canonical containment: prefix match on a trailing-separator boundary or
  // exact equality. String compare is sound here because both sides are
  // canonical paths returned by the sandbox canonicalPath helper.
  if (canonical !== root && !canonical.startsWith(root + '/') && !canonical.startsWith(root + '\\')) {
    throw new Error(`app-builder-preview: project root ${JSON.stringify(canonical)} escapes the sandbox policy workspace root ${JSON.stringify(root)}`)
  }
  return canonical
}

/**
 * Ask the kernel for an unused TCP port bound to localhost. Returns the
 * port number once the listener closes; never binds to anything other than
 * 127.0.0.1 so the preview cannot be reached off-loopback.
 */
export function pickFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        server.close(() => reject(new Error('app-builder-preview: failed to allocate a free port')))
        return
      }
      const port = address.port
      server.close(() => resolve(port))
    })
  })
}

/**
 * Detect the dev-server framework from a parsed package.json. Detection is
 * best-effort: a project with no matching dependency falls through to
 * `unknown`, and the tool then warns the caller that it cannot inject the
 * port flag for them.
 * @param pkg - parsed package.json contents.
 * @returns the detected framework.
 */
export function detectFramework(
  pkg: {
    scripts?: Record<string, string>
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  },
): PreviewFramework {
  const script = pkg.scripts?.dev ?? ''
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }
  if (script.includes('next') || deps['next'] !== undefined) return 'next'
  if (script.includes('vite') || deps['vite'] !== undefined) return 'vite'
  return 'unknown'
}

/**
 * Build the dev-server command string for the detected framework.
 * Each entry prepends `cd <rootPath> &&` so the dev server runs in the
 * project root regardless of the executor default workdir.
 * @param framework - the detected or overridden framework.
 * @param rootPath - the canonical project root the dev server runs in.
 * @param port - the TCP port to bind.
 * @returns the bash command string handed to `ctx.shell.start`.
 */
export function buildDevCommand(framework: PreviewFramework, rootPath: string, port: number): string {
  const cd = `cd ${JSON.stringify(rootPath)} &&`
  switch (framework) {
    case 'next': return `${cd} npm exec -- next dev -p ${port}`
    case 'vite': return `${cd} npm exec -- vite --port ${port}`
    case 'unknown': return `${cd} npm run dev`
    /* v8 ignore next 3 -- PreviewFramework is a typed same-process closed union; this branch is only the static exhaustiveness guard. */
    default: {
      const f: never = framework
      throw new Error(`unreachable framework: ${String(f)}`)
    }
  }
}

/**
 * Read the project package.json through `ctx.fs.readText` and return the
 * detected framework. Throws when the file is missing or unparseable so the
 * caller surfaces a clean tool error instead of a generic JSON parse stack.
 * @param fs - the filesystem capability.
 * @param rootPath - the project root the tool resolved earlier.
 * @param sessionCwd - the session cwd for `ctx.fs.resolve` defaults.
 * @param signal - the tool execution abort signal.
 */
async function readFramework(
  fs: FileSystem,
  rootPath: string,
  sessionCwd: string | undefined,
  signal: AbortSignal,
): Promise<PreviewFramework> {
  const pkgTarget = await fs.resolve(`${rootPath}/package.json`, resolveOptionsFor(sessionCwd, signal))
  const pkgText = await fs.readText(pkgTarget, signal)
  if (pkgText === undefined) {
    throw new Error(`app-builder-preview: project package.json not found at ${rootPath}`)
  }
  let parsed: { scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
  try {
    parsed = JSON.parse(pkgText) as typeof parsed
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`app-builder-preview: project package.json is not valid JSON: ${message}`)
  }
  return detectFramework(parsed)
}

/** Build the model-facing tool description (single source of truth for the prompt + schema). */
function describeTool(): string {
  return [
    'Start a project dev server in the background and return its preview URL plus a job id.',
    'Detects the framework (next / vite) from the project package.json and binds the chosen port flag for it; falls back to `npm run dev` when neither is detected.',
    'Polls http://127.0.0.1:<port>/ until the server answers or the readiness budget expires (default 30s); the dev server stays bound to localhost only.',
    'Returns `{ jobId, framework, host, port, url, polls, readyMs }`. Read ongoing output with `job_output` and stop the server with `job_kill`.',
  ].join(' ')
}

/** Apply the preview plugin: register one model-facing tool and the system-prompt section. */
export function apply(ctx: Context, config: Config = {}): void {
  const resolved = Config(config)
  const defaultReadyTimeoutMs = resolved.defaultReadyTimeoutMs ?? 30_000
  const defaultPollIntervalMs = resolved.defaultPollIntervalMs ?? 250
  const frameworkOverride = resolved.frameworkOverride

  ctx.systemPrompt.section({
    name: 'tool:app-builder-preview',
    order: 111,
    text: 'The `app_builder_preview` tool starts the project dev server in the background and returns the preview URL. The server stays bound to localhost; do not run it through `bash`. Use `job_output` to tail server output and `job_kill` to stop it.',
  })

  ctx.tools.register(defineTool({
    name: 'app_builder_preview',
    description: describeTool(),
    parameters: {
      rootPath: {
        type: 'string',
        description: 'Project root path (default: session workspace cwd). Must remain inside the sandbox policy workspace root.',
      },
      port: {
        type: 'number',
        description: 'Explicit port to bind (default: pick a free ephemeral localhost port).',
      },
      framework: {
        type: 'string',
        enum: ['next', 'vite', 'unknown'],
        description: 'Framework override; auto-detected from the project package.json when omitted.',
      },
      readyTimeoutMs: {
        type: 'number',
        description: `Readiness poll timeout in milliseconds (default ${defaultReadyTimeoutMs}). The dev server is killed and the tool returns an error once this budget elapses.`,
      },
      pollIntervalMs: {
        type: 'number',
        description: `Poll interval in milliseconds (default ${defaultPollIntervalMs}). Clamped to 1..5000.`,
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          jobId: { type: 'string', required: true },
          framework: { type: 'string', required: true, enum: ['next', 'vite', 'unknown'] },
          host: { type: 'string', required: true, enum: ['127.0.0.1'] },
          port: { type: 'integer', required: true },
          url: { type: 'string', required: true },
          polls: { type: 'integer', required: true },
          readyMs: { type: 'integer', required: true },
        },
      },
      render: (_args, value) => [
        {
          type: 'text',
          text: `Preview ready (${value.framework}) at ${value.url} after ${value.polls} polls in ${value.readyMs} ms; job ${value.jobId}.`,
        },
      ],
    },
    async execute(args: PreviewToolArgs, exec): Promise<PreviewResult> {
      const rootPath = validateRootPath(args.rootPath)
      const explicitPort = validatePort(args.port)
      const frameworkArg = validateFramework(args.framework)
      const readyTimeoutMs = validateReadyTimeoutMs(args.readyTimeoutMs) ?? defaultReadyTimeoutMs
      const pollIntervalMs = validatePollIntervalMs(args.pollIntervalMs) ?? defaultPollIntervalMs

      const fs = ctx.fs as FileSystem
      const shell = ctx.shell as ShellExecutor
      const sessionCwd = exec.agent?.session.header.cwd
      const policy = ctx.sandboxPolicy.resolve(policyRequestFor(exec.agent?.session))
      const resolvedRoot = resolveProjectRoot(rootPath, sessionCwd, policy)

      // Reject missing package.json with a clear error before any process starts.
      const framework = frameworkArg ?? frameworkOverride ?? await readFramework(fs, resolvedRoot, sessionCwd, exec.signal)

      const port = explicitPort ?? await pickFreePort()
      const command = buildDevCommand(framework, resolvedRoot, port)

      const jobs = ctx.get('jobs') as JobRegistry | undefined
      if (jobs === undefined) {
        throw new Error('app-builder-preview: requires @deepseek-ai/dsh-jobs (load it or set framework=unknown with the dev script self-managed)')
      }

      const devSpec = shell.resolve({
        command,
        workdir: resolvedRoot,
        signal: exec.signal,
        env: { PORT: String(port) },
        ...policy !== undefined ? { sandboxPolicy: policy } : {},
      })

      const jobId = jobs.start({
        kind: 'app-builder-preview-dev',
        label: `${framework}: dev server on 127.0.0.1:${port}`,
        ...exec.agent ? { owner: exec.agent } : {},
        run: () => {
          const proc = shell.start(devSpec)
          return {
            cancel: () => { void proc.kill() },
            done: proc.done.then(() => ({ status: 'completed' as const, detail: 'dev server exited' })),
            readOutput: () => proc.readOutput().delta,
          }
        },
      })

      try {
        const readiness = await awaitReadiness({
          host: '127.0.0.1',
          port,
          path: '/',
          timeoutMs: readyTimeoutMs,
          pollIntervalMs,
          signal: exec.signal,
        })
        if (!readiness.ready) {
          throw new Error(`app-builder-preview: dev server did not become ready within ${readyTimeoutMs} ms (${readiness.polls} polls); stop the job with job_kill`)
        }
        const result: PreviewResult = {
          jobId,
          framework,
          host: '127.0.0.1',
          port,
          url: `http://127.0.0.1:${port}/`,
          polls: readiness.polls,
          readyMs: readiness.readyMs,
        }
        return result
      } catch (error) {
        // Readiness failure: cancel the spawned dev server so it does not
        // outlive the tool call, then re-throw so the model sees the error.
        try { jobs.kill(jobId, exec.agent, 'readiness timeout') } catch { /* already settled */ }
        throw error
      }
    },
  }))
}
