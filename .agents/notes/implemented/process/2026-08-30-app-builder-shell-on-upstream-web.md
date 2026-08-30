# Agent Note: App Builder shell re-skinned on upstream `apps/web/`

Status: implemented

English | [中文](2026-08-30-app-builder-shell-on-upstream-web.zh.md)

Branch: `apps-web-reskin-on-upstream` (stacked on `relocate/examples-app-builder`).

Stack position: 1.5.3 (above 1.5.2, below 1.5.4).

## Problem

After the B2 merge (1.5.1), upstream's `apps/web/` is a 183-file Vite SPA that boots through `AppWebEntry` from `@deepseek-ai/dsh-client-web`. The fork's two App Builder client plugins (`packages/client/ui-app-builder-shell` + `packages/client/ui-app-builder-projects`) were scaffolded during Phase 1 on the stale `app-builder-web-reskin` branch but never landed; they use the upstream slot-system contract (`ctx.slots.inject("root", ...)` chain take-over, `PropsRuntime`/`PropsRenderSlots`/`PropsStore`/`InjectFace` four-share props) but are not wired into the upstream `apps/web` host. The inspect step 21 plan (`planning/inspect/21-app-builder-web-shell.md`) called for an end-to-end re-skin but only the chunk 1 (shell) and chunk 2 (projects) deliverables landed — the server snapshot endpoint (chunk 5) and the project event emission (chunk 6) were never built, so even if the bundle patch wired the plugins the projects pane would render its empty state forever. Phase 1.5 / 1.5.3 closes the whole re-skin in one stacked PR: the bridge, the bundle wiring, and the title update.

## Decision

**1. New host package `packages/app-builder/snapshot-bridge/`** (no client half, no `dsh.client` declaration). The bridge subscribes to two upstream-owned event sources and projects them into one in-memory snapshot, which it atomically writes to `$DSH_HOME/state/app-builder-snapshot.json` (sibling `.tmp.<ts>.<pid>` then `rename`) and serves at `GET /__dsh/app-builder/snapshot.json` (exact route on `ctx.webServer`).

- `inject: ["webServer", "appBuilderProjects"]` — the route carrier and the project registry the snapshot mirrors.
- Subscribes to `project/created` (emitted by `@deepseek-ai/dsh-app-builder-project` after `registry.projects.set(id, project)`) and `app-builder-preview/dev-state` (new event emitted by the preview tool at starting / ready / failed transitions).
- File write is fire-and-forget but serialized through a chained `writeQueue` so a burst of state changes lands in monotonic order on disk (otherwise two fire-and-forget renames can race and the older one can overwrite the newer one at the rename step).
- `DSH_HOME` resolved through `launchEnvironmentOf(ctx)` (process env wins, then project `.env`, then user `.env`); an unset home skips the file projection — the HTTP route still serves the in-memory state, so the projects pane keeps working.
- HTTP route returns `200 application/json` of the in-memory snapshot. The inspect step 21 originally proposed `503` for the empty case, but the in-memory cache always has a `ts > 0` once the seed flush runs at apply time, so the `503` path was dead code. The empty snapshot with `projects: []` is served as `200`, which the projects pane's `state.error: "snapshot_unconfigured"` already treats as the empty state.

**2. Preview tool change (`packages/app-builder/preview/src/index.ts`)**: add a Cordis `Events["app-builder-preview/dev-state"]` augmentation and emit one event per state transition with payload `{ rootPath, framework, status, url?, port?, message?, reason?, sinceMs }`. Status is one of `starting` / `ready` / `failed`. The bridge resolves `rootPath` to a project id via the registry's `rootPath` match and writes the entry under `devServers[projectId]`. The `stopped` transition is not emitted (natural dev-server exit is rare and tracked through `ctx.jobs.onJobDone` in a follow-up).

