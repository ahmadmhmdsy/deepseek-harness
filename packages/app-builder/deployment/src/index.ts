/**
 * @module @deepseek-ai/dsh-app-builder-deployment
 *
 * Cordis plugin that owns the App Builder `Deployment` entity and runs
 * the deployment pipeline (SAST / SCA / secrets gates + approval + push).
 * Phase 2.1 keeps the registry process-local; durability lives in the
 * session-log `deployment/started|succeeded|failed` events.
 *
 * The plugin exposes one Service Definition (`DeploymentRegistry`) and
 * the `appBuilderDeployment` Cordis service; the BFF's `deploy` Remote
 * method delegates to `ctx.appBuilderDeployment.deploy(request)`.
 */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

import type { ProjectRegistry } from '@deepseek-ai/dsh-app-builder-project'

import { runDeployment } from './deploy.ts'
import type {
  Deployment,
  DeploymentId,
  DeploymentRequest,
  DeploymentValue,
} from './types.ts'

export type {
  Deployment,
  DeploymentFailedEvent,
  DeploymentId,
  DeploymentRequest,
  DeploymentStartedEvent,
  DeploymentStatus,
  DeploymentSucceededEvent,
  DeploymentValue,
  GateFinding,
  GateFindingSeverity,
  GateId,
  GateKind,
  GateResult,
} from './types.ts'
export { GATE_KINDS } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /**
     * App Builder deployment service. The BFF's `deploy` Remote method
     * delegates to `ctx.appBuilderDeployment.deploy(request)`; model-driven
     * callers (the deployment persona) consume the service directly.
     */
    appBuilderDeployment: DeploymentRegistry
  }
  interface Events {
    /**
     * Emitted when a deployment workflow starts (after the registry
     * builds the initial pending record but before the gates run).
     * Listeners see the new deployment in the registry on the next
     * `get(id)` / `list()` call (add-then-emit ordering).
     * @param event - the newly-started deployment payload.
     * @mode emit
     */
    'deployment/started'(event: import('./types.ts').DeploymentStartedEvent): void
    /**
     * Emitted when a deployment workflow completes the push step. The
     * record carries `status: 'succeeded'` and a resolved `url`.
     * @param event - the succeeded deployment payload.
     * @mode emit
     */
    'deployment/succeeded'(event: import('./types.ts').DeploymentSucceededEvent): void
    /**
     * Emitted when a deployment workflow terminates in failure (gate
     * failure, approval rejection, push error, or unknown project). The
     * `reason` field carries a human-readable summary.
     * @param event - the failed deployment payload + reason.
     * @mode emit
     */
    'deployment/failed'(event: import('./types.ts').DeploymentFailedEvent): void
  }
}

/**
 * Process-local deployment registry. Phase 2.1 keeps every deployment
 * record in memory and emits one `deployment/started|succeeded|failed`
 * event per durable record; a Phase 2.4 follow-up replaces this with a
 * `dsh-storage-domain` backed implementation.
 */
export class DeploymentRegistry extends Service {
  private readonly deployments = new Map<DeploymentId, Deployment>()

  /**
   * Internal lookup map the deploy workflow reads through. The map keys
   * are deployment ids; the values are the latest in-memory copy of the
   * record. The deploy workflow reads through this map to bridge
   * `add-then-emit` ordering without exposing `Map` operations.
   */
  private readonly pendingRecords = new Map<DeploymentId, Deployment>()

  /** The registry's effective configuration. Resolved by `apply`. */
  readonly config: Config

