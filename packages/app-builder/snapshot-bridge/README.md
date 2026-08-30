# @deepseek-ai/dsh-app-builder-snapshot-bridge

English | [中文](README.zh.md)

The **App Builder state projector**: bridges project registry state and preview dev-server lifecycle into one in-memory snapshot, atomically writes the projection to `$DSH_HOME/state/app-builder-snapshot.json`, and serves it at `GET /__dsh/app-builder/snapshot.json` for the browser projects pane.

## API

| Symbol | Kind | Notes |
|---|---|---|
| `apply(ctx, config)` | function plugin | mounts the snapshot route on `ctx.webServer`, subscribes to `project/created` and `app-builder-preview/dev-state`, mirrors state, writes the file |
| `Config` | schemastery schema | `{ snapshotPath?, snapshotUrlPath? }`; both default to the production contract below |
| `name` | `string` | Cordis plugin name (`app-builder-snapshot-bridge`) |
| `inject` | readonly tuple | `["webServer", "appBuilderProjects"]` |
| `AppBuilderSnapshot`, `SnapshotProject`, `SnapshotDevServer`, `DevServerStatus`, `AppBuilderPreviewDevState` | types | the wire shape the browser pane reads |
| `SNAPSHOT_URL_PATH` | constant | the route path (`/__dsh/app-builder/snapshot.json`) |
| `EMPTY_SNAPSHOT` | constant | the empty initial value, exported for tests and consumers |

## Wire shape

`GET /__dsh/app-builder/snapshot.json`:

```jsonc
{
  "ts": 1735689600000,
  "projects": [
    {
      "id": "p1",
      "name": "demo-app",
      "rootPath": "/abs/path/to/demo-app",
      "stack": "svelte-spa",
      "createdAt": 1735689000000
    }
  ],
  "devServers": {
    "p1": {
      "url": "http://127.0.0.1:5173/",
      "port": 5173,
      "status": "ready",
      "message": "framework: vite",
      "updatedAt": 1735689100000
    }
  }
}
```

- `ts` is the last-write timestamp in epoch milliseconds.
- `projects` is the registry list in creation order.
- `devServers` is keyed by project id. Absent keys mean no preview has run yet.
- The route returns `503 { "error": "app_builder_snapshot_unavailable" }` until the first flush (no project created yet).

## Events

| Event | Source | Effect |
|---|---|---|
| `project/created` | `@deepseek-ai/dsh-app-builder-project` | flush: rebuild snapshot, write file |
| `app-builder-preview/dev-state` | `@deepseek-ai/dsh-app-builder-preview` | update `devServers[projectId]`, flush |

A dev-state event whose `rootPath` does not match any known project is dropped (the preview was started against a non-App-Builder directory; nothing to project).

## File write

The bridge writes through a sibling `.tmp.<ts>.<pid>` file then renames over the destination. Readers never see a half-written file. A write failure logs a warning and does not propagate; the in-memory state is still authoritative for the HTTP route.

`DSH_HOME` is resolved through `launchEnvironmentOf(ctx)` (process env wins, then project `.env`, then user `.env`). When `DSH_HOME` is unset the file projection is skipped — the HTTP route still serves the in-memory state, so the projects pane keeps working.

## Composition

- `ctx.webServer` — `register({ kind: "exact", path, handler })` mounts the snapshot route.
- `ctx.appBuilderProjects` — `list()` and the `project/created` event seed the projection; the bridge does not own durability.
- `ctx.logger` — file-write failures log here.

The bridge is host-only; it has no browser half, no client bundle, no `dsh.client` declaration. The browser pane reads the projection through its own `fetch` and never sees the bridge directly.

## Model Experience

The bridge has no model-facing surface. Its consumers are the browser projects pane and the host diagnostic surfaces; no tool schema, no prompt section, no session-log event.

Token cost: zero. KV-cache stability: irrelevant.

## Known Limitations and Deferred Work

- **In-memory dev-server state is not persisted.** A `dsh` restart loses the dev-server entries; projects reappear (durable through the session log) but their last preview state is gone until the next preview call.
- **`stopped` is not emitted.** The bridge records `starting` / `ready` / `failed` transitions from the preview tool; the natural dev-server exit (no model kill) does not currently mark the entry `stopped`. Phase 2 adds a `onJobDone` listener for `app-builder-preview-dev` so a clean exit surfaces as `stopped`.
- **No SSE channel.** The browser pane polls every 5 s; Phase 2 replaces polling with an SSE stream so the projects pane updates immediately.
- **Snapshot polling is a single client.** Concurrent browser tabs all hit the in-memory cache; the file write happens once per state change. No cross-tab push yet.
- **No per-user `$DSH_HOME`.** Phase 3 adds multi-user isolation; today the snapshot file lands in the shared `state/` directory.