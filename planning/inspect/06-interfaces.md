# Step 6 — Interface surfaces (acp, sdk, api, hooks)

> Status: COMPLETE. Phase alignment: how external clients (humans via UI, agents via JSON-RPC, automated ACP agents) drive dsh, and what exists for App Builder's HTTP API.

## Headline finding

dsh already ships a JSON-RPC 2.0 wire protocol over stdio (`@deepseek-ai/dsh-sdk-protocol` + `dsh-sdk-jsonrpc-server` + `dsh-sdk-client` + `deepseek-harness` Python SDK). It also ships an ACP server (`@deepseek-ai/dsh-acp`). The plan's Phase 2 'REST + SSE' API does NOT exist — but the underlying transport mechanism (Typert unary RPC + Connection + WebServer) does.

## ACP (Agent Client Protocol)

| Package | Role |
|---|---|
| `packages/acp/acp` | Automation-only ACP server (out-of-process clients speak the ACP standard to harness agents) |
| `packages/subagent/subagent-acp` | The matching out-of-process subagent client (registers as a `ctx.subagents` provider that delegates to an ACP child) |

**Plan relevance:** ACP is the standard for editor/agent interop. If the App Builder wants to expose its projects to other agents (e.g. Zed, JetBrains IDE agents), ACP is already wired. Phase 1/2 don't need ACP.

## SDK (JSON-RPC 2.0)

| Package | Role |
|---|---|
| `packages/sdk/protocol` | Wire types: InitializeParams/Result, SessionPromptParams/Result, SessionEventNotification, SessionStatusNotification, SubagentStarted/FinishedNotification |
| `packages/sdk/client` | TypeScript client (`DeepSeekHarness` high-level owned-run API; `HarnessClient` lower-level protocol client) |
| `packages/sdk/server` | `HarnessSdkJsonRpcServer` plugin (`inject: ['agents']`); newline-delimited JSON-RPC 2.0 over stdio |
| `python/` | Python SDK (`deepseek-harness`) — same wire, same runtime peer, same layering |

**Plan Phase 2 'POST /sessions/:id/messages':** the wire shape is `session/prompt` with `SessionPromptParams` -> `SessionPromptResult { messageId }`. The response does NOT include a turn-end or status — the client subscribes to `session.event` and watches for completion.

**Plan Phase 2 'GET /sessions/:id/events (SSE)':** the SDK emits `session.event` notifications (every session in the runtime, unfiltered) plus `session.status` (whole-agent running/idle transitions). Adapting these to SSE is a small relay.

**Plan Phase 2 'GET /sessions/:id/transcript':** the SDK client buffers all events for a session in `events[]`. A REST endpoint can mount the same buffer through Typert Gateway (see `api/gateway`).

**Plan Phase 2 'POST /sessions/:id/fork' / '/resume':** the dsh AgentLoop implements these directly via `ctx.agents.create({ seed: ... })` and `ctx.agents.resume(...)`. They are not on the SDK wire today but are trivial to add as `session.fork` / `session.resume` requests.

**Plan Phase 2 'POST /projects/:id/deploy':** no SDK method. New. Would need `session.deploy` or similar.

## API (Typert RPC + Connection + WebServer)

| Package | Role |
|---|---|
| `packages/api/remotes` | BFF policy + selected business API; configures `ctx.typert`; consumes `ctx.remote` |
| `packages/api/gateway` | Host Typert dispatcher + Client Remote endpoint (`ctx.typertGateway` / `ctx.remote`) |

**This is the path the App Builder's REST/SSE API would use.** The runtime dependency direction is `remotes -> gateway -> connection -> webserver`. The Connection and WebServer are at `packages/client/connection` and `packages/host/webserver` (a known limitation: 'a later package-only move can place them under `api/connection` and `api/webserver` without changing their service contracts').

The legacy API Proxy (`packages/host/apiproxy`) remains as a fallback for methods not yet migrated to Remote. It consumes the Host resolver owned by `api-remotes` so migrated and legacy methods retain one Agent/Session identity policy.

**Plan Phase 2 'REST API':** the cleanest path is:
1. Define a Typert service for the App Builder (`@deepseek-ai/dsh-app-builder-remote`) that exposes `listProjects`, `createProject`, `getSession`, `getTranscript`, `subscribeEvents`, `forkSession`, `resumeSession`, `getPreview`, `deployProject`.
2. Plug it into `packages/api/gateway` (Client Remote endpoint).
3. The existing WebServer host handles HTTP; the Connection module handles the browser transport.
4. SSE for `subscribeEvents` reuses the existing projection push (`session/projection` frame).

## Hooks (Claude Code / Codex bridges)

Already covered in Step 5. Recap: `dsh-hooks-claude-code` and `dsh-hooks-codex` are compatibility bridges for users who already have `hooks.json` configs. Not App Builder primitives.

## WebSocket / Live updates

dsh's existing transport is JSON-RPC over stdio (process model). The browser transport goes through Connection module -> WebServer. Real-time updates use the projection push frame (`session/projection`) for state snapshots and the agent-event stream for live notifications. SSE is an addition: we can mount an SSE relay over the same agent-event stream.

## Existing examples (preview of Step 13)

- `examples/jsonrpc-agent` — JSON-RPC driven dsh agent (the pattern our SDK uses)
- `examples/acp-agent` — ACP-driven dsh agent
- `examples/headless-agent` — headless dsh agent
- `examples/web-cordis`, `examples/web-schedule` — web UI demo bundles
- `examples/mcp-memory` — MCP server driven by dsh

## Plan mismatches identified (carried to Step 14)

- Plan calls for 'REST + SSE' as the control plane wire. dsh's actual wire is JSON-RPC over stdio (with a Connection bridge to HTTP). The plan should adopt either (a) JSON-RPC for the App Builder API (consistent with the rest of the codebase), or (b) REST over the Typert RPC layer (workable but adds a layer).
- Plan does not mention the existing `dsh-api-remotes` / `dsh-api-gateway` machinery. App Builder's BFF should be a Typert service in this style, not a parallel HTTP layer.
- Plan does not mention ACP. If Phase 3 wants multi-agent interop (e.g. external IDEs driving App Builder projects), ACP is already there.
- Plan does not mention the Python SDK. If we want Python-based automation/tests (snapshots, e2e), the SDK is already there.
- Plan does not mention 'HOOKS for safety gates' (deterministic gates). The bridges are compatibility-only; native safety gates would be Cordis plugins, not hooks.
- The `host/apiproxy` package is the 'legacy API' fallback. App Builder's HTTP API should not regress to this; new methods go through `api/gateway` and `api/remotes`.
