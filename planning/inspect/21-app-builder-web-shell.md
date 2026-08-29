# Step 21 - App Builder Web Shell (3-pane UI on app-builder-web-reskin)

> Phase 1 web reskin plan: introduce the `ui-app-builder-shell` 3-pane layout (projects | chat | preview) on the existing `apps/web` shell, wire `ProjectRegistry` and live dev-server URLs to the browser through a JSON snapshot served by `dsh-host-webserver`, and gate the layout behind an `appBuilder.enabled` config switch so the classic UI remains available.

## TL;DR

The web reskin ships as four coordinated chunks on branch `app-builder-web-reskin`. Chunk 1 (this step first delivery) is a `packages/client/ui-app-builder-shell` plugin package that registers an `app-builder-shell` slot alongside `ui-conversation` and renders a 3-pane CSS-Grid layout (`260px | 1fr | 1fr`) with placeholder panes. Chunk 2 adds `packages/client/ui-app-builder-projects` (read-only project list backed by a server snapshot) and `packages/client/ui-app-builder-preview` (an iframe pane bound to the selected project dev-server URL). Chunk 3 adds the server snapshot endpoint on `@deepseek-ai/dsh-host-webserver` (an `AppBuilderSnapshot` JSON file the host serves at `/__dsh/app-builder/snapshot.json`) and a tick mechanism (`@deepseek-ai/dsh-runtime` project event + a polling client). Chunk 4 adds the snapshot harness and commits. The four new packages + one host change + one slot take-over cover the user chosen full-integration scope (3-pane layout, chat reuse, preview iframe, config switch, title update).

## Scope cut

**In scope (this chunk series):**

1. New client plugin package `@deepseek-ai/dsh-client-ui-app-builder-shell` - registers `app-builder-shell` slot; renders a 3-pane CSS Grid; reads `appBuilder.enabled` from window injection to decide whether to mount; passes selected-project state down to the projects and preview panes.
2. New client plugin package `@deepseek-ai/dsh-client-ui-app-builder-projects` - project list pane; reads snapshot; selection action through a slot-provided store.
3. New client plugin package `@deepseek-ai/dsh-client-ui-app-builder-preview` - iframe pane; receives the selected project preview URL through props; handles load/error events.
4. New bundle patch `@deepseek-ai/dsh-bundle-web-app` additions - register the three new packages in `cordis.patch.yml` and add them to the bundle package.json.
5. New server snapshot endpoint on `@deepseek-ai/dsh-host-webserver` - `GET /__dsh/app-builder/snapshot.json` returns `{ projects, devServers, ts }`; `devServers` is a map from project id to `{ url, port, status, sinceMs }`.
6. Snapshot emission from `packages/app-builder/project` - add `@deepseek-ai/dsh-app-builder-project` to publish a JSON snapshot every time a project is created or a preview job starts/stops, written to `$DSH_HOME/state/app-builder-snapshot.json`. This is an additive file write - the existing `ProjectRegistry` Service stays in-memory; the snapshot file is a derived projection.
7. `apps/web/index.html` title update to `DSH App Builder`.
8. Browser snapshot test - replay-mode `DSH_SNAPSHOT=replay pnpm run test:web` exercises the new layout against a static fixture snapshot.

**Out of scope (deferred to Phase 2 or later):**

1. Real-time project list updates via SSE/WebSocket - the snapshot file is polled (5 s interval) for Phase 1.
2. Inline chat inside the `preview` pane (i.e. attaching log output to the iframe).
3. Per-project agent sessions - the App Builder agent runs in the existing single-session `ui-conversation` slot.
4. Authentication / authorization on the snapshot endpoint - localhost-only binding (matches existing host behavior).
5. Multi-project live preview - one preview at a time, the list selection switches.
6. Drag-to-resize pane dividers - Phase 1 uses fixed ratios.

## Package list

| Package | Type | Role | Status |
|---|---|---|---|
| `packages/client/ui-app-builder-shell` | new (client plugin) | 3-pane layout root | planned |
| `packages/client/ui-app-builder-projects` | new (client plugin) | project list pane | planned |
| `packages/client/ui-app-builder-preview` | new (client plugin) | preview iframe pane | planned |
| `packages/bundle/web-app` | modified | add three client rows + package deps | planned |
| `packages/host/webserver` | modified | new `/__dsh/app-builder/snapshot.json` GET endpoint | planned |
| `packages/app-builder/project` | modified | publish snapshot file on project event | planned |
| `apps/web` | modified | index.html title + appBuilder.enabled flag injection | planned |

