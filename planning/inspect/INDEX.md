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

## Conventions

- Each file ends with a 'Plan mismatches identified (carried to Step 14)' section (steps 1-14).
- Step 14 is the consolidated gap analysis; it cross-references all earlier steps.
- Step 15 (SUMMARY.md) is the executive view.
- Step 16 (15-phase0-pre-existing-failures.md) is the post-Phase-0 follow-up action plan (path B).
- Step 17 (16-plan-fix-report.md) records the plan rewrite that brought `planning/` in line with dsh reality.
- Step 18 (17-phase0-acceptance-results.md) records Phase 0 acceptance: which gates passed, which fixes landed in `519da740a2`, and which failures are deferred.
- Quotes from source files are verbatim with line numbers where possible.
