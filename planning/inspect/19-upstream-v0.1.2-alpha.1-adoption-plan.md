# Step 19 — Upstream v0.1.2-alpha.1 adoption plan

> Detailed per-file conflict map, conflict-resolution plan, and sub-phase sequencing for Phase 1.5 (Upstream Sync). Sources: the 1079 upstream commits past merge-base `b150a551b8`, the 25 file paths modified by both sides, and the App Builder plan in `planning/Phase 1 prompt.md` / `Phase 2 prompt.md`.

## 0. Scope

This step covers the **Phase 1.5** task brief. Phase 1.5 sits between Phase 1 (App Builder MVP, in progress) and Phase 2 (Productize control plane). The user has approved the following decisions (see `planning/Phase 1.5 prompt.md §0`):

- Bump pin from `0.1.1-rc.2` to `0.1.2-alpha.1` (option B2).
- Move `examples/app-builder/` → `apps/cli/config/examples/app-builder/`.
- Adopt upstream's `apps/web/`; re-skin our shell inside it.
- Phase 2 accelerators: `xtr/projection-per-session-cache`, `worktree-apire-*` cluster, `feat/subagent-provider`.

## 1. Upstream baseline

| | |
|---|---|
| Upstream HEAD | `cd5ef81481` tagged `dsh-v0.1.2-alpha.1` (2026-08-28) |
| Merge-base | `b150a551b8` (release `dsh-0.1.1-rc.2`, 2026-08-21) |
| Upstream-only commits | 1079 |
| Origin-only commits | 40 |
| Shared paths (both sides modified) | 25 |
| Files added by upstream not present on us | 1569 |
| Files removed by upstream | 537 |

## 2. Semantic-breaking changes upstream (forces Phase 1.5)

These four PRs are why we cannot stay on `0.1.1-rc.2` indefinitely:

1. **PR #3074 `Rename code-mode to ptc` (PTC mode)** — `8437bfb9e4` (2026-08-28). Renames `code-mode` → `ptc` across the repo. Affects `.agents/notes/implemented/feature/2026-06-24-workspace-context.md` (upstream rewrote it) and `AGENTS.md` references.
2. **PR #2948 `feat: unify application launch under dsh profiles`** — `92f8fb6c4a` (2026-08-23). Upstream rewrote the CLI profile loader. Phase 1 prompt §0 references `pnpm dsh --profile headless`; verify it still works after the rewrite.
3. **PR #2977 `refactor(repo): retire top-level examples`** — `084a1ac5f6` (2026-08-24) → `4125514a08`. Upstream emptied top-level `examples/`. Decision: relocate our `examples/app-builder/` to `apps/cli/config/examples/app-builder/`.
4. **PR #2698 `feat(session): add streaming format migration pipeline`** — `3fefcdbe3f` (2026-08-25) → reverted in PR #3054 → partially restored in PR #3111. Our Phase 1 snapshot fixtures reference the old format; need re-validation.

Auxiliary breaking changes:

- **PR #2731 `xtr/message-tool-call-id`** — `CallId` → `ToolCallId`. Affects snapshot fixtures that reference the old name.
- **PR #2781 `xtr/projection-per-session-cache`** — `53c8f64eed` (2026-08-25). From-scratch projection cache. Adoption candidate (Phase 2 accelerator).
- **PR #2663 `feat/subagent-provider`** — `f76a225a7d` (2026-08-24). Subagent provider refactor in `packages/subagent/subagent/`. Adoption candidate.

## 3. The 25 shared paths — conflict-resolution plan

