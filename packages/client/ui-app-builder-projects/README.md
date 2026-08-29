# ui-app-builder-projects

English | [中文](README.zh.md)

App Builder web projects pane plugin: a vertical list of durable App Builder projects polled from the host snapshot endpoint, with selection wired to the shell's selection store. Composed under [planning/inspect/21-app-builder-web-shell.md](../../planning/inspect/21-app-builder-web-shell.md) on the `app-builder-web-reskin` branch.

## What ships in Phase 1

- Empty `apply()` host plugin (no Node-side behavior; pure browser UI).
- Browser `apply()` that registers `ProjectsList` into the host-declared `app-builder.projects` slot through `ctx.slots.inject`. Selection writes route through the shell-published `ctx.appBuilder` Cordis service.
- `ProjectsList` component rendering a vertical list of project rows (title, root path, dev-server status dot, click-to-select). Reads the polled snapshot via the standard `useSnapshot` selector hook from the inject `hooks` compartment; no local mirror, no subscription machinery in the component.
- Snapshot polling effect in `apply()` (default 5 s, clamped to [1 s, 60 s]) writes the latest snapshot into the polling store. The polling store is a `SnapshotStore` (the framework's subscription engine) shared between the polling effect (writes via `set` / `update`) and the slot entry's `hooks.snapshot` HostObservable (the renderer binds it to `useSnapshot`).
- Locale dictionaries (English + Chinese) for the pane chrome (header title, empty states, status labels).
- Invariant companion with a documented "No runtime invariant" reason.

## What does not ship yet

- The snapshot endpoint (`/__dsh/app-builder/snapshot.json`) is a Chunk 5 deliverable; until then `snapshotUrl` empty disables polling and the pane shows the `snapshotUnconfigured` empty state.
- The preview pane (`ui-app-builder-preview`) does not exist yet; the projects pane surfaces the matching dev-server status from the snapshot but cannot navigate or share state with a preview component.
- Server-state bridge (host writes the snapshot file; host serves the endpoint) is a Chunk 6 deliverable.
- Polling cadence is fixed; SSE/WS subscription is deferred to Phase 2.
- Multi-project preview, project rename, project delete, project creation UI — all deferred.

## Known Limitations and Deferred Work

- **Polling-only.** The pane polls every 5 s; a Phase 2 SSE channel replaces it. Phase 1 deliberately keeps the surface sync — no optimistic writes, no diff reconciliation.
- **No snapshot validation beyond shape.** The normalizer tolerates malformed entries by dropping them, but the snapshot itself is trusted as the host's contract; a hostile or stale snapshot could project a misleading list. Trust relies on the host endpoint's origin check (the planning step's localhost-only binding).
- **Single selection.** The projects pane emits one `selectedProjectId` at a time; the preview pane (future) renders the dev server URL for the selected project. Multi-select is Phase 2.
- **No project actions.** The pane does not expose scaffold, rename, delete, or open-in-editor; those live as model-driven tool calls in the conversation pane for Phase 1.
- **Dev-server status rendering is snapshot-driven, not live.** The status dot reflects the last polled `devServers[projectId].status`; it does not subscribe to live job updates. A Phase 2 enhancement threads the `app-builder-preview-dev` job surface into the pane.
