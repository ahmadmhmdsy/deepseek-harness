/**
 * @module @deepseek-ai/dsh-app-builder-scaffold/types
 *
 * Type-only surface for the App Builder scaffold tool. No runtime exports.
 */

/** Frameworks the scaffold tool can instantiate. */
export type ScaffoldTemplate = 'nextjs-app' | 'nextjs-pages' | 'svelte-spa'

/** One file the scaffold tool writes into a fresh project root. */
export interface ScaffoldFile {
  /** Path relative to the project root, using forward slashes. */
  readonly path: string
  /** UTF-8 text content written verbatim. */
  readonly content: string
}

/** One static template: a closed catalog of files keyed by template id. */
export interface ScaffoldTemplateDefinition {
  readonly id: ScaffoldTemplate
  /** Human-readable display name (shown in tool description). */
  readonly label: string
  /** Files generated for this template, in deterministic order. */
  readonly files: readonly ScaffoldFile[]
  /** Shell command used to install dependencies (run inside the project root). */
  readonly installCommand: readonly string[]
  /** Shell command used to start the dev server (consumed by the preview tool). */
  readonly devCommand: readonly string[]
}

/** Inputs the model-facing tool accepts. */
export interface ScaffoldToolArgs {
  template: ScaffoldTemplate
  name: string
  stack?: string
  features?: readonly string[]
  /** Optional explicit project root; defaults to `<sandbox-policy workspace root>/<name>`. */
  cwd?: string
  /** Run `npm install` as a background job after writing files (default true). */
  npmInstall?: boolean
}

/** Result the model-facing tool returns. */
export interface ScaffoldResult {
  rootPath: string
  template: ScaffoldTemplate
  files: string[]
  /** Background job id for the running install, when `npmInstall !== false`. */
  installJobId?: string
}