### Slot composition

The slot system standard (`.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md`) settles how plugins compose UI. Three implications:

1. **The shell renders `root` alone.** The new `ui-app-builder-shell` plugin must declare its slot into the existing root layout through the chain pattern (`{ kind: chain, scope: root, select: ? }`) or as a peer slot under the shell existing `children`. Per the standard, **the declaring entry holds the exclusive right to render its child slots** - the chain takeover model (`slot.declaration-injection`) lets the shell opt in without a hardcoded name dependency on App Builder.
2. **Slots are declared and authorized at register.** The shell registers with `children: { projects: { kind: single, scope: root }, preview: { kind: single, scope: root }, conversation: { kind: single, scope: session } }`. The `ui-conversation` slot is the existing `@deepseek-ai/dsh-client-ui-conversation` entry; the App Builder shell declares it as a child, so its register call is the only authority.
3. **Component props arrive in four shares.** Each pane component receives `PropsRuntime` + `PropsRenderSlots` (none, leaf) + `PropsStore` (selection store for projects; URL store for preview) + the inject face. There is no ctx access from components.

### Server-state bridge design

`ProjectRegistry` (Cordis Service in `packages/app-builder/project`) and the preview jobs (`packages/app-builder/preview`) live in the Node host process. The browser cannot reach them directly; the bridge must (a) project their current state, (b) keep the projection fresh, (c) be consumable from the bundled SPA.

**File-based snapshot (Phase 1):**

```
$DSH_HOME/state/app-builder-snapshot.json
{
  "ts": 1735689600000,
  "projects": [
    { "id": "p1", "name": "demo-app", "rootPath": "/abs/path/to/demo-app", "framework": "svelte-spa", "createdAtMs": 1735689000000 }
  ],
  "devServers": {
    "p1": { "url": "http://127.0.0.1:5173", "port": 5173, "status": "ready", "sinceMs": 1735689100000 }
  }
}
```

**Server side:**

- `packages/app-builder/project` adds an effect: `ctx.effect(() => ctx.on(project/created, () => writeSnapshot()))` + `ctx.on(app-builder-preview-dev, (job) => updateDevServer(job))`.
- `packages/host/webserver` adds `GET /__dsh/app-builder/snapshot.json` route. Returns 200 with the JSON if present, 503 if not (the client treats 503 as "no projects yet").
- Both run inside the host process; the host already binds `127.0.0.1` so no new exposure concerns.

**Client side:**

- `@deepseek-ai/dsh-client-ui-app-builder-projects` polls every 5 s when mounted. Uses the framework standard `useWorkspaces`-`useEffect`-`fetch` pattern; no custom subscription machinery.
- Snapshot URL is injected via the `appBuilder.snapshotUrl` field on the `getStaticModules()` payload - one place to override, no per-component config plumbing.

### Component contract (sketch)

```ts
// ui-app-builder-shell/src/apply.ts
export function apply(ctx: Context, config: Config = {}): void {
  if (!config.enabled) return // classic UI stays in place; the existing root layout still renders ui-conversation
  const handle = createShellStore()
  ctx.slots.inject(root, () => ctx.slots.register({
    name: app-builder-shell,
    children: {
      projects: { kind: single, scope: root },
      preview: { kind: single, scope: root },
      conversation: { kind: single, scope: session },
    },
    store: () => handle,
  }, Shell))
}
```

```ts
// ui-app-builder-shell/src/Shell.tsx
export function Shell(props: PropsRuntime<...> & PropsRenderSlots<...> & PropsStore<...> & InjectFace<...>): JSX.Element {
  return (
    <div className="app-builder-shell" data-app-builder-enabled>
      <aside className="app-builder-shell__projects">{props.renderSlot(projects, {})}</aside>
      <section className="app-builder-shell__chat">{props.renderSlot(conversation, {})}</section>
      <section className="app-builder-shell__preview">{props.renderSlot(preview, { selectedProjectId: props.useStore(s => s.selectedProjectId) })}</section>
    </div>
  )
}
```

