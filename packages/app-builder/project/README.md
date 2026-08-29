# @deepseek-ai/dsh-app-builder-project

English | [中文](README.zh.md)

The **App Builder project entity**: a typed record `{ id, name, rootPath, stack, gitUrl, dshProfile, createdAt }` that groups sessions under a project root. This package owns the `ProjectRegistry` Cordis service and the `project/created` session-log event.

## API

| Symbol | Kind | Notes |
|---|---|---|
| `ProjectRegistry` | default export | `Service` subclass; bound as `ctx.appBuilderProjects` |
| `name` | `string` | Cordis plugin name (`app-builder-project`) |
| `inject` | readonly tuple | `['logger']` |
| `Config` | schemastery schema | `{ defaultProfile: string }` (default `'app-builder'`) |
| `apply(ctx, config)` | function | Plugin entry |
| `Project`, `ProjectId`, `ProjectStack`, `ProjectCreatedEvent`, `CreateProjectInput` | types | re-exported from `./types.ts` |

### Methods

`await ctx.appBuilderProjects.create({ name, rootPath, stack, gitUrl?, dshProfile? })` creates one record, canonicalizes `rootPath` through `path.resolve` + `fs.stat`, emits `project/created`, and returns the record.

`ctx.appBuilderProjects.list()` returns every project in creation order; `get(id)` returns one record or `undefined`; `has(id)` is a presence check; `listSessionIds(id)` enumerates session ids whose `cwd` starts with the project's canonical root (reads `ctx.sessions` if present, returns `[]` otherwise).

## Events

| Event | Payload | When |
|---|---|---|
| `project/created` | `ProjectCreatedEvent` | After the path validates and before the registry publishes |

## Known Limitations and Deferred Work

- **In-memory only.** Phase 1 keeps the registry process-local; durability lives in the session-log `project/created` event. A Phase 2 follow-up replaces this with a `dsh-storage-domain`-backed implementation that mirrors `WorkspaceRegistry`.
- **`listSessionIds` is path-prefix based.** It does not yet reconcile against `ctx.sessionQuery`; the second pass wires SQLite FTS5 for fuzzy 'sessions under this project' queries.
- **Multi-user isolation** is deferred to Phase 3 (egress proxy + per-user `$DSH_HOME`).

## Reference

- [`planning/Phase 1 prompt.md`](../../../planning/Phase%201%20prompt.md) - Phase 1 task brief, section 2 (Project package)
- [`packages/workspace/workspace`](../workspace) - the closest durable analog (Phase 1 uses this pattern in-memory)