| Path | Upstream commits | Origin commits | Resolution |
|---|---|---|---|
| `pnpm-lock.yaml` | 141 | 4 | Take upstream; regenerate via `pnpm install`. Our deps regenerate. |
| `tsconfig.host.json` | 37 | 1 | Take upstream; re-add `app-builder` group reference. |
| `AGENTS.md` | 18 | 3 | Take upstream's prose tightening; re-record our additions (Project process / maintained artifacts / Why-no-symlink). |
| `packages/AGENTS.md` | 3 | ? | Take upstream's small wording diff (3 insertions / 3 deletions). |
| `packages/README.md` | 8 | ? | Take upstream's package list; re-add our `app-builder` group entry. |
| `packages/README.zh.md` | 9 | ? | Same. |
| `packages/README.i18n.yaml` | 9 | ? | Same. |
| `packages/subagent/subagent/package.json` | 10 | 0 | Take upstream (PR #2663). |
| `packages/subagent/subagent/src/child-agent.ts` | 2 | 0 | Take upstream. |
| `packages/subagent/subagent/tests/child-agent.spec.ts` | 1 | 0 | Take upstream. |
| `packages/subagent/subagent/tsconfig.json` | 3 | 0 | Take upstream. |
| `packages/test-support/acp-snapshot/src/harness.ts` | 3 | 0 | Take upstream. |
| `scripts/rescope-vendor.ts` | 8 | ? | Take upstream; verify our `82ab97ad80` markers still align. |
| `scripts/oxlint-contract.spec.ts` | 6 | ? | Take upstream (timing budgets already 60s+). |
| `packages/client/ui-primitives/tests/code-block.client.spec.tsx` | 2 | ? | Take upstream (`code-mode` → `ptc` rename). |
| `packages/session/session-persistence-sqlite/tests/differential.spec.ts` | 5 | ? | Take upstream (`ToolCallId` + timing). |
| `packages/shell/tool-pwsh-persistent/tests/loader-composition.spec.ts` | 5 | ? | Take upstream. |
| `packages/workflow/tool-ralph/tests/integration.spec.ts` | 4 | ? | Take upstream. |
| `examples/AGENTS.md` | 1 | ? | Upstream's only commit was `4125514a08` (retire). Take theirs; our `examples/app-builder/` doesn't use top-level AGENTS.md. |
| `examples/CLAUDE.md` | 1 | ? | Same. |
| `examples/package.json` | 5 | ? | Same. |
| `examples/README.md` | 3 | ? | Same. |
| `examples/README.zh.md` | 3 | ? | Same. |
| `examples/README.i18n.yaml` | 3 | ? | Same. |
| `.agents/notes/implemented/feature/2026-06-24-workspace-context.md` | 1 | ? | Take upstream (already updates `code-mode` → `ptc`). |

**Resolution principle**: take upstream for ALL 25; ours are either subsumed by upstream's or get regenerated by the 5 gates. Where we have unique additions (app-builder group, Project process, Why-no-symlink), re-record them in the same commit.

## 4. Path-prefix change: `examples/app-builder/` → `apps/cli/config/examples/app-builder/`

The user-approved relocation.

### 4.1 Files to move (under `examples/app-builder/`)

```
examples/app-builder/
├── README.i18n.yaml
├── README.md
├── README.zh.md
├── cordis.snapshot.yml
├── cordis.yml
├── package.json
└── tests/
    ├── e2e/keyless-smoke.spec.ts
    ├── e2e/with-key-smoke.spec.ts
    └── fixtures/keyless-driver.ts
    └── fixtures/keyless-mock-llm.ts
    └── profiles/dev/cordis.yml
```

Total: ~15 files (the directory contains 642 entries in our `examples/`; the rest is `examples/acp-agent/`).

### 4.2 Cross-references to update

| File | Change |
|---|---|
| `planning/Phase 1 prompt.md §6` | "`examples/app-builder/`" → "`apps/cli/config/examples/app-builder/`" |
| `planning/inspect/18-phase1-start-record.md` | Replace `examples/app-builder` row in the table |
| `packages/bundle/app-builder/cordis.patch.yml` | Verify no path refs; update if any |
| `packages/README.md` | Update example enumeration if present |
| `packages/README.zh.md` | Same |
| `apps/cli/config/examples/app-builder/cordis.yml` | Verify paths after move |
| `apps/cli/config/examples/app-builder/tests/fixtures/*` | Update any `examples/app-builder/` literal paths |

### 4.3 Snapshot re-record

The keyless smoke (`apps/cli/config/examples/app-builder/tests/e2e/keyless-smoke.spec.ts`) and with-key smoke need re-recording after the move. Self-skips without `DEEPSEEK_API_KEY`.

### 4.4 `verify-cordis-config` impact

The bundle list (`packages/bundle/app-builder/package.json` `dependencies` + `examples/package.json` per `verify-cordis-config`) needs verification at the new path. The new location is under `apps/cli/config/examples/app-builder/`; the `examples/package.json` no longer applies (upstream emptied `examples/`).

## 5. Adopting upstream's `apps/web/`

Upstream's `apps/web/` is at `cd5ef81481` with 183 files. Key entry points:

```
apps/web/
├── .npmignore
├── index.html
├── package.json            (@deepseek-ai/dsh-web-frontend)
├── public/                 (favicon, manifest)
├── src/                    (main.ts, vite-env.d.ts)
├── stress-tests/
└── tests/                  (e2e, snapshot-expected)
```

### 5.1 Slot injection contract (our plugins → upstream host)

Our shell plugins declare slots; upstream's host is expected to honor the existing slot system. Verification points:

- `app-builder-shell` (root slot): declared by `packages/client/ui-app-builder-shell`. Upstream's `apps/web` must declare this slot in the root layout.
- `app-builder.projects` (sidebar slot): declared by `packages/client/ui-app-builder-projects`. Upstream's `apps/web` must declare this in the sidebar.
- `app-builder.preview` (right pane slot): future, declared by `packages/client/ui-app-builder-preview` (not yet shipped).
- `app-builder.conversation` (center slot): future, declared by our re-skin work.

### 5.2 Changes required in upstream's `apps/web/`

If upstream's host does NOT already declare these slots, we add:

- `apps/web/index.html` title: identify the App Builder build (e.g., `DSH App Builder`).
- `apps/web/cordis.yml` (if present): mount the app-builder shell.
- `apps/web/src/main.ts`: optionally extend the slot declarations if upstream doesn't expose them.

### 5.3 Snapshot re-record

Web browser snapshots in `apps/web/tests/expected/*` need re-recording against upstream's host. Specifically:

- `app-builder-shell-host` snapshot (new — confirm slot hierarchy).
- Existing snapshots under `apps/web/tests/expected/` need re-validation.

## 6. Phase 2 accelerator cherry-picks

### 6.1 `xtr/projection-per-session-cache` (PR #2781, `53c8f64eed`)

Files affected in upstream: `packages/session/session-projection-cache/` (51 path entries).

After B2 merge, this package is in our tree. Integration steps:

1. Verify the package compiles (`pnpm run typecheck --filter @deepseek-ai/dsh-session-projection-cache`).
2. Add `@deepseek-ai/dsh-session-projection-cache` to `packages/app-builder/project/package.json` `peerDependencies`.
3. Wire the cache via `ctx.sessionProjectionCache.for('project')` in `packages/app-builder/project/src/index.ts`.
4. Snapshot test: `packages/app-builder/project/tests/projection-cache.spec.ts`.

### 6.2 `worktree-apire-*` cluster

PRs in chronological order:

| PR | Commit | Title |
|---|---|---|
| #2911 | `9f9f160854` | `client-session-conversation-chat` |
| #2968 | `5f7150b69f` | `client-tool-view-rendering` |
| #3082 | `a3c852b497` | `worktree-apire-a2` |
| #3083 | `5dba32bb48` | `worktree-apire-b` |
| #3085 | `e290fb1dc7` | `worktree-apire-c` |
| #3086 | `fc5224b389` | `worktree-apire-d2` |
| #3217 | `5ba36aa350` | `worktree-apire-remaining` |
| #3235 | `57aba7695b` | `worktree-apire-f` |
| #3148 | `ed6ac33a88` | `fix/websocket-heartbeat` |

After B2 merge, `packages/api/gateway/` and `packages/api/remotes/` are updated. Integration steps:

1. Scaffold `packages/app-builder/api/` (Typert Remote service) per Phase 2 prompt §3.
2. Implement 11 methods: `listProjects`, `createProject`, `getProject`, `deleteProject`, `startSession`, `sendMessage`, `getTranscript`, `forkSession`, `resumeSession`, `subscribeEvents` (SSE), `getPreview`, `deploy`, `getUsage`.
3. Mount via `@deepseek-ai/dsh-api-gateway` + `@deepseek-ai/dsh-api-remotes`.
4. Snapshot test: `api-list-projects` per Phase 2 prompt §7.

### 6.3 `feat/subagent-provider` (PR #2663, `f76a225a7d`)

Files affected: `packages/subagent/subagent/{package.json, src/child-agent.ts, tests/child-agent.spec.ts, tsconfig.json}`. After B2 merge, these are updated.

Our `721c1d6fe1 fix(subagent): route spawned children through the parent's live model selection` lives in `packages/subagent/...` (parent dir), not in the `subagent/` subpackage. Verify no conflict; if clobbered, re-apply.

## 7. Sub-phase sequencing (the stack)

```
1.5.7  docs/phase1.5-record           ─→  docs/PROJECT.md pin bump, planning updates
1.5.6  adopt/subagent-provider        ─→  feat(subagent-provider) integration
1.5.5  adopt/api-gateway-cluster      ─→  worktree-apire-* + api/ skeleton
1.5.4  adopt/projection-cache         ─→  xtr/projection-per-session-cache
1.5.3  apps-web-reskin-on-upstream    ─→  ui-app-builder-* on apps/web/
1.5.2  relocate/examples-app-builder  ─→  examples/app-builder/ → apps/cli/config/examples/app-builder/
1.5.1  merge/upstream-v0.1.2-alpha.1  ─→  B2 merge (1079 commits)
```

Native GitHub stacked PRs (per `AGENTS.md` "Choose PR history deliberately"): 1.5.1 is the base; each higher PR targets the one below. `gh stack sync` after each CI green.

## 8. Verification (per sub-phase)

```sh
pnpm run typecheck
pnpm run test:coverage
pnpm run test:snapshot
pnpm run doc-sync
pnpm run hygiene
```

All five must be green before the sub-phase PR is marked ready for review. CI owns the platform matrix.

## 9. Risks tracked

1. **`pnpm-lock.yaml` regeneration**: 141 upstream commits; our deps regenerate. If `pnpm install` fails, the B2 merge is blocked.
2. **`apps/web/` slot mismatch**: upstream's host may not declare `app-builder.*` slots. We add the declarations; risk: visual regressions.
3. **Snapshot fixture re-record**: web snapshots + keyless/with-key smokes need re-validation. Wall-clock ~9.4 s for the keyless smoke (per `inspect/18-phase1-start-record.md`).
4. **Subagent fix clobbered**: if B2 merge's auto-resolution drops our `721c1d6fe1` fix. Mitigation: re-apply explicitly in sub-phase 1.5.6.
5. **`verify-cordis-config` regression**: the bundle's `dependencies` list must satisfy the verifier at the new example location.

## 10. Agent Notes planned

One Agent Note triplet (en + zh + i18n.yaml) per non-trivial sub-phase:

- `merge-upstream-v0.1.2-alpha.1` (B2 merge).
- `examples-relocation` (move).
- `app-builder-shell-on-upstream-web` (web reskin).
- `projection-cache-integration` (Phase 2 accelerator 1).
- `api-gateway-cluster` (Phase 2 accelerator 2).
- `subagent-provider` (Phase 2 accelerator 3).
- `phase-1.5-upstream-sync-record` (planning artifacts).

## 11. Cross-references

- `planning/Phase 1.5 prompt.md` — task brief.
- `planning/Phase 1 prompt.md` — Phase 1 (predecessor).
- `planning/Phase 2 prompt.md` — Phase 2 (successor; updates after 1.5.7).
- `planning/plan.md` — master plan (updated in 1.5.7).
- `planning/inspect/SUMMARY.md` — executive view (updated in 1.5.7).
- `docs/PROJECT.md` — canonical project status (updated in 1.5.7).
