# @deepseek-ai/dsh-app-builder-preview

English | [中文](README.zh.md)

The **App Builder preview tool**: one model-facing tool that starts a project dev server in the background, polls HTTP readiness on localhost, and returns the preview URL plus a job id the App Builder UI binds to its iframe pane.

## API

| Symbol | Kind | Notes |
|---|---|---|
| `apply(ctx, config)` | function plugin | registers the `app_builder_preview` tool and a `tool:app-builder-preview` system-prompt section |
| `Config` | schemastery schema | `{ defaultReadyTimeoutMs, defaultPollIntervalMs, frameworkOverride }` with documented defaults |
| `name` | `string` | Cordis plugin name (`app-builder-preview`) |
| `inject` | readonly tuple | `['tools', 'fs', 'shell', 'systemPrompt', 'sandboxPolicy', 'agent']`; `ctx.jobs` is read via `ctx.get()` because it is optional |
| `PreviewFramework`, `PreviewResult`, `PreviewToolArgs`, `ReadinessProbe`, `ReadinessAttempt`, `ReadinessResult` | types | re-exported from `./types.ts` and `./readiness.ts` |
| `detectFramework`, `buildDevCommand`, `pickFreePort` | helpers | unit-tested surface |

### Inputs

`app_builder_preview({ rootPath?, port?, framework?, readyTimeoutMs?, pollIntervalMs? })`:

| Field | Type | Notes |
|---|---|---|
| `rootPath` | string | project root path; default is the session workspace cwd. Must remain inside the sandbox policy workspace root. |
| `port` | integer | explicit TCP port to bind in 1..65535; default picks a free ephemeral port on 127.0.0.1 |
| `framework` | enum | framework override (`next` / `vite` / `unknown`); default auto-detects from `package.json` |
| `readyTimeoutMs` | number | poll timeout in ms (default 30000, capped at 600000) |
| `pollIntervalMs` | number | poll interval in ms (default 250, clamped to 1..5000) |

### Output

`{ jobId, framework, host: '127.0.0.1', port, url, polls, readyMs }` — `jobId` is the `ctx.jobs.start` job id; `url` is `http://127.0.0.1:<port>/`. Read server output with `job_output`; stop with `job_kill`.

### Localhost-only bind

The free-port probe and the readiness poll both target `127.0.0.1`. The dev server never binds a public or LAN interface; off-loopback access requires a downstream reverse proxy. The framework detection reads the project `package.json` through `ctx.fs.readText` and never executes it.

## Composition

- `ctx.fs` — `resolve`, `readText`. Used to read the project `package.json` for framework detection.
- `ctx.shell` — `resolve` + `start`. The dev server runs as a `ctx.jobs.start` producer wrapping `shell.start`; cancellation and output reading are owned by the jobs runtime.
- `ctx.jobs` — `start({ kind, label, owner?, run })` and `kill(id, caller?, reason?)` on readiness timeout. Required because the dev server is a long-running background producer.
- `ctx.systemPrompt` — registers the `tool:app-builder-preview` guidance section at order 111 (after the scaffold tool section).
- `ctx.sandboxPolicy` — `resolve({ session })` provides the workspace root the tool refuses to escape.

The preview tool does NOT re-implement process execution, port allocation, or HTTP polling at the capability level; it sequences capability calls and validates model-supplied inputs.

## Readiness probe

`./readiness.ts` exposes `awaitReadiness({ host, port, path?, timeoutMs, pollIntervalMs, signal })`. Each attempt runs inside its own per-call `AbortController` so a hung socket cannot consume the entire wall-clock budget at once; the helper returns `{ ready: false, polls, readyMs }` when the budget elapses, throws when the outer signal aborts.

## Framework detection

`detectFramework({ scripts, dependencies, devDependencies })` picks `next` when the dev script mentions `next` or `next` is a dependency, `vite` similarly, and falls back to `unknown`. `buildDevCommand` then maps the choice to the right port flag: `npm exec -- next dev -p <port>` (next) or `npm exec -- vite --port <port>` (vite). The `unknown` branch runs `npm run dev` verbatim and surfaces `PORT` to the script through the shell environment.

## Model Experience

The tool description is one paragraph: starts a project dev server in the background, returns the preview URL plus a job id, polls `http://127.0.0.1:<port>/` until the server answers (default 30 s budget), detects the framework from `package.json` (next / vite / unknown), and binds to localhost only. The system-prompt section tells the model to use the preview tool instead of `bash` for dev-server work and to use `job_output` / `job_kill` to monitor and stop it.

Token cost per call: the tool schema is five fields (`rootPath`, `port`, `framework`, `readyTimeoutMs`, `pollIntervalMs`); none are required. The output schema is seven fields with `framework` and `host` enums.

KV-cache stability: the tool description and parameters are static across calls; `defaultReadyTimeoutMs` and `defaultPollIntervalMs` enter the description as literal defaults, so a deployment that flips a default re-pins the description verbatim.

## Events

The preview tool emits no events of its own. Model-visible durability rides `job/done` (one per dev server lifecycle) and `tools/call` (one per readiness probe). The Agent Note `preview-plugin` (deferred to a later step) records the deferred `preview/ready` event.

## Known Limitations and Deferred Work

- **Localhost only.** The tool never binds a non-loopback interface; off-loopback access is a deployment concern (reverse proxy) the bundle does not own.
- **Framework detection covers only `next` and `vite`.** A project that runs its own script (e.g. `node server.js`) falls through to `npm run dev` and the model must keep its dev script honoring `$PORT` or `npm exec --` arguments.
- **No headless screenshot.** Phase 1 returns the URL; a Phase 2 follow-up adds an opt-in Playwright screenshot when the App Builder UI wants a thumbnail.
- **No `preview/ready` session-log event.** Phase 2 adds one so the projection unit can correlate ready previews with `Project` records.
- **Readiness probe is dial-only.** The helper stops on the first successful TCP + HTTP handshake regardless of HTTP status; a server returning 404 still counts as ready because the dev server may compile the page lazily.
- **Free-port allocation is racy under contention.** The tool closes the listener immediately and hands the port to the dev server; another process could grab the port in the gap. The `readyTimeoutMs` budget bounds the worst case.
- **The dev server lifecycle is not auto-cleaned.** When the model turns over or the composition tears down, the `ctx.jobs.start` producer is killed by the jobs runtime; the model must call `job_kill` to stop an in-turn server.
- **The tool requires `ctx.jobs`.** A composition that mounts the preview tool without a jobs implementation cannot start a dev server; the tool fails loud with a clear message rather than falling back to a foreground process.