## Test plan

| Test | File | Mode | Purpose |
|---|---|---|---|
| Unit: `shell.test.ts` | `packages/client/ui-app-builder-shell/tests/` | jsdom | Renders 3-pane layout; reads `enabled` config; passes selection to preview |
| Unit: `projects.test.ts` | `packages/client/ui-app-builder-projects/tests/` | jsdom | Renders project list from snapshot; selection updates store |
| Unit: `preview.test.ts` | `packages/client/ui-app-builder-preview/tests/` | jsdom | Renders iframe with selected URL; shows error state on load failure |
| Host: `snapshot.test.ts` | `packages/host/webserver/tests/` | node | Returns 200 with valid JSON when file exists; 503 when missing |
| Project: `snapshot-write.test.ts` | `packages/app-builder/project/tests/` | node | Write on `project/created`; update on `app-builder-preview-dev` event |
| Snapshot e2e: `app-builder-shell.replay.ts` | `packages/client/web/tests/` | `DSH_SNAPSHOT=replay` | Boots the bundled web dist with a fixture snapshot; asserts the layout renders 3 panes |
| Bundle: smoke | `packages/bundle/web-app/tests/` | node | All three new client packages resolve from the bundle |

Per the testing policy (`packages/client/AGENTS.md`): `pnpm run test:gui` after every change; `DSH_SNAPSHOT=replay pnpm run test:web` after the snapshot harness is in place.

## Residual items

- Snapshot polling interval (5 s) is a magic number; Phase 2 may move to SSE.
- The shell `enabled` flag is a plugin-level `Config`; no UI toggle exists yet (a future settings entry under `ui-settings` could expose it).
- `ui-conversation` is mounted under `session` scope, so swapping a session resets the chat - that is the existing semantics, no App Builder-specific behavior added.
- The host snapshot endpoint is unauthenticated; localhost-only is the Phase 1 trust boundary.

## Verification

```sh
# Per-package unit tests
pnpm --filter @deepseek-ai/dsh-client-ui-app-builder-shell test
pnpm --filter @deepseek-ai/dsh-client-ui-app-builder-projects test
pnpm --filter @deepseek-ai/dsh-client-ui-app-builder-preview test
pnpm --filter @deepseek-ai/dsh-host-webserver test
pnpm --filter @deepseek-ai/dsh-app-builder-project test

# Client + host integration (the inside-loop rung)
pnpm run test:gui

# Browser smoke with the new layout
DSH_SNAPSHOT=replay pnpm run test:web

# Full PR ladder (before push)
node_modules/.bin/tsx scripts/dsh-pre-push-checks.ts
```

## Git state plan

Target branch: `app-builder-web-reskin` (current). Sequence:

1. `feat(client): scaffold ui-app-builder-shell MVP 3-pane layout`
2. `feat(client): scaffold ui-app-builder-projects list pane`
3. `feat(client): scaffold ui-app-builder-preview iframe pane`
4. `feat(bundle): register app-builder client trio on web-app bundle`
5. `feat(host): expose AppBuilderSnapshot JSON endpoint`
6. `feat(app-builder): publish snapshot from ProjectRegistry + preview jobs`
7. `feat(apps/web): update title + inject appBuilder.enabled flag`
8. `test(client): add ui-app-builder-shell/tests + snapshot fixture`
9. `docs(planning): ship step 21 + Agent Notes (shell, projects, preview, snapshot-bridge)`

Each commit updates `planning/inspect/18-phase1-start-record.md` (the running kickoff log) in the same commit per `AGENTS.md` §Project process.

## Cross-references

- `planning/Phase 1 prompt.md` §6 - web reskin scope (this step derives the concrete plan)
- `planning/inspect/18-phase1-start-record.md` - Phase 1 kickoff log; updated as each commit lands
- `.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md` - slot composition contract
- `.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.md` - loading chain, object layer, services
- `.agents/notes/implemented/architecture/2026-08-05-slot-declaration-injection.md` - chain takeover mechanism (will read when Chunk 1 lands)
- `docs/testing.md` - test policy for client + host + e2e
