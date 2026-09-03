# App Builder

The App Builder seam bundles the App Builder product surfaces on top of DeepSeek Harness: a process-local project registry, a preview-state snapshot bridge that mirrors dev-server lifecycle into the web UI, and a Typert Remote API exposed through the existing gateway. Each surface owns one Cordis service and the events it emits; the bridge is the only consumer of the preview tool's state transitions.

Service Definitions: [dsh-app-builder-project](../../packages/app-builder/project) (`ctx.appBuilderProjects` + `project/created` and `project/deleted` events), [dsh-app-builder-snapshot-bridge](../../packages/app-builder/snapshot-bridge) (`ctx.appBuilderSnapshotBridge` + `app-builder-preview/dev-state` subscription). The Host BFF service that exposes App Builder projects, sessions, and preview state over the gateway lives in [dsh-app-builder-api](../../packages/app-builder/api).

Sources: registry types in [`packages/app-builder/project/src/types.ts`](../../packages/app-builder/project/src/types.ts), bridge accessor in [`packages/app-builder/snapshot-bridge/src/index.ts`](../../packages/app-builder/snapshot-bridge/src/index.ts).

## Project registry

`ctx.appBuilderProjects` is the process-local durable registry for App Builder projects. It is registered as a Cordis service in `@deepseek-ai/dsh-app-builder-project`; the App Builder BFF reads through it for project CRUD, and the snapshot bridge subscribes to its `project/created` and `project/deleted` events so the projects pane refreshes synchronously. The registry is in-memory in this phase; a Phase 2 follow-up replaces it with a `dsh-storage-domain` backed implementation.

## Preview-state snapshot bridge

`ctx.appBuilderSnapshotBridge` mirrors dev-server lifecycle into a single in-memory snapshot the App Builder web UI polls. The bridge subscribes to the preview tool's `app-builder-preview/dev-state` event and to `project/deleted`; the bridge accessor publishes the latest projection. The BFF reads the bridge synchronously for `getPreview`; the bundle patches in the HTTP route that serves the snapshot to the browser at `/__dsh/app-builder/snapshot.json`.

## Host BFF (Typert Remote)

`@deepseek-ai/dsh-app-builder-api` mounts a Typert Remote service exposing 13 methods (project CRUD, session lifecycle, SSE event subscription, preview, deploy, usage) through the existing `@deepseek-ai/dsh-api-gateway`. The service delegates 1:1 to the services that already own each relation (`ctx.appBuilderProjects`, `ctx.sessionController`, `ctx.appBuilderSnapshotBridge`).

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxappbuilderprojects--projectregistry"></a>

### `ctx.appBuilderProjects` — `ProjectRegistry`

Process-local project registry. Phase 1 keeps every project in memory and emits one `project/created` event per durable record; a Phase 2 follow-up replaces this with a `dsh-storage-domain` backed implementation.

```ts cordis-catalog
/**
 * Create one project. Canonicalizes the path, validates the root exists and
 * is a directory, adds the record to the in-memory registry, then emits
 * `project/created`. Adding before emitting lets listeners observe a
 * consistent `list()`/`get(id)` view (the snapshot bridge relies on this).
 * @param input - Validated project input.
 * @returns the new project.
 */
async create(input: CreateProjectInput): Promise<Project>

/**
 * Remove one project from the in-memory registry and emit `project/deleted`.
 * The handler removes the record before emitting so a listener that calls
 * `list()` or `get(id)` observes the post-delete state, mirroring the
 * add-then-emit ordering of `create()`. File-system cleanup is the
 * caller's responsibility (the BFF's `deleteProject` does it; the model-
 * facing `app_builder_scaffold` never calls this method).
 * @param id - Project id to remove.
 * @returns the removed project record, or `undefined` when no record exists.
 */
delete(id: ProjectId): Project | undefined

/**
 * Look up a project by id.
 * @param id - Project id.
 * @returns the project, or `undefined` when unknown.
 */
get(id: ProjectId): Project | undefined

/**
 * Project list in creation order. Process-local: no persistence yet.
 * @returns all registered projects.
 */
list(): readonly Project[]

/**
 * Whether the registry has a record for the given id.
 * @param id - Project id.
 * @returns true when the registry has the record.
 */
has(id: ProjectId): boolean

/**
 * Enumerate session ids whose `cwd` lives under the project's canonical
 * root. Returns an empty array when no `ctx.sessions` service is mounted.
 * @param id - Project id.
 * @returns the session ids whose cwd lives under the project's root.
 */
listSessionIds(id: ProjectId): readonly string[]
```

Source: [`packages/app-builder/project/src/index.ts`](../../packages/app-builder/project/src/index.ts)

<a id="ctxappbuildersnapshotbridge--appbuildersnapshotbridgeaccessor"></a>

### `ctx.appBuilderSnapshotBridge` — `AppBuilderSnapshotBridgeAccessor`

Read-only accessor the App Builder BFF consumes for `getPreview`.

```ts cordis-catalog
/**
 * Return the latest in-memory snapshot the HTTP route serves.
 * @returns the cached App Builder snapshot (projects + dev-servers).
 */
snapshot(): AppBuilderSnapshot
```

Source: [`packages/app-builder/snapshot-bridge/src/index.ts`](../../packages/app-builder/snapshot-bridge/src/index.ts)

<a id="ctxtoolpolicy--toolpolicyregistry"></a>

### `ctx.toolPolicy` — `ToolPolicyRegistry`

