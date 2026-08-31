# App Builder packages

English | [中文](README.zh.md)

The App Builder MVP: a prompt-to-running-app surface on top of DeepSeek Harness. A user types a prompt; the App Builder agent scaffolds a project, installs its dependencies, starts its dev server, and exposes the preview URL to the chat pane. Phase 1 (revised) targets a local, single-user loop with no auth.

## Packages

| Package | Role |
|---|---|
| [`project/`](project/) | Project entity + projection unit; wires sessions under a project root |
| [`scaffold/`](scaffold/) | Composes filesystem + bash + str-replace-editor tools to scaffold a template project (nextjs-app, nextjs-pages, svelte-spa) |
| [`preview/`](preview/) | Composes bash + jobs to start a project dev server with readiness polling; localhost-only |
| [`persona/`](persona/) | App Builder coding persona over `@deepseek-ai/dsh-persona` |
| [`snapshot-bridge/`](snapshot-bridge/) | In-memory `{ projects, devServers }` projection served at `/__dsh/app-builder/snapshot.json`; the browser projects pane polls this |
| [`api/`](api/) | Host BFF Typert Remote service: 13 methods (project CRUD, session lifecycle, SSE event subscription, preview, deploy, usage) auto-discovered by `@deepseek-ai/dsh-api-gateway` |

## Bundle

The App Builder bundle lives at [`packages/bundle/app-builder/`](../../bundle/app-builder/) and patches over [`packages/bundle/base`](../../bundle/base/). It does not introduce a new HTTP layer or a parallel `apps/app-builder-web`; the Web GUI is re-skinned on the existing `apps/web` branch `app-builder-web-reskin`.

## Reference

- [`docs/subsystems/app-builder.md`](../../docs/subsystems/app-builder.md) - Subsystem reference (Cordis API + service contracts)
- [`planning/Phase 1 prompt.md`](../../../planning/Phase%201%20prompt.md) - Phase 1 task brief
- [`planning/plan.md`](../../../planning/plan.md) - App Builder MVP section (Phase 1)
- [`planning/inspect/18-phase1-start-record.md`](../../../planning/inspect/18-phase1-start-record.md) - Phase 1 kickoff log
