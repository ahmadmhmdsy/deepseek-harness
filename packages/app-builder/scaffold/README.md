# @deepseek-ai/dsh-app-builder-scaffold

English | [中文](README.zh.md)

The **App Builder scaffold tool**: one model-facing tool that creates a fresh project from a static template (`nextjs-app`, `nextjs-pages`, `svelte-spa`) under the session's sandbox-policy workspace root, then optionally starts `npm install` as a background job.

## API

| Symbol | Kind | Notes |
|---|---|---|
| `apply(ctx, config)` | function plugin | registers the `app_builder_scaffold` tool and a `tool:app-builder-scaffold` system-prompt section |
| `Config` | schemastery schema | `{ defaultTemplate, defaultNpmInstall }` with documented defaults |
| `name` | `string` | Cordis plugin name (`app-builder-scaffold`) |
| `inject` | readonly tuple | `['tools', 'fs', 'shell', 'systemPrompt', 'sandboxPolicy', 'agent']`; `ctx.jobs` is read via `ctx.get()` because it is optional (only required when `npmInstall !== false`) |
| `ScaffoldTemplate`, `ScaffoldTemplateDefinition`, `ScaffoldFile`, `ScaffoldToolArgs`, `ScaffoldResult` | types | re-exported from `./types.ts` |

### Inputs

`app_builder_scaffold({ template, name, stack?, features?, cwd?, npmInstall? })`:

| Field | Type | Notes |
|---|---|---|
| `template` | enum | one of `nextjs-app`, `nextjs-pages`, `svelte-spa` |
| `name` | string | project directory name; no path separators, no `.`/`..`, no control chars |
| `stack` | string | free-form stack hint recorded for project metadata |
| `features` | string[] | free-form feature catalog recorded for project metadata |
| `cwd` | string | optional explicit project root; must remain inside the sandbox policy workspace root |
| `npmInstall` | boolean | run `npm install` as a background job after writing files (default `Config.defaultNpmInstall`) |

### Output

`{ rootPath, template, files: string[], installJobId?: string }` — the `installJobId` is the `ctx.jobs.start` job id when `npmInstall !== false`. Read progress with `job_output`; stop with `job_kill`.

### Containment

The tool resolves the project root through `ctx.sandboxPolicy.resolve({ session })` and rejects any `cwd` whose canonical form escapes the policy `workspaceRoot`. Template paths are validated against `..` / `.` segments before each write. File writes go through `ctx.fs.writeText`, which carries the sandbox policy to the backend.

## Composition

- `ctx.fs` — `resolve`, `stat`, `writeText`, `contains`. Each template file writes through the same seam the model-facing `write` and `edit` tools use.
- `ctx.shell` — `resolve` + `start`. The optional background `npm install` runs as a `ctx.jobs.start` producer; cancellation and output reading are owned by the jobs runtime.
- `ctx.jobs` — `start({ kind, label, owner?, run })`. Required only when `npmInstall !== false`.
- `ctx.systemPrompt` — registers the `tool:app-builder-scaffold` guidance section at order 110 (between `tool:bash` order 105 and product sections).
- `ctx.sandboxPolicy` — `resolve({ session })` provides the workspace root and the per-call mode the tool propagates to filesystem and shell.

The scaffold tool does NOT re-implement file writes, process execution, or background-job ownership; it sequences capability calls and validates model-supplied paths.

## Templates

Templates live in `src/templates.ts` as a `Readonly<Record<ScaffoldTemplate, ScaffoldTemplateDefinition>>`. Each definition lists the files the tool writes verbatim (no template engine, no variable substitution) plus the `installCommand` and `devCommand` arrays the scaffold and preview tools use.

| Template | Stack | Files written |
|---|---|---|
| `nextjs-app` | Next.js App Router | `package.json`, `tsconfig.json`, `next.config.js`, `app/layout.tsx`, `app/page.tsx` |
| `nextjs-pages` | Next.js Pages Router | `package.json`, `tsconfig.json`, `next.config.js`, `pages/_app.tsx`, `pages/index.tsx` |
| `svelte-spa` | Svelte 5 + Vite | `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `src/app.css`, `src/App.svelte` |

Templates pin `latest` for every dependency so a fresh `npm install` always produces a working build. The Agent Note `scaffold-plugin` records the decision to defer templating (string interpolation, conditional files) until a Phase 2 consumer asks for it.

## Model Experience

The tool description is one paragraph that lists the three templates, the workspace-root confinement, and the `installJobId` return field. The system-prompt section tells the model to call `app_builder_scaffold` once per new project and to use `write` / `str_replace_editor` for subsequent edits, and to start the dev server through the preview tool (not `bash`).

Token cost per call: the tool schema is six fields (`template`, `name`, `stack`, `features`, `cwd`, `npmInstall`) with `template` and `name` required; `features` is a string array. The output schema is four fields with `files` being the model-visible list of written paths.

KV-cache stability: the tool description and parameters are static across calls; `defaultNpmInstall` enters the description as a literal default, so a deployment that flips the default re-pins the description verbatim.

## Events

The scaffold tool emits no events of its own. The model-visible durability is provided by `fs/observed` (one per write) and `job/done` (one per install). The Agent Note `scaffold-plugin` documents the deferred `scaffold/completed` event.

## Known Limitations and Deferred Work

- The tool refuses to scaffold into an existing directory; the App Builder projection unit (Phase 2) is the surface that surfaces the conflict and prompts the model for a fresh name.
- `stack` and `features` are recorded verbatim but do not currently branch the templates; templating (per-stack dependency pins, conditional files) is deferred to a Phase 2 consumer.
- The optional `npm install` runs `npm install --no-audit --no-fund` style output is not parsed; failures surface through `job_output` rather than the tool return value.
- No `scaffold/completed` session-log event; Phase 2 adds one so the projection unit can correlate completed scaffolds with project registry records.
- The tool requires `ctx.jobs` only when `npmInstall !== false`; the loader does not enforce the relationship, so a deployment that always passes `npmInstall: false` runs without `dsh-jobs` mounted.
