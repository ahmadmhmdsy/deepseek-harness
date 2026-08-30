# Phase goals (revised)

> Per-phase goals rewritten to reflect dsh's actual state. The canonical source of truth is [docs/PROJECT.md](../docs/PROJECT.md).

## Phase 0 — Acceptance gate, no new code (you only)

**Goal**: confirm dsh is ready to serve as the App Builder foundation. No new packages, no new features.

- Pin the dsh version (`0.1.1-rc.2`) and record release cadence in `docs/PROJECT.md`.
- Run `pnpm dsh --profile headless 'create a hello-world app'` with `DEEPSEEK_API_KEY`; capture the JSONL.
- Verify the four gates are green: `pnpm run typecheck`, `pnpm run test:coverage`, `pnpm run doc-sync`, `pnpm run hygiene`.
- Confirm `docs/PROJECT.md` is canonical and `planning/PROJECT.md` redirects to it.
- Record Phase 1 decisions: bundle location (`packages/bundle/app-builder/`), workspace group (`packages/app-builder/`), UI shell (`apps/web` re-skin vs. new app).

**Exit criteria**: dsh version pinned and recorded; hello-world prompt completes (or self-skips without key); all four gates pass on the current tree; Phase 1 decisions recorded.

## Phase 1 — App Builder MVP (1–2 weeks)

**Goal**: prompt -> running app with live preview, locally, no auth.

- New bundle `packages/bundle/app-builder/cordis.patch.yml` over `base`.
- Four new packages under `packages/app-builder/`:
  - `dsh-app-builder-project` (Project entity + projection unit).
  - `dsh-app-builder-scaffold` (~150 LOC; composes `dsh-tool-fs` + `dsh-tool-bash` + `dsh-tool-str-replace-editor`).
  - `dsh-app-builder-preview` (readiness probe + optional headless screenshot).
  - `dsh-app-builder-persona`.
- One new example `apps/cli/config/examples/app-builder/` with keyless + with-key smokes.
- Re-skin `apps/web` with project list + chat + preview iframe.
- Snapshot scenarios: `cordis.yml`, `scaffold-hello-world`, `preview-dev-server`, `preview-iterate`.
- Agent Notes: `scaffold-plugin`, `preview-plugin`, `project-entity`, `app-builder-persona`.
- Per-package obligations: `tests/`, `./invariant`, bilingual README, real-composition test, per-file 100% coverage, catalog registration.

**Exit criteria**: prompt -> scaffold -> run -> preview -> iterate -> resume works locally, sandboxed; all five verification commands pass.

## Phase 1.5 — Upstream sync to `dsh-v0.1.2-alpha.1` (3–7 days)

**Goal**: synchronize the fork to upstream's tagged release so Phase 2 starts on top of upstream's chosen app shape and up-to-date API / projection infrastructure. The pin moves from `0.1.1-rc.2` to `0.1.2-alpha.1`.

