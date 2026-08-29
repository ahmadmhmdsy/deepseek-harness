/**
 * @module @deepseek-ai/dsh-app-builder-scaffold
 *
 * App Builder scaffold tool. On `apply()` it registers one model-facing tool,
 * `app_builder_scaffold`, that creates a fresh project from a template under
 * the session's sandbox-policy workspace root and optionally starts `npm
 * install` as a background job.
 *
 * The plugin composes the existing filesystem and shell capabilities:
 * template files write through `ctx.fs.writeText`, and the optional
 * background install runs through `ctx.shell.start` inside a `ctx.jobs.start`
 * producer. The scaffold tool NEVER re-implements file writes or process
 * execution; it only sequences capability calls.
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Session } from '@deepseek-ai/dsh-session'
import type { FileSystem } from '@deepseek-ai/dsh-fs'
import type { ShellExecutor } from '@deepseek-ai/dsh-shell'
import { canonicalPath, type SandboxExecutionPolicy } from '@deepseek-ai/dsh-sandbox'
import type { SandboxPolicyRequest } from '@deepseek-ai/dsh-sandbox-policy'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { TEMPLATES } from './templates.ts'
import { validateProjectName, validateTemplatePath } from './validate.ts'
import type {
  ScaffoldResult,
  ScaffoldTemplate,
  ScaffoldToolArgs,
} from './types.ts'

/** Cordis plugin name used by loader diagnostics and the bundle patch row. */
export const name = 'app-builder-scaffold'

/** Services the scaffold tool requires; `ctx.jobs` is read via `ctx.get()` because it is optional. */
export const inject = ['tools', 'fs', 'shell', 'systemPrompt', 'sandboxPolicy', 'agent'] as const

/** Plugin-level config: deployment-time defaults applied when the model omits an input. */
export interface Config {
  /** Default template when the model omits `template` (default: `'nextjs-app'`). */
  defaultTemplate?: ScaffoldTemplate
  /** Default `npm install` policy (default: true). */
  defaultNpmInstall?: boolean
}

export const Config: z<Config> = z.object({
  defaultTemplate: z.union(['nextjs-app', 'nextjs-pages', 'svelte-spa'] as const).default('nextjs-app'),
  defaultNpmInstall: z.boolean().default(true),
})

/** Re-exports for tests and tool consumers. */
export { validateProjectName, validateTemplatePath } from './validate.ts'

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
function resolveOptionsFor(cwd: string | undefined, signal: AbortSignal): { cwd?: string, signal?: AbortSignal } {
  const opts: { cwd?: string, signal?: AbortSignal } = { signal }
  if (cwd !== undefined) opts.cwd = cwd
  return opts
}

/**
 * Resolve the project root under the session's sandbox policy. A relative
 * `cwd` from the model is resolved against the session workspace; the tool
 * then refuses to write anywhere outside the policy root.
 * @param modelCwd - the optional `cwd` argument the model passed.
 * @param sessionCwd - the session's immutable cwd, or undefined for agentless calls.
 * @param policy - the resolved sandbox policy for the current call.
 * @returns the canonical absolute project root path the tool will write into.
 */
function resolveProjectRoot(
  modelCwd: string,
  sessionCwd: string | undefined,
  policy: SandboxExecutionPolicy,
): string {
  const isAbsolute = modelCwd.startsWith('/') || /^[A-Za-z]:[\\/]/.test(modelCwd)
  const base = isAbsolute ? canonicalPath(modelCwd) : canonicalPath(joinPosix(sessionCwd ?? policy.workspaceRoot, modelCwd))
  const canonical = canonicalPath(base)
  const root = canonicalPath(policy.workspaceRoot)
  // Canonical containment: prefix match on a trailing-separator boundary or
  // exact equality. String compare is sound here because both sides are
  // canonical paths returned by the sandbox canonicalPath helper.
  if (canonical !== root && !canonical.startsWith(root + '/') && !canonical.startsWith(root + '\\')) {
    throw new Error(`app-builder-scaffold: project root ${JSON.stringify(canonical)} escapes the sandbox policy workspace root ${JSON.stringify(root)}`)
  }
  return canonical
}

/** Build the model-facing tool description (single source of truth for the system prompt and tool schema). */
function describeTool(): string {
  return [
    'Create a fresh project from one of three templates (`nextjs-app`, `nextjs-pages`, `svelte-spa`) under the session workspace.',
    'Writes the template files via `ctx.fs.writeText`, then optionally starts `npm install` as a background `ctx.jobs.start` producer.',
    'Writes are confined to the sandbox-policy workspace root: a project root outside that root is rejected before any file write.',
    'Returns `{ rootPath, template, files, installJobId? }`. Read the install progress with `job_output` and stop it with `job_kill`.',
  ].join(' ')
}

