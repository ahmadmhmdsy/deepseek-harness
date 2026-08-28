# Step 2 — apps/ (existing dsh product apps)

> Status: COMPLETE. Phase alignment: Phase 0 install step + Phase 1 control-plane framing.

## What exists today

Two apps live under apps/, both published under @deepseek-ai/: apps/cli and apps/web. Both are products of this repo, not the upstream npm package we would 'install'.

### apps/cli — @deepseek-ai/dsh

- Owns the `dsh` bin (lib/bin.js after build; src/bin.ts in dev).
- Source entry is apps/cli/src/bin.ts which dispatches per mode via dynamic imports:
  - profile (the default; loads profile-boot.ts)
  - plugin (forwards to pnpm in profile dir)
  - dump-config / dump-default-config (composes the patch tree and prints it)
- Hardcoded alias: dsh web == dsh --profile web.
- Parses only its own flags; everything after is forwarded to the booted profile (the cordis runtime parses them via dsh-cmdline).
- Pulls in ~50 workspace deps (full agent, LLM, fs, sandbox, skill, session, subagent, workflow, jobs, terminal, todo, web, etc.).

### apps/web — @deepseek-ai/dsh-web-frontend

- Vite-built React SPA. ~10 LOC of source (apps/web/src/main.ts).
- Just instantiates dsh-client-web shell library with the #root element.
- Built output is served by dsh web through dsh-host-frontend-static.
- Hardcoded title: 'DSH Local Build'.

## Bundle architecture (not apps, but adjacent and critical)

Three bundles ship under packages/bundle/:

| Bundle | What it adds over base |
|---|---|
| packages/bundle/base | Every profile starts here: timer, hmr, llm, session, typert, agent, jobs, llm-retry, settings, credentials, subprocess, sandbox, shell, fs, skill, plan, subagent, workflow, web, etc. (full plugin list captured in apps/cli/composition.md and Step 3). |
| packages/bundle/web-app | Web host rows (webserver, apiproxy, frontend-static), the always-on client-hmr reload chain, web-runtime glue plugin (openBrowser, printUrl, surfaceContext, trustedHosts), dsh-web-frontend dist resolution, harness-source + app:web-surface prompt sections. |
| packages/bundle/headless | CLI/coding agent variant: same base + headless command-line surface; no webserver. |

## What this means for the plan

1. **There is no separate control-plane app.** apps/web IS the web surface. The plan's apps/control-plane would either be (a) a renamed/rebranded apps/web, (b) a NEW app that hosts apps/web as a dependency, or (c) a confusion of concepts. apps/web already does chat, project list, session list, and is built over the same client UI packages an App Builder control plane would want.

2. **There is no apps/worker as a separate app.** The 'worker' concept in dsh is split across three meanings: (a) the LLM call (llm-deepseek, llm-pi-ai providers in @deepseek-ai/dsh-llm), (b) the in-process agent subprocess (@deepseek-ai/dsh-subagent), and (c) the worker-thread workflow (@deepseek-ai/dsh-workflow-worker-thread). None of these are apps/; they are library packages.

3. **The plan's apps/control-plane + apps/worker split is wrong.** dsh's mental model is one app (cli or web) that hosts an in-process Cordis runtime containing all services. Multi-tenancy would scale that one runtime per project (each project = one dsh session), not add a new apps/worker.

4. **The bundle architecture already implements 'what runs together'.** New App Builder plugins would ship as a new bundle (e.g. packages/bundle/app-builder or packages/bundle/control-plane) that patches over dsh-base. Profiles stack bundles.

5. **apps/cli/config/agent-presets/ exists** — agent presets are bundled with the CLI, not in a separate 'control plane' repo. The plan's project/session model maps onto dsh's existing session model (each project = one session, with metadata for the project itself attached).

6. **The web app is purely a thin shell.** All UX lives in packages/client/* — the shell library, UI slots, conversation, tool, sidebar, layout, plan, goal, subagent, jobs, settings, theme, etc. An App Builder control plane would re-use most of these (chat, plan, subagent, todo) and add a project-list pane + a preview iframe pane.

## Suggested App Builder reshape (preview only — needs user input)

| Plan term | dsh equivalent | Action |
|---|---|---|
| apps/control-plane | apps/web (existing) + a new packages/bundle/app-builder | Re-skin/rebundle apps/web; do not create a parallel apps/ dir. |
| apps/worker | packages/bundle/app-builder's worker plugins + dsh-subagent + dsh-workflow + dsh-llm-* | No new apps/ entry. |
| packages/plugins | packages/bundle/app-builder, packages/bundle/app-builder-headless, packages/bundle/app-builder-control-plane, plus concrete plugins under packages/* | Re-use existing groups; create new bundles. |

## Concrete evidence captured

- apps/cli/package.json: name @deepseek-ai/dsh, version 0.1.1-rc.2 (same as root).
- apps/web/package.json: name @deepseek-ai/dsh-web-frontend.
- apps/cli/composition.md: full list of plugins in dsh-base bundle.
- apps/cli/src/bin.ts: dispatch logic.
- apps/web/src/main.ts: 5 LOC that boots dsh-client-web.
- packages/bundle/{base,web-app,headless}/cordis.patch.yml: three bundles.

## Plan mismatches identified (carried to Step 14)

- Plan wants 'apps/control-plane'; reality: apps/web is the web surface, no new dir needed.
- Plan wants 'apps/worker'; reality: worker concepts live in libraries.
- Plan wants 'packages/plugins' as a sibling to packages/; reality: bundles and groups under packages/ are the plugin surface.
- Plan assumes we 'install dsh' then 'scaffold our app next to it'. We are dsh. We do not install ourselves.
