# Step 1 — Repo overview

> Captured during initial inspection. Status: COMPLETE. Phase alignment: this maps to Phase 0 "set up the repo" step.

## What I read

- package.json (root manifest)
- pnpm-workspace.yaml (workspace layout + dep policy)
- tsconfig.base.json and tsconfig.json (build layout)
- Listed apps/, packages/, examples/, native/, vendor/, website/, scripts/, python/

## Repo at a glance

| Fact | Value |
|---|---|
| Repo name | @deepseek-ai/dsh-root |
| Version | 0.1.1-rc.2 |
| License | MIT |
| Package manager | pnpm@11.7.0 |
| Engines | Node ^22.19.0 || >=24.0.0 |
| Module system | ESM (type: module) |
| Build stack | TypeScript 6, tsdown (bundler), vitest, oxlint, lefthook |
| Strictness | strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes, noImplicitOverride |

## Workspace layout (real)

```
vendor/*                        pinned Cordis + cosmokit + schemastery
packages/*/*                    all dsh packages, grouped by capability
native/landlock-run             C++ addon for Landlock sandboxing
native/landlock-run/packages/*  node-addon entry
apps/*                          product assemblies (cli, web)
website                         VitePress docs site
examples                        single composite package (dep resolution only, not build target)
python/sdk-runtime              Python SDK deploy root
scripts/                        gates, generators, dev helpers
```

The examples entry is dependency-resolution only. tsdown globs explicitly exclude it.

## Existing apps

- apps/cli — owns the dsh bin. Runs source via node --import tsx/esm apps/cli/src/bin.ts
- apps/web — Vite-built shell (the GUI we are sitting in right now)

**The plan calls for apps/control-plane and apps/worker. Neither exists.** dsh itself already ships apps/cli (a generic coding-agent CLI) and apps/web (the GUI we are in). The plan's control-plane + worker naming overlaps this — we need to decide whether to RENAME dsh's apps/web into our control plane, or ADD new apps/control-plane and apps/worker alongside.

## Existing packages (about 52 packages, capability-grouped)

Groups include (verified via Get-ChildItem packages):

acp, api, attachment, boot, bundle, client, code-runtime, compaction, context, core, credentials, e2b, examples, experimental, extensions, feedback, fs, goal, guard, hooks, host, identity, interaction, jobs, llm, lsp, mcp, plan, preset, runtime-diagnostics, sandbox, schedule, sdk, session, session-query, settings, shell, skill, spill, storage, subagent, subprocess, terminal, test-support, todo, typert, util, web, workflow, workspace

**The plan's packages/plugins does not exist as a top-level folder.** dsh is plugin-based via Cordis — every group IS a plugin namespace. New App Builder plugins would land under existing groups (e.g., packages/bundle/, packages/examples/, or new groups under packages/).

## Vendored dependencies

Cordis (the framework), cosmokit, and schemastery are vendored under vendor/, not pulled from npm. Rescoped to @deepseek-ai/.... pnpm-workspace.yaml overrides rewrites @deepseek-ai/cosmokit and @deepseek-ai/schemastery to local link: paths so the build resolves them to vendored sources.

linkWorkspacePackages: true is set.

## Native addon

@deepseek-ai/node-addon-landlock-run lives at native/landlock-run/packages/entry and is referenced via tsconfig.base.json paths. This is the actual Landlock sandbox implementation — **Phase 3's Landlock/bwrap sandbox requirement is partially fulfilled by an existing native module**. The plan treats Landlock as future work; the repo already has the addon.

## Build / test commands that exist

- pnpm run build — full build via scripts/build.ts
- pnpm run build:lib:host / build:lib:client — two faces (host = Node, client = browser)
- pnpm run typecheck — tsc -b tsconfig.client.json after host build
- pnpm run test — vitest run (unit)
- pnpm run test:coverage — CI gate (per-file 100% in packages/*/*/src)
- pnpm run test:e2e — real-API e2e (self-skips without DEEPSEEK_API_KEY)
- pnpm run test:snapshot / test:snapshot:record — keyless ACP/headless replay
- pnpm run test:web — built-mode browser snapshots
- pnpm dsh --profile <name> "<task>" — runs one task from source via apps/cli
- pnpm run demo:cordis — agent modifies its own runtime (needs key)
- pnpm run demo:acp — ACP automation server (needs key)
- pnpm run hygiene — knip + publint + workspace constraints + NodeNext consumer check
- pnpm run doc-sync — all documentation gates

