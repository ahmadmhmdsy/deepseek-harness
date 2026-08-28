# TASK: Phase 0 — Acceptance gate, no new code

Read [docs/PROJECT.md](../../docs/PROJECT.md) first. Phase 0 verifies that the existing dsh repo is ready to serve as the App Builder foundation. **Do not write new packages or features in this phase.**

## Tasks

1. **Inspect the environment**
   - Node 22.19+ (project `engines` field); pnpm 11.7.0.
   - Disk + git state: clean tree (the only modified file is `CLAUDE.md`; `planning/` is untracked).
   - Repo root: `E:\js_projects\my_deepseek_harness\deepseek-harness`.
   - Working directory: same.

2. **Verify the dsh version**
   - `cat package.json` shows `@deepseek-ai/dsh-root` version `0.1.1-rc.2`. Every workspace package shares this version.
   - Note the release cadence. dsh ships breaking changes; we pin and extend via plugins.

3. **Run the hello-world smoke**
   - **Precondition**: `pnpm run typecheck` (or `pnpm run build`) MUST have run successfully first. The dsh CLI source-launch via `node --import tsx/esm apps/cli/src/bin.ts` resolves `lib/*.js` literally because dsh's `package.json` `exports` field pins subpath outputs to compiled `lib/` artifacts. tsx's source-hook cannot redirect a `.js` import back to a `.ts` source. Without `lib/`, the typert-loader fails immediately with `ERR_MODULE_NOT_FOUND` for `packages/interaction/commands/lib/typert.host.js` and `packages/goal/goal/lib/typert.host.js`.
   - With `DEEPSEEK_API_KEY` exported: `pnpm dsh --profile headless 'create a hello-world app'`.
   - Capture the produced JSONL at `$DSH_HOME/sessions/.../session.jsonl.zstd`.
   - Without `DEEPSEEK_API_KEY`: self-skip and record the skip; do not fail the gate.

4. **Verify the gates are green**
   - **Precondition**: `pnpm run build` (host + client face) MUST have run before `pnpm run hygiene`. `pnpm run typecheck` only emits the host face (`build:lib:host`); the client face typechecks without emitting. `publint` and `verify-built-package-invariants` will be red on client-face packages (44 packages: `packages/client/*`, `packages/extensions/*`, etc.) unless `pnpm run build` has run.
   - `pnpm run typecheck`
   - `pnpm run test:coverage` (or `pnpm run test` for a faster pass)
   - `pnpm run doc-sync`
   - `pnpm run hygiene`
   - All four must pass on the current tree. Note: on Windows, `pnpm run test` may show ~9 pre-existing failures in `|thread-safe|` (worker-thread races, pwsh path normalization, LSP exec enumeration, SQLite differential); see `planning/inspect/15-phase0-pre-existing-failures.md` for the path B fix plan. On Linux/macOS those tests pass.

5. **Confirm the relocation of PROJECT.md**
   - `docs/PROJECT.md` exists (canonical source of truth).
   - `planning/PROJECT.md` is a redirect to `docs/PROJECT.md`.

6. **Record decisions**
   - Bundle location: `packages/bundle/app-builder/` (recommended).
   - Workspace group: `packages/app-builder/` (new group under `packages/`).
   - Headless driver: `pnpm dsh --profile headless` for non-interactive automation.
   - Web UI shell: re-skin `apps/web` (recommended) or new `apps/app-builder-web`.

## Definition of done

- dsh version pinned and recorded.
- Hello-world prompt completes (or self-skips without key).
- All four gate commands pass on the current tree.
- `docs/PROJECT.md` is the canonical source of truth.
- Phase 0 decisions recorded.

## Do NOT in Phase 0

- Do not create new packages.
- Do not write new features.
- Do not modify `cordis.yml` files.
- Do not bypass any gate.

## Report

Report: environment findings, dsh version pinned, gate pass/fail summary, decisions recorded. Do NOT proceed to Phase 1 until this is accepted.
