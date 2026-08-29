/**
 * @module @deepseek-ai/dsh-app-builder-scaffold/validate
 *
 * Pure validation helpers for the scaffold tool's model-supplied inputs. These
 * functions have no I/O and no Cordis dependencies; they run before any
 * capability call so a malformed input never reaches `ctx.fs` or `ctx.shell`.
 */

/**
 * Reject any `name` that could escape the project root or break a downstream
 * filesystem backend.
 * @param name - the project directory name the model supplied.
 */
export function validateProjectName(name: string): void {
  if (name.trim().length === 0) {
    throw new Error('app-builder-scaffold: name must be a non-empty string')
  }
  if (name.includes('/') || name.includes('\\') || name === '.' || name === '..') {
    throw new Error(`app-builder-scaffold: name must not contain path separators or be '.'/'..' (got ${JSON.stringify(name)})`)
  }
  // Disallow NUL and control characters; filesystem backends reject them
  // inconsistently, so the tool catches them here.
  if (/[\u0000-\u001f]/.test(name)) {
    throw new Error(`app-builder-scaffold: name must not contain control characters (got ${JSON.stringify(name)})`)
  }
}

/**
 * Reject any relative template path that could escape the project root.
 * @param relative - the template-relative file path.
 */
export function validateTemplatePath(relative: string): void {
  const parts = relative.split('/')
  if (parts.some(part => part === '..' || part === '.')) {
    throw new Error(`app-builder-scaffold: template path may not contain '.' or '..' segments (got ${JSON.stringify(relative)})`)
  }
}
