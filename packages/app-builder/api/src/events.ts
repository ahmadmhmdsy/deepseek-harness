/**
 * SSE-friendly streaming Remote for the App Builder Host BFF. The single
 * `subscribeEvents` method delegates to the upstream SessionController's
 * `follow` stream, which already produces a complete opening snapshot
 * followed by gap-free live event frames. The gateway transports the
 * AsyncIterable as the response body of an SSE-style invocation (one frame
 * per yield); Phase 2 will add an explicit `@Remote({ mode: 'sse' })`
 * marker if the upstream typert registry grows one.
 * @module @deepseek-ai/dsh-app-builder-api/events
 */

import { TypertRemoteFailure } from '@deepseek-ai/dsh-typert-protocol'
import type { Context } from '@deepseek-ai/cordis'
import type { SubscribeEventsFrame, SubscribeEventsRequest } from './types.ts'

/**
 * Stream one Session's events over SSE. Yields one `snapshot` frame
 * (opening window) followed by `event` frames (gap-free), ending with a
 * `closed` frame when the caller aborts the stream or the Session ends.
 * @param ctx - Cordis context carrying `ctx.sessionController`.
 * @param request - subscription payload (sessionId + last committed seq).
 * @param signal - caller / transport cancellation.
 * @returns the frame iterable.
 */
export async function* subscribeEventsRemote(
  ctx: Context,
  request: SubscribeEventsRequest,
  signal: AbortSignal,
): AsyncIterable<SubscribeEventsFrame> {
  const controller = ctx.get('sessionController') as
    | {
      follow(req: { sessionId: string; afterSeq?: number }, signal: AbortSignal): AsyncIterable<unknown>
    }
    | undefined
  if (controller === undefined) {
    throw new TypertRemoteFailure({
      code: 'service-unavailable',
      message: 'app-builder.api.subscribeEvents requires @deepseek-ai/dsh-api-session-controller to be mounted',
      details: {},
    })
  }
  const source = controller.follow(
    {
      sessionId: request.sessionId,
      ...(request.afterSeq !== undefined ? { afterSeq: request.afterSeq } : {}),
    },
    signal,
  )
  try {
    for await (const frame of source) {
      const typed = frame as Record<string, unknown>
      if (typed.type === 'snapshot') {
        yield {
          type: 'snapshot',
          header: typed.header,
          cursor: typeof typed.cursor === 'number' ? typed.cursor : 0,
          records: Array.isArray(typed.records) ? typed.records : [],
          hasMore: typed.hasMore === true,
        }
        continue
      }
      if (typed.type === 'event') {
        yield { type: 'event', seq: typeof typed.seq === 'number' ? typed.seq : 0, event: typed.event ?? typed }
        continue
      }
      yield { type: 'event', seq: 0, event: typed }
    }
  } catch (error: unknown) {
    if (signal.aborted && error instanceof Error && error.name === 'AbortError') {
      yield { type: 'closed', reason: 'cancelled' }
      return
    }
    throw error
  }
  if (signal.aborted) {
    yield { type: 'closed', reason: 'cancelled' }
    return
  }
  yield { type: 'closed', reason: 'source-closed' }
}
