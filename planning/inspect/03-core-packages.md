# Step 3 — Core packages (agent, session, tools, subagent, llm)

> Status: COMPLETE. Phase alignment: this defines the agent/session/tool/event substrate the plan treats as future work.

## Headline finding

**Every subsystem the plan describes for Phase 1/2 already exists as a Cordis package family.** The plan misreads the scope of work: it asks for things dsh already provides (event-sourced sessions, append-only logs, resume/fork, ToolPolicy, multi-model support, subagent delegation) and for things dsh does NOT yet provide (App-Builder-shaped control-plane app, scaffold/preview plugins, Postgres-backed project index).

## What's already built (relevant to the plan)

### Event-sourced sessions (plan Phase 1.4 + Phase 2)

| Package | Role | Plan item |
|---|---|---|
| `packages/core/session` | `SessionStore`, `Session`, append-only event log, surface projection, fork/resume | Plan Phase 1.4 + 2.1 |
| `packages/core/scope` | Scoped registration primitive (`Agent.ctx` is a scope) | Not in plan but critical for 'event-sourced sessions to resume/fork/replay' |
| `packages/session/session-persistence` | `SessionPersistence` seam | Plan phase 2.1 |
| `packages/session/session-persistence-jsonl` | Default JSONL backend with zstd compression; project/cwd/session layout | Plan phase 2.1 + Phase 0 'hello-world prompt persists' |
| `packages/session/session-persistence-sqlite` | SQLite backend (alternative) | Optional |
| `packages/session/session-projection` | Per-domain projection units driven by committed events | Plan phase 2.1 (event-sourced projection) |
| `packages/session/session-projection-cache` | (per its name) caching layer for projections | Plan phase 2.1 |
| `packages/session/session-stats` | Per-session statistics | Plan phase 2.1 (Usage API) |
| `packages/session/session-telemetry` + `session-telemetry-otel` | OpenTelemetry telemetry | Plan phase 2 (observability) |
| `packages/session/session-title` + `session-title-llm` + `session-title-first-prompt-llm` + `session-title-all-prompts-llm` | Auto-titling on first/all prompts | Useful for chat UI |
| `packages/session-query/session-query` | Service Definition for live+durable session retrieval | Plan phase 2.1 (filter/search) |
| `packages/session-query/session-query-sqlite` | SQLite FTS5 implementation (searchSessions/searchEvents) | Plan phase 2.1 (full-text search) |
| `packages/session-query/tool-session-query` | Model-facing tool over the query API | Plan phase 2.1 (audit) |

**Storage note:** the plan calls for Postgres for the control-plane index. dsh already ships a dedicated derived SQLite index (`@deepseek-ai/dsh-session-query-sqlite`). Postgres is not blocked, but the existing SQLite path is disposable, owner-only (`0700`/`0600`), FTS5-backed, and lives in a separate process-local database file — most App Builder control-plane needs already fit here.

### Agent runtime (plan Phase 1.3 + Phase 2 model tiering)

