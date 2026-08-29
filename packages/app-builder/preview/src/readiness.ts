/**
 * HTTP readiness poll helper: dials http://<host>:<port>/<path> until the
 * server answers any response (status code 1xx-5xx) or the wall-clock
 * budget expires. The helper stops on the first successful connection
 * regardless of HTTP status; the goal is to know the dev server is bound
 * and answering, not to validate its content.
 *
 * @module @deepseek-ai/dsh-app-builder-preview/readiness
 */

import type { ReadinessProbe } from './types.ts'

/**
 * Per-attempt dial result. The helper only treats connected: true as a
 * readiness success; transport errors (ECONNREFUSED, ECONNRESET, timeouts)
 * stay on the connected: false branch and the poll loop retries.
 */
export interface ReadinessAttempt {
  /** True when the server completed the TCP + HTTP handshake. */
  connected: boolean
  /** HTTP status code when connected is true; otherwise undefined. */
  status?: number
  /** Transport error message when connected is false; otherwise undefined. */
  error?: string
}

/** Outcome of a readiness probe. */
export interface ReadinessResult {
  /** True when the helper observed a successful dial within the budget. */
  ready: boolean
  /** Number of attempts performed (including the final successful one). */
  polls: number
  /** Wall-clock milliseconds spent waiting. */
  readyMs: number
}

/**
 * fetch with a tight per-attempt timeout. The platform fetch does not
 * expose a built-in per-call timeout, so this helper wraps each attempt
 * in its own AbortController.
 * @param url - the absolute URL to GET.
 * @param signal - the attempt-scoped abort signal.
 * @returns the attempt outcome.
 */
export async function probeOnce(url: string, signal: AbortSignal): Promise<ReadinessAttempt> {
  try {
    const response = await fetch(url, { method: 'GET', signal })
    // Drain the body to release the connection; the response payload is
    // discarded because the dev server home page is not interesting.
    await response.arrayBuffer().catch(() => undefined)
    return { connected: true, status: response.status }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { connected: false, error: message }
  }
}

/**
 * Sleep for ms milliseconds, returning early when the signal aborts.
 * @param ms - milliseconds to wait.
 * @param signal - abort signal.
 */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('readiness probe aborted'))
      return
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new Error('readiness probe aborted'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Poll http://<host>:<port>/<path> until ready or the budget expires.
 * Each attempt has its own per-call timeout derived from the poll interval,
 * so a hung socket does not consume the entire wall-clock budget at once.
 * @param probe - the probe parameters.
 * @returns the readiness outcome.
 */
export async function awaitReadiness(probe: ReadinessProbe): Promise<ReadinessResult> {
  const path = probe.path ?? '/'
  const url = `http://${probe.host}:${probe.port}${path}`
  const startedAt = Date.now()
  let polls = 0
  while (true) {
    polls += 1
    const elapsed = Date.now() - startedAt
    if (elapsed >= probe.timeoutMs) {
      return { ready: false, polls, readyMs: elapsed }
    }
    const remaining = probe.timeoutMs - elapsed
    const attemptTimeoutMs = Math.min(Math.max(probe.pollIntervalMs * 2, 1000), remaining)
    const attemptController = new AbortController()
    const timeoutTimer = setTimeout(() => attemptController.abort(), attemptTimeoutMs)
    const onOuterAbort = () => attemptController.abort()
    probe.signal.addEventListener('abort', onOuterAbort, { once: true })
    try {
      const attempt = await probeOnce(url, attemptController.signal)
      if (attempt.connected) {
        return { ready: true, polls, readyMs: Date.now() - startedAt }
      }
    } finally {
      clearTimeout(timeoutTimer)
      probe.signal.removeEventListener('abort', onOuterAbort)
    }
    if (probe.signal.aborted) {
      throw new Error('readiness probe aborted')
    }
    if (Date.now() - startedAt + probe.pollIntervalMs >= probe.timeoutMs) {
      continue
    }
    await sleep(probe.pollIntervalMs, probe.signal)
  }
}