**3. Project registry order fix (`packages/app-builder/project/src/index.ts`)**: `create()` now adds the project to the in-memory map **before** emitting `project/created`. The previous order (emit then add) was the Phase 1 contract per the inline comment, but a `ctx.on("project/created")` listener that calls `registry.list()` would observe an empty list because the `await this.ctx.emit(...)` itself queues a microtask — a `queueMicrotask(flush)` deferral in the bridge ran before the registry's `projects.set(...)`, so the snapshot always projected an empty list. The new order (add then emit) is the natural one: an event about a state change fires after the state has changed. The bridge's flush is now a synchronous response to the event.

**4. Bundle registration (`packages/bundle/web-app/`)**:

- `cordis.patch.yml` adds three rows in the existing `insert:` block:
  - `app-builder-snapshot-bridge` → `@deepseek-ai/dsh-app-builder-snapshot-bridge` (host row, mounted before the client rows so the snapshot endpoint is live by the time the projects pane starts polling);
  - `app-builder-shell` → `@deepseek-ai/dsh-client-ui-app-builder-shell` with `config.enabled: true` (the chain take-over flag; default true, false lets the existing root layout render unchanged);
  - `app-builder-projects` → `@deepseek-ai/dsh-client-ui-app-builder-projects` with `config.snapshotUrl: !!js "/__dsh/app-builder/snapshot.json"` (the bundle's own JS expression, not a `cordis.yml` template).
- `package.json` adds the three packages to `dependencies`.

**5. Title (`apps/web/`)**:

- `apps/web/index.html` static `<title>` → `DSH App Builder`.
- `apps/web/vite.config.ts` `DEFAULT_CLIENT_TITLE` literal and the `clientDocumentTitle` plugin's replace anchor → `DSH App Builder`. Local builds show the App Builder build name without an env override; `DSH_CLIENT_TITLE` still wins when set.

**6. `tsconfig.base.json`**: hand-written alias for `@deepseek-ai/dsh-app-builder-snapshot-bridge → ./packages/app-builder/snapshot-bridge/src` in the App Builder fork-only region (line 244); `gen-tsconfig-paths --check` then confirms the file is current.

**7. `tsconfig.host.json`**: add `{ "path": "./packages/app-builder/snapshot-bridge" }` to the references so the host aggregate type-checks the bridge.

**8. Pre-existing fixes carried into this PR** (carry-over Phase 1 issues that blocked the shell from type-checking cleanly):

- `packages/client/ui-app-builder-shell/tsconfig.json` and `packages/client/ui-app-builder-projects/tsconfig.json`: drop the dead `../runtime` reference (the `packages/client/runtime` directory exists with a `lib/` artifact but no `src/`, no `package.json`, no `tsconfig.json` — a stale scaffold from before upstream consolidated the client runtime into `packages/client/web` and other packages). Add `../ui-renderer` so the `ctx.slots` Context merge (declared by `ui-renderer`'s `src/client/index.ts`) reaches the shell and projects packages.
- Add `import type {} from "@deepseek-ai/dsh-client-ui-renderer/client"` in both `src/client/index.ts` files (the type-only shim that pulls the merge into the consumer's compilation unit; the runtime import graph is unchanged because the baseline externals already cover `ui-renderer`).

## Follow-ups

- **Snapshot bridge `stopped` transition**: add `ctx.jobs.onJobDone` in the bridge for `app-builder-preview-dev` jobs; on a terminal `JobSnapshot`, update the matching `devServers[projectId].status` to `stopped` (or `failed` depending on `snapshot.status`). The cleanest wiring adds a second event `app-builder-preview/dev-state` from the preview tool's `run()` callback when the producer's `done` resolves; the bridge would then own one event family.
- **Snapshot polling cadence + SSE**: the projects pane polls every 5 s; Phase 2 / sub-phase 1.5.4 replaces polling with an SSE stream so the projects pane updates immediately. The bridge's `SNAPSHOT_URL_PATH` stays the same; the bundle patch's `snapshotUrl` becomes a single `/api/events` channel.
- **Per-user `$DSH_HOME`**: today the snapshot file lands in the shared `$DSH_HOME/state/` directory. Phase 3 multi-user isolation moves the file under the user-scoped DSH home.
- **Bridge coverage in the per-file 100% gate**: the bridge has its own `tests/loader-composition-invariant.spec.ts` (2 tests, real composition through a `FakeWebServer` that captures registered routes). The test lane's `processBoundTests` list does not include it because the bridge is pure Node and the file write is async — the per-file 100% gate will pick it up under `pnpm run test:coverage`.
- **`apps/web/index.html` static title vs `DSH_CLIENT_TITLE` env**: the static title is now `DSH App Builder` so a bare `vite build` produces a page identifying itself as the App Builder build. Production deployments that ship a different title use `DSH_CLIENT_TITLE` (the `clientDocumentTitle` plugin overrides the title via env at build time).

## Verified

Run on the `apps-web-reskin-on-upstream` branch (relative to 1.5.2 baseline):

- `pnpm install` — PASS (lockfile unchanged in net new deps).
- `pnpm run typecheck` — PASS (`build:lib:host` builds every host package including the new bridge; `tsc -b tsconfig.client.json` builds the client plugins including the shell + projects).
- `pnpm run verify-cordis-config` — PASS (155 config files).
- `pnpm run verify-tsconfig-paths` — PASS (`gen-tsconfig-paths --check` clean).
- `pnpm run verify-translation-pairing --write packages/app-builder/snapshot-bridge/README.md` — recorded the bridge's README pair; subsequent check is current.
- `pnpm run verify-md-wrap` — PASS (2184 files, no hard-wrapped prose paragraphs).
- `pnpm run verify-agent-note-format` — PASS (645 Agent Notes conform).
- `pnpm exec vitest run packages/app-builder/snapshot-bridge/tests/ packages/app-builder/project/tests/ packages/app-builder/preview/tests/ packages/host/webserver/tests/` — 36 tests pass across 4 files.
- `pnpm exec vitest run packages/bundle/web-app/tests/` — 21 tests pass across 4 files.
- `pnpm --filter @deepseek-ai/dsh-app-builder-snapshot-bridge build` (covered by `build:lib:host`).

## Known pre-existing failures

These were already failing on the 1.5.2 baseline (`relocate/examples-app-builder`) and remain on this branch; they are NOT introduced by 1.5.3 and are tracked in the 1.5.1 Agent Note (`merge-upstream-v0.1.2-alpha.1`):

- `pnpm run verify-translation-pairing` — three pre-existing bilingual-drift notes (`2026-06-24-workspace-context.md`, `2026-07-21-follow-instruction-symlinks.md`, `2026-07-21-instruction-load-all-dedup.md`) reference a `2026-08-29-claude-md-operating-system.md` that does not exist. The 1.5.7 sub-phase re-records these pairs once the planning artifacts land.
- `pnpm run doc-sync` (CI-owned) — pre-existing 13 failures inherited from the upstream v0.1.2-alpha.1 merge; documented in `planning/inspect/19-upstream-v0.1.2-alpha.1-adoption-plan.md §9` and the 1.5.1 Agent Note.
- `pnpm run hygiene` (CI-owned) — pre-existing 8 failures inherited from the upstream v0.1.2-alpha.1 merge.
- `pnpm run test:coverage` (CI-owned) — 1.5.1 baseline reports 985 / 1005 with 15 upstream-introduced regression files; none caused by 1.5.3.
- `pnpm run test:snapshot` (CI-owned) — not run on this branch; per AGENTS.md §Run relevant checks locally, CI owns the platform matrix.

## Alternatives considered

### Why not defer the snapshot bridge to a later sub-phase?

Phase 1.5 / 1.5.3 brief says "Update snapshot polling URL to match upstream's apps/web endpoint." That phrasing assumes the endpoint exists. Inspect step 21 listed it as chunk 5 (server endpoint) and chunk 6 (project event emission); the stale `app-builder-web-reskin` branch never landed them. Without the bridge the reskin does not actually work — the projects pane renders its empty state forever. The bridge is small (one new package, three event emissions in the preview tool, one `projects.set` reorder) and tightly coupled to the bundle wiring, so deferring it would split a single logical change across two stacked PRs.

### Why not a separate package for the host snapshot writer?

The inspect doc suggested adding the route directly to `@deepseek-ai/dsh-host-webserver` ("New server snapshot endpoint on `@deepseek-ai/dsh-host-webserver`"). The host package is a generic HTTP carrier that knows no harness concepts; adding App Builder specifics there would leak domain knowledge into the transport layer. A dedicated `packages/app-builder/snapshot-bridge/` keeps `host/webserver` ignorant of App Builder and lets the bridge own its own state-mirroring contract. The route registration goes through the same `ctx.webServer.register({ kind: "exact", path, handler })` API as any other route — no transport-layer change required.

### Why not poll the registry from the bridge instead of subscribing to events?

A `setInterval` poll on `registry.list()` would project the registry without any registry change, but it would miss the dev-server lifecycle (the preview tool emits no `devServers` mirror). The event-driven design is one-subscribe-per-source and naturally extends to SSE in Phase 2.

### Why invert `Project.create()` order instead of deferring the bridge flush?

A `queueMicrotask(flush)` in the bridge handler runs before the `await this.ctx.emit(...)` continuation in the registry, so the deferral still observed an empty list. The cleanest fix is the natural one: state changes before notifications. The new contract is documented in the `Project.create()` JSDoc; the existing comment ("emits a `project/created` event before publishing") is replaced with the correct order. No other plugin depends on the old order — the only other consumer is the session log, which records the event regardless of when `projects.set` runs.

### Why a hand-written `tsconfig.base.json` alias instead of letting `gen-tsconfig-paths` auto-derive it?

`gen-tsconfig-paths` only generates aliases whose package name matches the directory name. `@deepseek-ai/dsh-app-builder-snapshot-bridge` does not match `app-builder/snapshot-bridge` (four segments vs two), so the generator refuses. The existing App Builder fork-only region (lines 234-247) already carries hand-written aliases for the same reason — the new entry slots in next to `dsh-app-builder-persona` and the client shell / projects aliases.

### Why not run the bridge on every keystroke / every registry mutation?

The bridge flushes once per `project/created` event and once per `app-builder-preview/dev-state` event. The dev-server lifecycle is observable through those events, and the registry is event-driven already, so the bridge mirrors a coherent state view at every change. Polling at a faster cadence would burn CPU for no semantic gain.

## Consequences

- `pnpm dsh --profile web` (or any profile that boots the `dsh-bundle-web-app` bundle) now serves the 3-pane App Builder layout under `apps/web/`. The shell takes over the root layout through `ctx.slots.inject("root", ...)` when `appBuilder.enabled: true`; setting `enabled: false` keeps the classic UI.
- The browser projects pane receives the snapshot through the polling URL the bundle patch wires; the snapshot endpoint returns `200 application/json` of the latest projection, served from the in-memory cache (the file write is best-effort).
- The bridge is host-only (no client bundle, no `dsh.client` declaration). It is mounted by the bundle patch as an ordinary Cordis row; nothing about the bridge is visible to the browser except the JSON at `/__dsh/app-builder/snapshot.json`.
- The preview tool now emits a Cordis event on every dev-server state transition. The bridge consumes the event; future consumers (a debug surface, a TUI status line, the bundle-app-builder's own dev-server list) can subscribe without coupling to the bridge.
- The `Project.create()` order change is observable only through the order of `projects.set` and `ctx.emit`; the API surface (return value, error behavior, event payload) is unchanged. Downstream consumers that read `registry.list()` after a `project/created` event now see the new project, which is the documented contract.
- Local `pnpm dsh web` boots show "DSH App Builder" as the page title; CI e2e lanes that need a stable title set `DSH_CLIENT_TITLE` at build time.