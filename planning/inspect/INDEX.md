# Inspection index

> Each file is a focused inspection step with sources, evidence, and plan mismatches. Read in order for a full picture; jump to a step for a specific topic.

## Files

1. [01-repo-overview.md](01-repo-overview.md) — Repo at a glance
2. [02-apps.md](02-apps.md) — apps/ (existing dsh product apps)
3. [03-core-packages.md](03-core-packages.md) — Core packages (session, agent, tools, subagent, llm)
4. [04-capabilities.md](04-capabilities.md) — Capability packages (shell, subprocess, fs, web, skill, sandbox, terminal, lsp)
5. [05-orchestration.md](05-orchestration.md) — Orchestration (workflow, preset, hooks, self-modification)
6. [06-interfaces.md](06-interfaces.md) — Interface surfaces (acp, sdk, api, hooks)
7. [07-session-event-system.md](07-session-event-system.md) — Session/Event system durability, projection, replay
8. [08-tool-policy.md](08-tool-policy.md) — ToolPolicy / permission model
9. [09-sandbox.md](09-sandbox.md) — Sandbox: Landlock / bwrap / Seatbelt / Windows ACL
10. [10-web.md](10-web.md) — Web capabilities: search/fetch providers (with redirect audit)
11. [11-skills.md](11-skills.md) — Skill system: catalog, loader, registry
12. [12-build-test-hygiene.md](12-build-test-hygiene.md) — Build, test, hygiene, and CI gates
13. [13-examples.md](13-examples.md) — examples/: existing runnable bundles
14. [14-gap-analysis.md](14-gap-analysis.md) — Gap analysis: plan vs. reality
15. [SUMMARY.md](SUMMARY.md) — Consolidated executive summary
16. [15-phase0-pre-existing-failures.md](15-phase0-pre-existing-failures.md) — Path B action plan: vendor-rescope drift + 9 Windows thread-safe tests + two Phase 0 prompt gaps, with actionable fix steps and verification commands
17. [16-plan-fix-report.md](16-plan-fix-report.md) — Plan-rewrite record: what changed between the original `planning/{PROJECT,mission,goal,plan,Phase 0..3 prompt}.md` and the dsh-reality-aligned versions, and what was deliberately kept as-is
18. [17-phase0-acceptance-results.md](17-phase0-acceptance-results.md) — Phase 0 acceptance evidence (commit `519da740a2`): per-task outcomes, gate pass/fail, residual failures (8 in 3 files, all out-of-scope environmental or known intermittent), git state, deferred work
19. [18-phase1-start-record.md](18-phase1-start-record.md) — Phase 1 kickoff log on `app-builder-web-reskin`: per-package status, decisions, residual failures as the App Builder MVP lands

