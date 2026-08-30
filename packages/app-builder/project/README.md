# @deepseek-ai/dsh-app-builder-project

English | [中文](README.zh.md)

The **App Builder project entity**: a typed record `{ id, name, rootPath, stack, gitUrl, dshProfile, createdAt }` that groups sessions under a project root. This package owns the `ProjectRegistry` Cordis service, the `project/created` session-log event, and the `project` session-projection unit that maps each session's cwd to its owning project.

## API

| Symbol | Kind | Notes |
|---|---|---|
| `ProjectRegistry` | default export | `Service` subclass; bound as `ctx.appBuilderProjects` |
| `name` | `string` | Cordis plugin name (`app-builder-project`) |
| `inject` | readonly tuple | `['sessionProjections']` |
| `Config` | schemastery schema | `{ defaultProfile: string }` (default `'app-builder'`) |
| `apply(ctx, config)` | function | Plugin entry; mounts the registry and registers the projection unit |
| `projectProjectionDefinition` | named export | `ProjectionDefinition<'project', ProjectState>` |
| `ProjectState`, `ProjectView` | types | persisted fold state + client-visible value |
| `Project`, `ProjectId`, `ProjectStack`, `ProjectCreatedEvent`, `CreateProjectInput` | types | re-exported from `./types.ts` |

### Methods

`await ctx.appBuilderProjects.create({ name, rootPath, stack, gitUrl?, dshProfile? })` creates one record, canonicalizes `rootPath` through `path.resolve` + `fs.stat`, emits `project/created`, and returns the record.

`ctx.appBuilderProjects.list()` returns every project in creation order; `get(id)` returns one record or `undefined`; `has(id)` is a presence check; `listSessionIds(id)` enumerates session ids whose `cwd` starts with the project's canonical root (reads `ctx.sessions` if present, returns `[]` otherwise).

## Projection unit (`project`)

The plugin registers a single projection unit on `ctx.sessionProjections` so the persisted projection cache (`@deepseek-ai/dsh-session-projection-cache`, mounted in `bundle/base`) checkpoints the per-session owning-project relation on its throttled write-behind.

| Field | Value |
|---|---|
| key | `project` |
| stateVersion | `1` |
| state | `{ owningProjectId: ProjectId \| null, owningProjectName: string \| null, owningProjectRootPath: string \| null }` |
| wire view | `{ owningProjectId: string \| null, owningProjectName: string \| null, owningProjectRootPath: string \| null }` |
| init(header) | resolves `header.cwd` against `ctx.appBuilderProjects.list()`; picks the first project whose canonical root is a directory-prefix ancestor of the cwd |
| apply | identity on state — cwd is set once at session creation and never mutates, so every committed event passes the same reference through (`Object.is` gates the change feed) |

Read access: `ctx.sessionProjections.snapshot(session).values.project` and `ctx.sessionProjections.stateOf(session, 'project')` for the live registry, `ctx.sessionProjectionCache.cachedSnapshot(meta)` for the zero-I/O listing read.

## Events

| Event | Payload | When |
|---|---|---|
| `project/created` | `ProjectCreatedEvent` | After the path validates and before the registry publishes |

## Known Limitations and Deferred Work

- **In-memory only.** Phase 1 keeps the registry process-local; durability lives in the session-log `project/created` event. A Phase 2 follow-up replaces this with a `dsh-storage-domain`-backed implementation that mirrors `WorkspaceRegistry`.
- **`listSessionIds` is path-prefix based.** It does not yet reconcile against `ctx.sessionQuery`; the second pass wires SQLite FTS5 for fuzzy 'sessions under this project' queries.
- **Cache opt-in.** The `project` projection unit is persisted only when the `@deepseek-ai/dsh-session-projection-cache` plugin is mounted. A composition without the cache serves the projection through the live watermark cache only — no durable `cachedSnapshot` reads.
- **Multi-user isolation** is deferred to Phase 3 (egress proxy + per-user `$DSH_HOME`).

## Reference

- [`planning/Phase 1 prompt.md`](../../../planning/Phase%201%20prompt.md) - Phase 1 task brief, section 2 (Project package)
- [`planning/Phase 1.5 prompt.md`](../../../planning/Phase%201.5%20prompt.md) - sub-phase 1.5.4 brief
- [`planning/Phase 2 prompt.md`](../../../planning/Phase%202%20prompt.md) - destination shape (the unit is Phase 2 §4 adopted in 1.5.4)
- [`packages/workspace/workspace`](../workspace) - the closest durable analog (Phase 1 uses this pattern in-memory)
- [`packages/session/session-projection-cache`](../../session/session-projection-cache) - the cache that checkpoints the unit
- [`packages/session/session-projection`](../../session/session-projection) - the projection registry seam