| Package | Role |
|---|---|
| `packages/core/agent` | `AgentRegistry`, initiator scope, factory contract, agent/* events |
| `packages/core/agent-loop` | THE concrete loop driver. The only package with concrete loop logic |
| `packages/core/system-prompt` | System-prompt assembly: sections, contexts, tools, variables |
| `packages/core/tools` | Tool registry + pipeline (register/execute/presentAs/restrict/guard/executionMode) |
| `packages/core/agent-default-model` | Pluggable default-model selection |
| `packages/core/agent-tool-presentation` | Tool result presentation |
| `packages/llm/llm` | Provider-neutral `LlmRuntime` with `stream()` + retry policy + adapter discovery |
| `packages/llm/llm-deepseek` | DeepSeek chat-completions adapter — defaults to V4 Flash, V4 Pro, V4 Flash Vision Exp |
| `packages/llm/llm-pi-ai` | Library-backed alternative via @earendil-works/pi-ai (multi-provider) |
| `packages/llm/llm-retry` | Bounded retry policy (normal: 5 retries; always: full control) |
| `packages/llm/token-meter` | Per-session token usage tracking (cache-aware) |

**Plan Phase 1.3 'planner V4-Pro / worker V4-Flash'** — already configurable per-agent via `ctx.agents.installModelSelection()` plus the `agents[]` config block (`provider`, `model`, `maxTokens`). The plan's 'orchestrator splits a prompt into steps; worker executes' is achievable today by either (a) registering one orchestrator agent with a workflow tool that calls the worker, or (b) using the subagent family directly with provider selection.

### Subagent / delegation (plan Phase 1 'scaffold plugin' composition)

| Package | Role |
|---|---|
| `packages/subagent/subagent` | `SubagentRuntime` service; provider registry; one-shot + continuable; lifecycle owner |
| `packages/subagent/subagent-spawn-in-process` | Provider: fresh child agent |
| `packages/subagent/subagent-fork-in-process` | Provider: child seeded with parent's completed turns |
| `packages/subagent/subagent-in-process-driver` | Shared driver (depth, persona, toolFilter, structured output, cancellation, disposal) |
| `packages/subagent/subagent-acp` | Provider: child runs as an ACP process |
| `packages/subagent/subagent-claude-code` | Provider: child runs via Claude Code |
| `packages/subagent/subagent-codex` | Provider: child runs via Codex |
| `packages/subagent/subagent-dsh-sdk` | Provider: child runs over the dsh JSON-RPC SDK |
| `packages/subagent/tool-subagent` | Model-facing delegation tool |
| `packages/subagent/tool-subagent-control` | `list-agents` tool (recursive enumeration) |
| `packages/subagent/tool-subagent-report` | Subagent -> parent report tool |

**Plan Phase 1 'scaffold a Next.js/Svelte + Tailwind project'** — can be expressed as a continuable subagent with a structured-output contract, or as a regular tool (`dsh-tool-bash` + `dsh-tool-str-replace-editor` + `dsh-tool-fs`). The plan's mental model ('a `scaffold` tool that copies a template and runs `npm install`') is a regular tool, not a subagent — but the plan's broader orchestration ('planner splits into steps; worker executes') is exactly what subagent + workflow tools do.

### Workflow / orchestration (plan Phase 1.3 model tiering)

| Package | Role |
|---|---|
| `packages/workflow/workflow` | `Workflow` capability seam + Service Definition |
| `packages/workflow/workflow-worker-thread` | Provider: worker-thread based workflow execution |
| `packages/workflow/tool-workflow` | Model-facing tool to run a workflow |
| `packages/workflow/tool-ralph` | Fresh-agent iterative execution per round (exactly the ralph skill) |

**Plan Phase 1.3 'planner V4-Pro splits prompt into steps'** — could be implemented as a workflow whose first node is a planner LLM call that produces a step list, and whose following nodes are subagent delegations. `@deepseek-ai/dsh-tool-workflow` is the model-facing tool that runs such a workflow.

### Interaction / approval / permission (plan Phase 2 ToolPolicy)

| Package | Role |
|---|---|
| `packages/interaction/user-approval` | `Approval` Service Definition + flow (asks before destructive ops) |
| `packages/interaction/user-questions` | `UserQuestions` — model asks user structured questions |
| `packages/interaction/tool-ask-user` | Model-facing `ask_user` tool |
| `packages/interaction/permission-presets` | Per-tool permission presets (the ToolPolicy manifest story) |
| `packages/interaction/commands` | `Commands` Service Definition — slash commands and shortcuts |

**Plan Phase 2.2 'ToolPolicy manifest — every plugin tool declares allowed actions, read/write scope, network scope, credential access'** — already exists structurally:
- `@deepseek-ai/dsh-permission-presets` is the concrete mechanism.
- `ctx.tools.execute()` enforces `tools/pre-execute` (reorderable allow/deny/ask) plus `ctx.tools.guard()` (monotonic, owner policy).
- The shipped dsh-base bundle loads `@deepseek-ai/dsh-permission-presets` automatically.
- Each tool can declare an `isConcurrencySafe(args)` classifier, and approval flows through `ctx.approval` with `ask -> deny` degrade.

**Gap to plan:** the plan calls for an explicit per-tool declaration of allowed actions / read-write scope / network scope / credential access, enforced at the tool-call level. dsh has the enforcement primitives (`tools/pre-execute`, `tools/guard`, `permission-presets`) but the explicit schema is not a single typed manifest. A new package `@deepseek-ai/dsh-tool-policy-manifest` (or similar) could declare `ToolPolicy { id, allow, scope, network, credentials }` and register a `tools/pre-execute` listener that consults it. This is additive, not replacement.

### Plan mode, goal mode, todo

| Package | Role |
|---|---|
| `packages/plan/plan-mode` | `PlanMode` Service Definition + provider (logged plan state) |
| `packages/goal/goal` | `Goal` capability seam + service |
| `packages/goal/goal-round-driver` | Loop driver that drives a goal to completion across rounds |
| `packages/goal/tool-goal` | Model-facing goal tool |
| `packages/goal/command-goal` | Slash command |
| `packages/todo/tool-todo` | The `todo_write` tool (the one available as `todo_write` to subagents) |

**Plan reference to 'the agent inspects/mounts its own plugins'** — `packages/self-modification` (visible in directory listing earlier). Needs Step 4/5 to verify.

### Compaction / context management

| Package | Role |
|---|---|
| `packages/compaction/compaction` | `Compaction` Service Definition + provider seam |
| `packages/compaction/compaction-basic` | Provider: rolling-window compaction |
| `packages/compaction/compaction-tool-result-pruner` | Provider: prune tool results before compaction |
| `packages/compaction/command-compact` | Slash command |
| `packages/guard/timeout-policy` | Per-tool timeout policy (mentioned in `dsh-tool-call-timeout-policy`) |
| `packages/spill/spill-local` + `spill/spill-policy` | Spill large payloads to disk before they hit the model |
| `packages/guard/session-checkpoint-policy` | Session checkpoint policy |
| `packages/runtime-diagnostics/invariants` | Program-backed runtime invariant checks |

## What's NOT yet built (relevant to the plan)

These are the genuine gaps:

1. **No project-entity first-class model.** dsh's session is the unit of agent work. There is no `Project { id, user, name, stack, gitUrl, dshProfile }` and no `Deployment` entity. Sessions have `cwd` and `parentSession`, but not a 'project' container. We would add a `Project` package that wraps a session and owns its metadata.

2. **No apps/control-plane or App-Builder-specific UI.** `packages/client/ui-*` exist (conversation, plan, goal, subagent, jobs, skill, settings, layout, sidebar, etc.) but there is no 'project list pane' or 'preview iframe pane'. The 'DSH Local Build' title in apps/web/src/main.ts is hardcoded — no App Builder branding.

3. **No HTTP/SSE REST API.** dsh ships a JSON-RPC SDK (`packages/sdk/{client,protocol,server}`) but no HTTP server with the plan's REST endpoints (`POST /projects`, `GET /sessions/:id/events` as SSE, etc.). The `dsh-host-apiproxy` and `dsh-host-webserver` packages provide a reverse proxy and a webserver host, but not a REST API. We would build one on top.

4. **No Postgres integration.** dsh uses SQLite and JSONL; there is no Postgres driver.

5. **No deploy tool.** There is no `git init -> commit -> push` tool. The plan's Phase 2.3 'deploy path with gates' is greenfield.

6. **No scaffold template tool.** There is no `scaffold` tool that copies a Next.js/Svelte template. There ARE the building blocks (`dsh-tool-fs`, `dsh-tool-str-replace-editor`, `dsh-tool-bash`). The scaffold tool is a small composition.

7. **No preview pane in the web UI.** `packages/host/frontend-static` serves the built frontend dist; no iframe-with-proxy wiring for a per-project dev server.

8. **No quota / rate-limit system.** No token/cost budgets are enforced beyond `dsh-token-meter`'s accounting.

## Comparison with plan phases

| Plan item | Existing equivalent | Gap |
|---|---|---|
| Phase 0: install dsh | We are dsh | Reframe: 'pin the version we ship' |
| Phase 0: scaffold monorepo | Monorepo exists | Reframe: 'add new app and bundle packages' |
| Phase 1.1: scaffold plugin | No `scaffold` tool | Build as thin composition over `dsh-tool-fs` + `dsh-tool-bash` |
| Phase 1.2: preview plugin | No `preview` tool | Build as `dsh-tool-bash` (start dev server) + screenshot helper |
| Phase 1.3: model tiering | Already configurable per agent | Mostly docs + agent preset |
| Phase 1.4: event-sourced sessions | Already exists end-to-end | Wrap into project-level projection |
| Phase 2.1: data model + API | SQLite session index exists; no Project entity; no HTTP REST | Add Project + REST/SSE server |
| Phase 2.2: ToolPolicy manifest | Permission presets + tools/pre-execute exist | Add explicit per-tool policy schema + enforcer |
| Phase 2.3: deploy tool | None | Build `deploy` tool with deterministic gates (SAST/SCA/secrets) |
| Phase 2.4: input validation | `schemastery` config validation + tool schema validation | Mostly there; add explicit output validation gate |
| Phase 3: multi-user auth/isolation | `packages/sandbox/sandbox-local`, `bash-sandbox`, `pwsh-sandbox`, `fs-sandbox` | Add control-plane auth boundary; bind Landlock addon |

## Plan mismatches identified (carried to Step 14)

- Plan overestimates greenfield work; dsh is a developer preview of this product, not a library to integrate.
- Plan's 'ToolPolicy manifest' is mostly already implemented as `permission-presets` + `tools/pre-execute` + `tools/guard`. Additive manifest is fine; framing as 'we must build the entire permission system' is wrong.
- Plan's 'Event-sourced sessions' is already done; the new work is binding sessions to Projects.
- Plan's 'Model tiering' is already done per agent; the new work is composing a planner + worker via subagent/workflow.
- Plan's API endpoint list ignores dsh's existing JSON-RPC SDK and host-webserver/api-proxy. We can mount REST/SSE on top rather than build a parallel wire layer.
