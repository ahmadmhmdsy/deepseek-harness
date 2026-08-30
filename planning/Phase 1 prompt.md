# TASK: Phase 1 — App Builder MVP

Read [docs/PROJECT.md](../../docs/PROJECT.md) first. Goal: prompt -> running app with live preview, locally, no auth. **Extend dsh as plugins + one new bundle; do not fork.**

## 0. Resolved decisions for Phase 1

- **Workspace group**: new group `packages/app-builder/` under `packages/`. Do not place new packages under existing groups.
- **UI shell**: branch in git, NOT a permanent workspace copy.
  1. Create a tag `apps-web-classic-pre-app-builder` immediately before starting the reskin: `git tag apps-web-classic-pre-app-builder`.
  2. Create a feature branch: `git checkout -b app-builder-web-reskin`.
  3. Reskin `apps/web` on the branch. The tag is the safety net; `git checkout apps-web-classic-pre-app-builder` restores everything if the reskin goes wrong.
  4. The existing web snapshot tests (`apps/web/tests/snapshots/`) are the safety net, not a parallel workspace.
  5. **Do NOT copy `apps/web` to `apps/app-builder-web`**. A permanent copy doubles the workspace footprint, creates two `cordis.yml` / `vite.config.ts` / `package.json` / `tests/` directories to maintain, and adds friction at every catalog gate. If a side-by-side rollout is needed later, revisit as a separate decision.
- **Headless driver**: `pnpm dsh --profile headless` for non-interactive automation. `examples/headless-agent` is the canonical pattern.

## 1. Bundle

Create a new bundle `packages/bundle/app-builder/cordis.patch.yml` that patches over `packages/bundle/base`. The bundle references:

- `@deepseek-ai/dsh-app-builder-project`
- `@deepseek-ai/dsh-app-builder-scaffold`
- `@deepseek-ai/dsh-app-builder-preview`
- `@deepseek-ai/dsh-app-builder-persona`

Each package listed in the patch must appear in `bundle/app-builder/package.json` `dependencies` AND in `examples/package.json` (per `verify-cordis-config`).

## 2. Project package (`packages/app-builder/project/`)

- Cordis plugin that registers a `Project` entity and its projection unit.
- Wire to the existing `ctx.sessions` and `ctx.sessionQuery` to enumerate sessions under a project root.
- Project metadata: `{ id, name, stack, gitUrl, dshProfile, createdAt }`.
- Emit `project/created` event (log-only).

## 3. Scaffold tool (`packages/app-builder/scaffold/`)

- Composes `@deepseek-ai/dsh-tool-fs` + `@deepseek-ai/dsh-tool-str-replace-editor` + `@deepseek-ai/dsh-tool-bash`.
- Inputs (Zod-validated via schemastery `Config`): `template` (`nextjs-app` | `nextjs-pages` | `svelte-spa`), `name`, `stack`, `features`.
- Restrict writes to the project's `cwd` (set via `ctx.sandboxPolicy`).
- Optional `npm install` step (`run_in_background: true` for large installs).

## 4. Preview tool (`packages/app-builder/preview/`)

- Starts the project's dev server via `@deepseek-ai/dsh-tool-bash` `run_in_background: true`; returns a job id.
- Wait for readiness: NEW HTTP-poll helper (default 30 s timeout, configurable).
- Optional headless-browser screenshot (Playwright, gated on user opt-in).
- Bind to localhost only.
- Job lifecycle managed via `@deepseek-ai/dsh-tool-jobs`.

## 5. App Builder persona (`packages/app-builder/persona/`)

- Use `@deepseek-ai/dsh-persona` to declare a persona that scopes an App Builder agent.
- Persona text: an App Builder coding persona, scoped to project scaffolding + iteration.

## 6. Example (`examples/app-builder/`)

> Note: this location moves to `apps/cli/config/examples/app-builder/` in Phase 1.5 (Upstream sync). Upstream's PR #2977 retired top-level `examples/`; the fork aligns with the new shape before Phase 2 begins. Snapshot fixtures and the keyless/with-key smokes re-record at the new path. See [`Phase 1.5 prompt.md §1.2`](Phase%201.5%20prompt.md).