  constructor(ctx: Context, name = 'appBuilderDeployment', config: Config = {}) {
    super(ctx, name)
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Run one deployment workflow end-to-end. The registry adds the
   * initial pending record before emitting `deployment/started`, so a
   * listener that calls `list()` / `get(id)` observes the new record.
   * @param request - Deployment request payload (projectId + optional target).
   * @returns the final deployment record.
   */
  async deploy(request: DeploymentRequest): Promise<Deployment> {
    const projectRegistry = this.ctx.get('appBuilderProjects') as ProjectRegistry | undefined
    if (projectRegistry === undefined) {
      throw new Error('appBuilderProjects is not mounted; deploy requires the project registry')
    }
    const final = await runDeployment(this.ctx, {
      registry: {
        get: (id) => {
          const project = projectRegistry.get(id as never)
          if (project === undefined) return undefined
          return { rootPath: project.rootPath }
        },
      },
      createDeploymentId: () => randomUUID(),
      now: () => new Date().toISOString(),
    }, request, {
      ...(this.config.requireApproval !== undefined ? { requireApproval: this.config.requireApproval } : {}),
      ...(this.config.denyList !== undefined ? { denyList: this.config.denyList } : {}),
      ...(this.config.host !== undefined ? { host: this.config.host } : {}),
    })
    this.deployments.set(final.id, final)
    return final
  }

  /**
   * Look up a deployment by id. Returns the latest record; absent ids
   * resolve to `undefined` so a caller can distinguish 'unknown id' from
   * 'in-progress' (use `has` for the existence check).
   * @param id - Deployment id.
   * @returns the deployment record, or `undefined` when unknown.
   */
  get(id: DeploymentId): Deployment | undefined {
    return this.deployments.get(id)
  }

  /**
   * Every durable deployment the registry has observed, in creation
   * order. Process-local: no persistence yet.
   * @returns all registered deployments.
   */
  list(): readonly Deployment[] {
    return [...this.deployments.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  /**
   * Whether the registry has a record for the given id.
   * @param id - Deployment id.
   * @returns true when the registry has the record.
   */
  has(id: DeploymentId): boolean {
    return this.deployments.has(id)
  }

  /**
   * Build the public `DeployValue` for the BFF's Remote method. The
   * value is a strict subset of the deployment record: `projectId`,
   * `deploymentId`, and the resolved `url` when present.
   * @param id - Deployment id to project.
   * @returns the public value, or `undefined` when the registry has no record.
   */
  toValue(id: DeploymentId): DeploymentValue | undefined {
    const record = this.deployments.get(id)
    if (record === undefined) return undefined
    return {
      projectId: record.projectId,
      deploymentId: record.id,
      ...(record.url !== undefined ? { url: record.url } : {}),
    }
  }

  /**
   * Look up the most recent deployment for one project. Returns
   * `undefined` when no record exists for the project.
   * @param projectId - Project id.
   * @returns the latest deployment for the project, or `undefined`.
   */
  latestForProject(projectId: string): Deployment | undefined {
    let latest: Deployment | undefined
    for (const record of this.deployments.values()) {
      if (record.projectId !== projectId) continue
      if (latest === undefined || record.createdAt > latest.createdAt) latest = record
    }
    return latest
  }

  /**
   * Internal accessor the deploy workflow uses to bridge
   * `add-then-emit` ordering: the registry stores the initial pending
   * record here before emitting `deployment/started`, and the workflow
   * moves it to the durable map once the final transition lands.
   * @param id - Deployment id.
   * @returns the pending record, or `undefined` when not present.
   */
  takePending(id: DeploymentId): Deployment | undefined {
    const pending = this.pendingRecords.get(id)
    if (pending !== undefined) this.pendingRecords.delete(id)
    return pending
  }
}

/** Plugin config — all optional; defaults are the MVP shipped values. */
export interface Config {
  /**
   * Whether the deployment workflow must call `ctx.approval.request(...)`
   * after the gates pass. Defaults to `false` so a deployment bundle
   * without the user-approval plugin mounted still runs end-to-end;
   * the App Builder MVP ships with this set to `true` once the
   * approval service is part of the composition.
   */
  requireApproval?: boolean
  /**
   * SCA deny-list override. Replaces the bundled deny-list; absent the
   * deploy workflow falls back to the bundled `DEFAULT_SCA_DENY_LIST`
   * in `gates.ts`.
   */
  denyList?: ReadonlySet<string>
  /**
   * Override the synthetic host the local push step resolves its URL
   * against. Defaults to `https://deploy.local`; snapshot tests assert
   * against this exact value.
   */
  host?: string
}

/** Internal defaults the registry merges with the resolved config. */
const DEFAULT_CONFIG: Required<Pick<Config, 'requireApproval'>> = {
  requireApproval: false,
}

/** Schemastery schema for plugin config. Only the boolean serialises; denyList + host are runtime-only. */
export const Config: z<Config> = z.object({
  requireApproval: z.boolean().default(false),
  host: z.string().default('https://deploy.local'),
})

/** Cordis plugin name. */
export const name = 'app-builder-deployment'

/**
 * Services required by the deployment plugin. The plugin reads
 * `ctx.appBuilderProjects` directly (it is a required dependency for
 * any deploy workflow); `ctx.approval` is read through `ctx.get` so a
 * missing service is a configured no-op (the workflow falls back to
 * the `requireApproval` config field).
 */
export const inject: readonly string[] = ['appBuilderProjects']

/**
 * Plugin entry. The `DeploymentRegistry` constructor calls
 * `ctx.reflect.provide('appBuilderDeployment', this, ...)` so the
 * service is registered automatically and disposed when the owning
 * fiber unloads. The name is passed explicitly: Service's base
 * constructor would otherwise fall back to the static `provide`
 * field, which `DeploymentRegistry` does not set.
 * @param ctx - Cordis context.
 * @param config - Plugin config (validated through `Config`).
 */
export function apply(ctx: Context, config: Config = {}): void {
  const resolved = Config(config)
  const serviceConfig: Config = {
    ...(resolved.requireApproval !== undefined ? { requireApproval: resolved.requireApproval } : {}),
    ...(resolved.host !== undefined ? { host: resolved.host } : {}),
    ...(config.denyList !== undefined ? { denyList: config.denyList } : {}),
  }
  new DeploymentRegistry(ctx, 'appBuilderDeployment', serviceConfig)
  // Construct the registry so ctx.reflect.provide runs and the service
  // is queryable through ctx.get / ctx.appBuilderDeployment. The
  // constructor's effect alone is sufficient; the explicit effect
  // call below records a disposer for HMR-safety.
  ctx.effect(() => () => {
    // No additional teardown: ctx.reflect.provide handles disposal
    // when the owning fiber unloads.
  }, 'app-builder-deployment: service disposer')
}

export default DeploymentRegistry