/** Apply the scaffold plugin: register one model-facing tool and the system-prompt section. */
export function apply(ctx: Context, config: Config = {}): void {
  const resolved = Config(config)
  const defaultNpmInstall = resolved.defaultNpmInstall

  ctx.systemPrompt.section({
    name: 'tool:app-builder-scaffold',
    order: 110,
    text: 'The `app_builder_scaffold` tool creates a fresh project from a template under the session workspace. Call it once per new project; subsequent edits use `write` / `str_replace_editor`. The dev server runs through the App Builder preview tool, not `bash`.',
  })

  ctx.tools.register(defineTool({
    name: 'app_builder_scaffold',
    description: describeTool(),
    parameters: {
      template: {
        type: 'string',
        required: true,
        enum: ['nextjs-app', 'nextjs-pages', 'svelte-spa'],
        description: 'Project template to instantiate.',
      },
      name: {
        type: 'string',
        required: true,
        description: 'Project directory name (no path separators). The directory is created as `<workspaceRoot>/<name>`.',
      },
      stack: {
        type: 'string',
        description: 'Free-form stack hint (e.g. `latest`, `next@15`). Templates pin their package versions; this field is recorded for the project metadata and future stack-specific substitutions.',
      },
      features: {
        type: 'array',
        items: { type: 'string' },
        description: 'Free-form feature catalog (e.g. `["routing", "auth"]`). Recorded for project metadata; Phase 1 does not branch the templates on it.',
      },
      cwd: {
        type: 'string',
        description: 'Optional explicit project root. Defaults to the session workspace. Must remain inside the sandbox policy root.',
      },
      npmInstall: {
        type: 'boolean',
        description: `Run \`npm install\` as a background job after writing files (default ${defaultNpmInstall}). Set false to defer installation to a follow-up call.`,
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          rootPath: { type: 'string', required: true },
          template: { type: 'string', required: true, enum: ['nextjs-app', 'nextjs-pages', 'svelte-spa'] },
          files: { type: 'array', required: true, items: { type: 'string' } },
          installJobId: { type: 'string' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `Scaffolded ${value.template} project at ${value.rootPath} (${value.files.length} files)`
          + (value.installJobId !== undefined ? `; install job: ${value.installJobId}` : ''),
      }],
    },
    async execute(args: ScaffoldToolArgs, exec): Promise<ScaffoldResult> {
      validateProjectName(args.name)
      const template = TEMPLATES[args.template]
      if (template === undefined) {
        throw new Error(`app-builder-scaffold: unknown template ${JSON.stringify(args.template)}`)
      }
      for (const file of template.files) {
        validateTemplatePath(file.path)
      }
      const fs = ctx.fs as FileSystem
      const shell = ctx.shell as ShellExecutor
      const sessionCwd = exec.agent?.session.header.cwd
      const policy = ctx.sandboxPolicy.resolve(policyRequestFor(exec.agent?.session))
      const targetCwd = args.cwd ?? joinPosix(policy.workspaceRoot, args.name)
      const rootPath = resolveProjectRoot(targetCwd, sessionCwd, policy)

      // Phase 1 refuses to scaffold into an existing directory; the model
      // chooses a fresh name and the App Builder's projection unit (Phase 2)
      // surfaces the conflict instead of overwriting in place.
      const target = await fs.resolve(rootPath, resolveOptionsFor(sessionCwd, exec.signal))
      const existing = await fs.stat(target, exec.signal)
      if (existing !== undefined) {
        throw new Error(`app-builder-scaffold: project root already exists: ${rootPath}`)
      }

      const written: string[] = []
      for (const file of template.files) {
        const fileTarget = await fs.resolve(`${rootPath}/${file.path}`, resolveOptionsFor(sessionCwd, exec.signal))
        if (!fs.contains(target, fileTarget) && fileTarget.targetKey !== target.targetKey) {
          throw new Error(`app-builder-scaffold: template path escapes project root: ${file.path}`)
        }
        await fs.writeText(fileTarget, file.content, undefined, exec.signal, policy)
        written.push(file.path)
      }
      // Coerce to mutable: the schema infers `files: string[]` from the output
      // schema, but our template catalog is readonly by construction.
      const writtenFiles: string[] = [...written]

      const npmInstall = args.npmInstall ?? defaultNpmInstall
      let installJobId: string | undefined
      if (npmInstall) {
        const jobs = ctx.get('jobs') as { start: (spec: { kind: string, label: string, owner?: Agent, run: () => { cancel: () => void, done: Promise<unknown>, readOutput: () => string } }) => string } | undefined
        if (jobs === undefined) {
          throw new Error('app-builder-scaffold: npmInstall requires @deepseek-ai/dsh-jobs (load it or pass npmInstall: false)')
        }
        const installSpec = shell.resolve({
          command: template.installCommand.join(' '),
          workdir: rootPath,
          signal: exec.signal,
          ...policy !== undefined ? { sandboxPolicy: policy } : {},
        })
        installJobId = jobs.start({
          kind: 'app-builder-scaffold-install',
          label: `${template.id}: npm install`,
          ...exec.agent ? { owner: exec.agent } : {},
          run: () => {
            const proc = shell.start(installSpec)
            return {
              cancel: () => { void proc.kill() },
              done: proc.done.then(() => undefined),
              readOutput: () => proc.readOutput().delta,
            }
          },
        })
      }

      const result: ScaffoldResult = {
        rootPath,
        template: template.id,
        files: writtenFiles,
      }
      if (installJobId !== undefined) {
        result.installJobId = installJobId
      }
      return result
    },
  }))
}