Process-local ToolPolicy registry. The registry stores the typed manifest, mounts a `tools/pre-execute` listener that converts the declared policy into a PreToolDecision, and appends a log-only `toolPolicy/decision` event for every evaluation. The decision vocabulary mirrors the upstream pipeline (`allow` / `deny` / `ask`) plus a `fallback` audit outcome recorded when no per-tool policy matched and the listener delegated to the permission-presets default.

```ts cordis-catalog
/**
 * Register one ToolPolicy. A duplicate `id` replaces the previous
 * registration; a duplicate `tool` name shadows the previous policy
 * so a tool with overlapping manifests resolves to the latest one.
 * @param policy - The ToolPolicy to register.
 * @returns The exact disposer that unregisters the policy.
 */
register(policy: ToolPolicy): () => void

/**
 * Look up the policy registered against a tool name. Returns the
 * most recent registration when multiple policies name the same tool.
 * @param toolName - The tool name the lookup matches.
 * @returns The matching policy, or `undefined` when none is registered.
 */
for(toolName: string): ToolPolicy | undefined

/**
 * Look up a policy by its stable id. The id is the registry map key,
 * not the tool name; use {@link for} for tool-name lookups.
 * @param id - The policy id the lookup matches.
 * @returns The matching policy, or `undefined` when none is registered.
 */
get(id: string): ToolPolicy | undefined

/**
 * Every registered policy in registration order (oldest first).
 * @returns A frozen snapshot of the registry contents.
 */
list(): readonly ToolPolicy[]

/**
 * Classify a tool name into a {@link ToolAction}. Returns the registered
 * classification; absent an entry, returns `undefined` so the listener
 * can apply the catch-all `execute` rule (the most conservative default
 * for tools the registry has not been told about).
 * @param toolName - The tool name to classify.
 * @returns The classified action, or `undefined` when unclassified.
 */
actionOf(toolName: string): ToolAction | undefined

/**
 * Evaluate one `tools/pre-execute` call. The method is the canonical
 * decision function: it looks up the policy by tool name, falls back
 * to the permission-presets current preset on a miss, appends one
 * `toolPolicy/decision` audit event to the owning session, and returns
 * the {@link PreToolDecision} the upstream pipeline should observe.
 *
 * @param exec - The tool execution the listener is evaluating.
 * @param next - The delegate that returns the default PreToolDecision.
 * @returns The decision the upstream pipeline should observe.
 */
async evaluate(exec: ToolExecution, next: () => Promise<PreToolDecision>): Promise<PreToolDecision>
```

Types: [PreToolDecision](tools.md) · [ToolExecution](tools.md)

Source: [`packages/app-builder/tool-policy/src/index.ts`](../../packages/app-builder/tool-policy/src/index.ts)

<a id="app-builder-preview-events"></a>

### `app-builder-preview/*` events

<a id="app-builder-previewdev-state--emit"></a>

#### `app-builder-preview/dev-state` — emit

Preview tool → snapshot bridge. Fired on every dev-server state transition.

```ts cordis-catalog
/**
 * Preview tool → snapshot bridge. Fired on every dev-server state transition.
 * @param state - the new dev-server state (status, url, port, sinceMs, etc.).
 * @mode emit
 */
'app-builder-preview/dev-state'(state: PreviewDevStateEvent): void
```

Source: [`packages/app-builder/preview/src/index.ts`](../../packages/app-builder/preview/src/index.ts)

<a id="app-builder-previewdev-state--emit"></a>

#### `app-builder-preview/dev-state` — emit

Preview tool → snapshot bridge. Fired on every dev-server state transition; the bridge consumes it to mirror the latest dev-server status into the snapshot served at `/__dsh/app-builder/snapshot.json`.

```ts cordis-catalog
/**
 * Preview tool → snapshot bridge. Fired on every dev-server state transition;
 * the bridge consumes it to mirror the latest dev-server status into the
 * snapshot served at `/__dsh/app-builder/snapshot.json`.
 * @param state - the new dev-server state.
 * @mode emit
 */
'app-builder-preview/dev-state'(state: AppBuilderPreviewDevState): void
```

Source: [`packages/app-builder/snapshot-bridge/src/index.ts`](../../packages/app-builder/snapshot-bridge/src/index.ts)

<a id="project-events"></a>

### `project/*` events

<a id="projectcreated--emit"></a>

#### `project/created` — emit

Emitted once per durable project record after the registry adds it. Listeners see the new project on the next `list()` / `get(id)` call; the snapshot bridge flushes synchronously on this signal.

```ts cordis-catalog
/**
 * Emitted once per durable project record after the registry adds it. Listeners
 * see the new project on the next `list()` / `get(id)` call; the snapshot bridge
 * flushes synchronously on this signal.
 * @param event - the newly-created project payload.
 * @mode emit
 */
'project/created'(event: ProjectCreatedEvent): void
```

Source: [`packages/app-builder/project/src/index.ts`](../../packages/app-builder/project/src/index.ts)

<a id="projectdeleted--emit"></a>

#### `project/deleted` — emit

Emitted when a durable project record is removed from the registry. The directory tree has already been removed before the signal fires; the snapshot bridge re-flushes so the projects pane stops listing the row.

```ts cordis-catalog
/**
 * Emitted when a durable project record is removed from the registry. The
 * directory tree has already been removed before the signal fires; the
 * snapshot bridge re-flushes so the projects pane stops listing the row.
 * @param event - the deleted project payload.
 * @mode emit
 */
'project/deleted'(event: ProjectDeletedEvent): void
```

Source: [`packages/app-builder/project/src/index.ts`](../../packages/app-builder/project/src/index.ts)
<!-- END GENERATED cordis-surface -->