- **Sub-phase 1.5.1 — B2 merge.** `git merge --no-ff upstream/master` on a new branch. Resolve the 25 shared paths. Regenerate `pnpm-lock.yaml`. All 5 gates green.
- **Sub-phase 1.5.2 — Examples relocation.** Move `examples/app-builder/` → `apps/cli/config/examples/app-builder/`. Re-record snapshots. 5 gates green.
- **Sub-phase 1.5.3 — Apps/web reskin.** Integrate `ui-app-builder-shell` + `ui-app-builder-projects` into upstream's rebuilt `apps/web/` (183 files). Add slot declarations. Re-record web snapshots. 5 gates green.
- **Sub-phase 1.5.4 — Projection cache adoption.** Wire `xtr/projection-per-session-cache` (PR #2781) into `packages/app-builder/project/`. 5 gates green.
- **Sub-phase 1.5.5 — API gateway adoption.** Cherry-pick `worktree-apire-*` cluster. Scaffold `packages/app-builder/api/`. 5 gates green.
- **Sub-phase 1.5.6 — Subagent provider.** Cherry-pick PR #2663. Re-apply our `721c1d6fe1 fix` if clobbered. 5 gates green.
- **Sub-phase 1.5.7 — Planning artifacts.** Update `plan.md`, `goal.md`, `Phase 2 prompt.md`, `inspect/INDEX.md`, `inspect/SUMMARY.md`, `docs/PROJECT.md`. `pnpm run doc-sync` PASS.

Detailed plan: [`inspect/19-upstream-v0.1.2-alpha.1-adoption-plan.md`](inspect/19-upstream-v0.1.2-alpha.1-adoption-plan.md).

**Exit criteria**: `master` pin = `0.1.2-alpha.1`; `examples/app-builder/` lives at `apps/cli/config/examples/app-builder/`; `apps/web/` is upstream's; `packages/app-builder/api/` scaffolded; `packages/app-builder/project/` uses the cache; `packages/subagent/subagent/` includes both upstream's refactor and our fix; all 5 verification commands PASS; all 7 sub-phase PRs merged via native stacked PRs; `docs/PROJECT.md` reflects the new state.

## Phase 2 — Productize the control plane (2–4 weeks)

**Goal**: a real product around dsh, still single-user but scale-ready.

- **Three new packages**:
  - `packages/app-builder/deployment` (Deployment entity + `deploy` tool + SAST/SCA/secrets gates).
  - `packages/app-builder/tool-policy` (typed `ToolPolicy` schema + `tools/pre-execute` enforcer; falls back to `ctx.permissionPresets`).
  - `packages/app-builder/api` (Typert Remote service exposing REST + SSE).
- Mount the API via existing `dsh-api-gateway` + `dsh-api-remotes` (do not add a new HTTP layer).
- Add a `project` projection unit + cache.
- Update `apps/web` with project list, deployment status pane, preview iframe with `EventSource`.
- Snapshot scenarios: `deploy-local`, `deploy-blocked-by-gates`, `tool-policy-allow`, `tool-policy-deny`, `api-list-projects`.
- Agent Notes: `deployment-pipeline`, `tool-policy-typed-schema`, `control-plane-api`.

**Most important Phase 2 item**: the typed `ToolPolicy` schema. dsh's runtime enforcement already exists (`permission-presets`, `sandbox-policy`, `tools/pre-execute`, `tools/guard`); this phase adds the typed schema + enforcer that ties them together. Build it now, not later — retrofitting it is painful.

**Exit criteria**: chat UI drives the full loop; sessions resume/fork/replay; every tool call policy-checked and logged with traceability; deploy path works and passes gates; all five verification commands pass.

## Phase 3 — Multi-user scale (2–4 weeks)

**Goal**: isolated tenants on one deployment. **Do not start until Phases 0–2 are accepted.**

- **Three new packages**:
  - `packages/app-builder/auth` (control-plane auth boundary).
  - `packages/app-builder/egress-proxy` (HTTP egress per project with allow-list + rate limit; required because Landlock cannot restrict network).
  - `packages/app-builder/quota` (per-user budgets; wrap + extend `dsh-token-meter`; cache-aware pricing).
- Wire per-project dsh worker processes (one process per project).
- Per-user memory partitioning at the storage layer.
- Per-project preview proxying via `dsh-host-apiproxy`.
- CI deploy path gated by approval.
- Snapshot scenarios: `multi-tenant-isolation`, `quota-enforced`, `egress-proxy-blocked`, `deploy-gated`.
- Agent Notes: `multi-tenant-isolation`, `quota-enforcement`, `egress-proxy`.

**Exit criteria**: two concurrent users build apps in isolated sandboxes with no cross-talk; quotas enforced; deployments gated and auditable; all five verification commands pass.

## What to avoid (carry-over from the original plan)

- Don't expose dsh's local RPC directly to any user — it has no auth and full-access mode is genuinely dangerous. The control plane is the auth boundary.
- Don't fork dsh to add features; it ships breaking changes rapidly and doesn't accept external PRs. Stay on top of a pinned version (0.1.1-rc.2) and keep all additions as plugins + bundles.
- Don't invent `apps/control-plane` + `apps/worker`. dsh's mental model is one app + bundle patches. Use `apps/web` + `packages/bundle/app-builder/`.
- Don't invent `packages/plugins`. dsh's plugin namespace is the existing capability groups under `packages/`. Use `packages/app-builder/`.
- Don't skip the per-package obligations. Every new package ships `tests/`, `./invariant`, bilingual README, per-file 100% coverage on `src`, catalog registration, Agent Note.
- Don't skip the verification gates (`pnpm run typecheck`, `pnpm run test:coverage`, `pnpm run test:snapshot`, `pnpm run doc-sync`, `pnpm run hygiene`).
- Don't rely on 'the model will be careful' as a control. Sandboxing + least privilege + approvals + adversarial testing is the path.

## Rule of thumb

Phase 0 proves the foundation works; Phase 1 proves the App Builder works; Phase 2 proves the product is scale-ready; Phase 3 proves the business works. If you ship the typed ToolPolicy manifest + the Project/Deployment entities in Phase 2, Phase 3 is mostly worker-pool plumbing.
