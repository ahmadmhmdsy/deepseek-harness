/**
 * Preview Remote method for the App Builder Host BFF. Reads the snapshot
 * bridge's in-memory state (the same map the projects pane polls) and
 * returns one project's dev-server status. The bridge subscribes to the
 * preview tool's `app-builder-preview/dev-state` transitions and to
 * `project/deleted` for the in-memory `devServers` map; this method is
 * a synchronous read of that authoritative view.
 * @module @deepseek-ai/dsh-app-builder-api/preview
 */

import { TypertRemoteFailure } from '@deepseek-ai/dsh-typert-protocol'
import type { Context } from '@deepseek-ai/cordis'
import type { ProjectId } from '@deepseek-ai/dsh-app-builder-project'
import type { GetPreviewRequest, GetPreviewValue } from './types.ts'

interface PreviewState {
  readonly status: 'idle' | 'starting' | 'ready' | 'failed' | 'stopped'
  readonly url?: string
  readonly port: number
  readonly message?: string
  readonly updatedAt: number
}

/**
 * Read one project's dev-server status. Returns an `idle` record when the
 * project exists but no preview has run yet; a typed `not-found` failure
 * when the project is unknown to the registry.
 * @param ctx - Cordis context carrying the snapshot bridge.
 * @param request - lookup payload.
 * @returns the public preview shape.
 */
export async function getPreviewRemote(
  ctx: Context,
  request: GetPreviewRequest,
): Promise<GetPreviewValue> {
  await Promise.resolve()
  const id = request.projectId as ProjectId
  const project = ctx.appBuilderProjects.get(id)
  if (project === undefined) {
    throw new TypertRemoteFailure({
      code: 'not-found',
      message: `getPreview: no project with id ${String(id)}`,
      details: { projectId: id },
    })
  }
  const bridge = ctx.get('appBuilderSnapshotBridge') as
    | { snapshot(): { devServers: Readonly<Record<string, PreviewState>> } }
    | undefined
  if (bridge === undefined) {
    // The bridge is optional: a deployment that omits it has no preview
    // state to report. Return a neutral 'unknown' record instead of
    // failing so the API surface stays uniform.
    return { projectId: id, status: 'unknown', port: -1, updatedAt: 0 }
  }
  const entry = bridge.snapshot().devServers[id]
  if (entry === undefined) {
    return { projectId: id, status: 'idle', port: -1, updatedAt: 0 }
  }
  return {
    projectId: id,
    status: entry.status,
    ...(entry.url !== undefined ? { url: entry.url } : {}),
    port: entry.port,
    ...(entry.message !== undefined ? { message: entry.message } : {}),
    updatedAt: entry.updatedAt,
  }
}
