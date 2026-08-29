/**
 * Pure validators for the App Builder preview tool. These run before any
 * capability call so a malformed input never reaches `ctx.shell`, `ctx.fs`,
 * or the bound localhost port.
 *
 * @module @deepseek-ai/dsh-app-builder-preview/validate
 */

/** True when the value is a non-empty string with no control characters. */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !/[\u0000-\u001f\u007f]/.test(value)
}

/**
 * Validate the optional `rootPath` argument the model passes. Relative
 * paths are accepted so the caller can resolve them against the session
 * cwd; absolute paths are accepted so a project created under a sibling
 * directory also works. The full sandbox-containment check happens in
 * `apply` against the resolved policy.
 * @param value - the model-supplied root path.
 * @throws when the value is not a string, is empty, or contains control characters.
 */
export function validateRootPath(value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (!isNonEmptyString(value)) {
    throw new Error(`app-builder-preview: invalid rootPath: expected a non-empty path string, got ${JSON.stringify(value)}`)
  }
  return value
}

/**
 * Validate the optional explicit port. The value must be a positive
 * integer in the unprivileged TCP range (1-65535).
 * @param value - the model-supplied port.
 * @throws when the value is not a finite positive integer.
 */
export function validatePort(value: unknown): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`app-builder-preview: invalid port: expected an integer in 1..65535, got ${JSON.stringify(value)}`)
  }
  return value
}

/**
 * Validate the readiness poll timeout. Must be a positive finite number
 * with a hard cap at 10 minutes so a model cannot spin the agent.
 * @param value - the model-supplied timeout.
 * @throws when the value is not a finite positive integer.
 */
export function validateReadyTimeoutMs(value: unknown): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`app-builder-preview: invalid readyTimeoutMs: expected a positive number, got ${JSON.stringify(value)}`)
  }
  if (value > 600000) {
    throw new Error(`app-builder-preview: readyTimeoutMs ${value} exceeds the 600000 ms cap`)
  }
  return value
}

/**
 * Validate the poll interval. Must be a positive integer in 1..5000 ms.
 * @param value - the model-supplied interval.
 * @throws when the value is not a positive integer in the allowed range.
 */
export function validatePollIntervalMs(value: unknown): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 5000) {
    throw new Error(`app-builder-preview: invalid pollIntervalMs: expected an integer in 1..5000, got ${JSON.stringify(value)}`)
  }
  return value
}

/**
 * Validate the optional framework override. The tool accepts the same
 * three values it auto-detects; an unrecognised value is rejected so the
 * caller never silently falls back to `unknown`.
 * @param value - the model-supplied framework.
 * @throws when the value is not `next`, `vite`, or `unknown`.
 */
export function validateFramework(value: unknown): 'next' | 'vite' | 'unknown' | undefined {
  if (value === undefined) return undefined
  if (value !== 'next' && value !== 'vite' && value !== 'unknown') {
    throw new Error(`app-builder-preview: invalid framework: expected 'next' | 'vite' | 'unknown', got ${JSON.stringify(value)}`)
  }
  return value
}