- `cordis.yml` mounting the bundle.
- `cordis.snapshot.yml` (expected composition output).
- `tests/e2e/keyless-smoke.spec.ts` — boots via `@deepseek-ai/dsh-loader-smoke`.
- `tests/e2e/with-key-smoke.spec.ts` — sends a real prompt, verifies scaffold + preview.
- Add the new packages to `examples/package.json`.

## 7. Web UI integration (`apps/web`)

Work happens on the `app-builder-web-reskin` branch (see "Resolved decisions" above).

- Add a project list pane (uses the new `Project` projection unit).
- Re-use existing chat pane from `@deepseek-ai/dsh-client-ui-conversation`.
- Add a preview iframe pane bound to the per-project dev server URL.
- Update `apps/web/index.html` title to identify the App Builder build (default today: `DSH Local Build`).
- Add a configuration switch (e.g., `appBuilder.enabled`) that loads the App Builder UI rows; the classic rows remain for fallback.
- Web browser snapshot tests cover BOTH the App Builder UI and the classic UI rows.
- On acceptance: merge the branch; keep the tag `apps-web-classic-pre-app-builder` as a long-lived revert point.

## 8. Snapshot tests

- `cordis.yml` snapshot (composition output).
- `scaffold-hello-world` (scaffolds a Next.js app + npm install).
- `preview-dev-server` (starts the dev server, waits for readiness).
- `preview-iterate` (model makes an edit; preview reflects the change).

## 9. Agent Notes

- One Agent Note per non-trivial package: `scaffold-plugin`, `preview-plugin`, `project-entity`, `app-builder-persona`.
- Use `@deepseek-ai/dsh-archive-agent-notes` rules (present tense, no migration plans, link Agent Notes for rationale).

## 10. Per-package obligations (apply to every new package)

- `tests/` directory (NOT `src/__tests__/`).
- `src/invariant.ts` exporting `@deepseek-ai/dsh-<name>/invariant` (registers manifest name + an event/data relation check).
- README + JSDoc with `Model Experience` + `Known Limitations and Deferred Work` sections.
- Real-composition test (Loader-driven `cordis.yml` boot, not unit-style mocks).
- Per-file 100% coverage on `src`.
- Bilingual README (`README.md` + `README.zh.md` + `README.i18n.yaml`).
- Catalog registration: cordis, client (if browser-facing), tool (if model-facing), config, persistence.
- `tsconfig.json` extends `tsconfig.base.json` (Client: `tsconfig.base.client.json`), uses `rootDir: src`.
- Listed in `tsconfig.host.json` (or `.client.json`) reference list.

## Verification

`pnpm run typecheck && pnpm run test:coverage && pnpm run test:snapshot && pnpm run doc-sync && pnpm run hygiene` — all green.

## Definition of done

- prompt -> scaffold -> run -> preview -> iterate -> resume works locally, sandboxed.
- All per-package obligations satisfied.
- All five verification commands pass.
- Snapshot scenarios committed.
- Agent Notes committed.

## Do NOT in Phase 1

- Do not fork dsh.
- Do not invent `apps/control-plane`; use the existing `apps/web` + bundle patches.
- Do not invent `packages/plugins`; place new packages under `packages/app-builder/`.
- Do not copy `apps/web` to `apps/app-builder-web`; the branch + tag strategy is the safety net.
- Do not skip the gates (per-file coverage, snapshots, doc-sync, hygiene).
- Do not skip the package invariant companion (`./invariant`).
- Do not skip the bilingual README.
- Do not skip Agent Notes for non-trivial changes.
- Do not skip the snapshot scenarios; they are the safety net for the UI reskin.

## Report

Report: bundle name + version, packages added, snapshot scenarios, Agent Notes, gate results. Do NOT proceed to Phase 2 until this is accepted.