**The plan's Phase 0 step "scaffold the monorepo" assumes a fresh empty repo. It is not empty.** We must redefine scaffold — what we actually do in Phase 0 is ADD new app and plugin packages alongside the existing ones, not create the monorepo.

## Existing gates (from scripts/)

These scripts already exist and many are mechanically enforced:

- verify-cordis-config — raw/Web cordis.yml bare plugins must appear in resolver manifest's dependencies
- verify-export-jsdoc — JSDoc coverage on every export
- verify-package-invariants — package-level invariants
- verify-built-package-invariants — built lib/ invariants
- verify-md-links, verify-md-wrap, verify-doc-refs — doc hygiene
- verify-package-paths, verify-dsh-package-licenses — package layout
- verify-doc-budgets, verify-doc-site-fragments — website gating
- verify-runtime-closure — bundle closure
- verify-client-packages — browser-side closure
- verify-vendored-links — vendored dep linkage
- verify-cordis-catalog, verify-client-catalog, verify-tool-catalog, verify-config-catalog, verify-persistence-catalog, verify-doc-graphs, verify-module-graph, verify-scoped-events — generated catalog checkers

**Implication for the plan:** the plan does not mention these gates. Any new plugin or app must satisfy them or pnpm run hygiene will fail. New work MUST include catalog generators/checkers.

## pnpm policy highlights

- linkWorkspacePackages: true
- strictDepBuilds is implicitly true; only esbuild, lefthook, node-pty, koffi, and @deepseek-ai/dsh-subprocess-local@file:... are allowed to run install scripts. Everything else (e.g., @google/genai, protobufjs) is explicitly denied.
- peerDependencyRules.allowVersions.typescript: '>=5 <7' — TS 6 already available
- One patched dep: node-pty@1.2.0-beta.15 for the persistent PTY backend

## Plan gap / mismatch summary (carried into Step 14)

1. **Phase 0 "scaffold monorepo" wording is wrong.** Repo is not empty; apps/{cli,web} and ~52 packages exist.
2. **Plan does not name apps/control-plane vs apps/web** — these are different concepts and we need to choose one.
3. **Plan does not name packages/plugins vs the existing package groups** — new plugin packages will go under existing groups; we should not introduce a parallel namespace.
4. **Plan calls Landlock Phase 3 work; the native addon already exists** — Phase 3 needs to bind it, not invent it.
5. **Plan omits the catalog generators, the host/client face split, the verification gates** — these shape every change.
6. **Plan assumes fresh TypeScript monorepo**; reality is a Cordis-plugin monorepo with vendored Cordis, two TS faces, and ~25 mechanical verifiers.
7. **Plan assumes Postgres for the control-plane index**; dsh has SQLite + packages/storage. Postgres may not be the right choice — investigate in Step 7/12.
8. **Plan mentions npx @deepseek-ai/dsh web as Phase 0 install.** The repo IS dsh — there is no upstream package; we would publish one (pnpm publish) or run from source via pnpm dsh web. The Phase 0 step needs reframing.

## What to inspect next

- Step 2: apps/ — what dsh's existing apps already do (chat UI, project list, session list?)
- Step 3: core packages — agent, agent-loop, session, tools
- Step 4: capabilities (shell, subprocess, fs, web, skill, sandbox)
- Step 5: orchestration (workflow, preset, hooks)
- Step 6: interface surfaces (acp, sdk, hooks)
- Step 7: session/event durability
- Step 8: permission / ToolPolicy story
- Step 9: Landlock addon
- Step 10: web capability (search/fetch)
- Step 11: skill catalog
- Step 12: build/test/hygiene coverage
- Step 13: examples/ — what App-Builder-shaped bundles already exist
- Step 14: gap analysis
- Step 15: consolidated SUMMARY.md