20. [21-app-builder-web-shell.md](21-app-builder-web-shell.md) - App Builder web reskin plan: 3-pane shell (projects | chat | preview), server-state bridge via file snapshot, slot composition contract, test plan, and git sequence for `app-builder-web-reskin`
21. [19-upstream-v0.1.2-alpha.1-adoption-plan.md](19-upstream-v0.1.2-alpha.1-adoption-plan.md) — Phase 1.5 detailed plan: B2 merge of upstream's 1079 commits past `b150a551b8`, the 25 shared-path conflict map, the `examples/app-builder/` → `apps/cli/config/examples/app-builder/` relocation, the `apps/web/` reskin onto upstream's rebuilt host, the three Phase 2 accelerators (`xtr/projection-per-session-cache`, `worktree-apire-*` cluster, `feat/subagent-provider`), the native GitHub stacked-PR sequence, and the verification gates per sub-phase
22. [22-merge-upstream-v0.1.2-alpha.1.md](22-merge-upstream-v0.1.2-alpha.1.md) — 1.5.1 record: `f7386f0f97` merge of upstream's `v0.1.2-alpha.1` (1079 commits past `b150a551b8`); 25 shared-path conflict map, regenerated `pnpm-lock.yaml`, gate evidence
23. [23-examples-relocation.md](23-examples-relocation.md) — 1.5.2 record: `examples/app-builder/` → `apps/cli/config/examples/app-builder/` (commit `58ad73791e`); snapshot re-record, reference updates
24. [24-apps-web-reskin.md](24-apps-web-reskin.md) — 1.5.3 record: re-skin App Builder 3-pane shell on upstream's rebuilt `apps/web/` (commit `098f7cad1c`)
25. [25-projection-cache-integration.md](25-projection-cache-integration.md) — 1.5.4 record: adopt `xtr/projection-per-session-cache` (PR #2781) into `packages/app-builder/project/` (commit `8a28421e02`)
26. [26-api-gateway-cluster.md](26-api-gateway-cluster.md) — 1.5.5 record: cherry-pick `worktree-apire-*` cluster (PRs #2911, #2968, #3082, #3083, #3085, #3086, #3217, #3235 + #3148); scaffold `packages/app-builder/api/` with 13 Typert Remote methods (commit `8994998859`)
27. [27-subagent-provider.md](27-subagent-provider.md) — 1.5.6 record: adopt upstream `subagent` provider (PR #2663, `f76a225a7d`) + re-apply our `721c1d6fe1` fork fix (commit `1bc7a6b9f7`)
28. [28-phase-1.5-upstream-sync-record.md](28-phase-1.5-upstream-sync-record.md) — 1.5.7 record: planning artifacts update + 1.5.5-introduced cordis-catalog regression fixes (unique symbol + unknown + JSDoc completeness on Cordis events + type-link exemptions + SERVICE_PAGE/EVENT_SCOPE_PAGE entries + subsystems page + i18n.yaml sidecars + gen-doc-graphs SERVICE_ROLES + gen-config-catalog `as const` unwrap); `pnpm run doc-sync` 25 PASS / 7 FAIL (in-scope gates PASS); §9 backlog documented
36. [29-phase-2-productize-control-plane-record.md](29-phase-2-productize-control-plane-record.md) — Phase 2 record: 2.0 plan-only commit on `docs/phase2-record` branched from `origin/docs/phase1.5-record` (`26bf01ba4a`); sub-phase breakdown 2.1 Deployment → 2.2 ToolPolicy → 2.3 API completion → 2.4 Projection unit + UI → 2.5 UI + EventSource → 2.6 closure docs; English-only documentation policy preserved
37. [30-phase-2-deployment-package.md](30-phase-2-deployment-package.md) — 2.1 record: new `packages/app-builder/deployment/` Cordis plugin (Deployment entity + deploy tool + SAST/SCA/secrets gates + approval + events); wires the `deploy` Typert Remote placeholder; snapshot scenarios `deploy-local` + `deploy-blocked-by-gates`; Agent Note `deployment-pipeline`
38. [31-phase-2-tool-policy-manifest.md](31-phase-2-tool-policy-manifest.md) — 2.2 record: new `packages/app-builder/tool-policy/` (typed `ToolPolicy` schema + `tools/pre-execute` listener + `toolPolicy/decision` audit event); falls back to `ctx.permissionPresets.current(events)`; snapshot scenarios `tool-policy-allow` + `tool-policy-deny`; Agent Note `tool-policy-typed-schema`
39. [32-phase-2-api-completion.md](32-phase-2-api-completion.md) — 2.3 record: `getUsage` Typert Remote wired to `@deepseek-ai/dsh-token-meter` (cache-aware metrics); `deploy` comes from 2.1; snapshot scenario `api-list-projects`; Agent Note `control-plane-api`
40. [33-phase-2-projection-ui.md](33-phase-2-projection-ui.md) — 2.4 record: 1.5.4 projection unit verification + `apps/web` project list pane consuming the unit
41. [34-phase-2-ui-eventsource.md](34-phase-2-ui-eventsource.md) — 2.5 record: `apps/web` deployment status pane + EventSource preview iframe; `packages/bundle/app-builder/cordis.patch.yml` updated to mount `deployment` + `tool-policy`
42. [35-phase-2-closure-record.md](35-phase-2-closure-record.md) — 2.6 record: Phase 2 closure Agent Note + planning artifacts final state on `docs/phase2-record`
## Conventions

- Each file ends with a 'Plan mismatches identified (carried to Step 14)' section (steps 1-14).
- Step 14 is the consolidated gap analysis; it cross-references all earlier steps.
- Step 15 (SUMMARY.md) is the executive view.
- Step 16 (15-phase0-pre-existing-failures.md) is the post-Phase-0 follow-up action plan (path B).
- Step 17 (16-plan-fix-report.md) records the plan rewrite that brought `planning/` in line with dsh reality.
- Step 18 (17-phase0-acceptance-results.md) records Phase 0 acceptance: which gates passed, which fixes landed in `519da740a2`, and which failures are deferred.
- Step 19 (18-phase1-start-record.md) is the Phase 1 kickoff log on `app-builder-web-reskin`; updated continuously as packages, bundle, example, web reskin, snapshots, and Agent Notes land.
- Step 20 (21-app-builder-web-shell.md) is the Phase 1 web reskin plan: 3-pane ui-app-builder-shell, the AppBuilderSnapshot server bridge, the slot take-over chain, the test plan, and the git sequence.
- Steps 22-28 are the Phase 1.5 sub-phase records (1.5.1-1.5.7), one per native GitHub stacked PR. The Phase 1.5 Agent Note (`.agents/notes/implemented/process/2026-09-01-phase-1.5-upstream-sync-record.md`) cross-references these and adds the §9 backlog of pre-existing doc-sync gate failures that the 1.5.7 docs-only commit leaves documented but unfixed.
- Steps 29-35 are the Phase 2 sub-phase records (2.0 plan-only + 2.1–2.5 code + 2.6 closure docs). The Phase 2 Agent Note (`.agents/notes/implemented/process/2026-08-31-phase-2-productize-control-plane-record.md`) cross-references these and inherits the §9 backlog from Phase 1.5.
- Quotes from source files are verbatim with line numbers where possible.
