# Step 5 — Orchestration: workflow, preset, hooks, self-modification

> Status: COMPLETE. Phase alignment: model tiering + multi-agent orchestration + agent composition + cross-tool integration.

## Workflow capability

| Package | Role |
|---|---|
| `packages/workflow/workflow` | `WorkflowEngine` Service Definition + run contract + observe-only events |
| `packages/workflow/workflow-worker-thread` | Node worker-thread engine (one worker per run; child agents stay on host via `ctx.subagents`) |
| `packages/workflow/tool-workflow` | Model-facing `workflow` tool |
| `packages/workflow/tool-ralph` | Fresh-agent iterative execution per round |

**Plan Phase 1.3 'planner V4-Pro splits prompt into steps; worker V4-Flash executes':**

This is exactly what `dsh-workflow` + `dsh-tool-workflow` provides today. A model can call `workflow` with a script that uses `agent(prompt, opts)` to fan out one child per step, optionally with a structured-output `schema`. The orchestrator can pass `subagentProvider: 'spawn'` to force every child to start fresh with no parent history. The engine runs the script in a Node worker thread (so the host event loop is never blocked). The model tiering (V4-Pro vs V4-Flash) is per-child via `model: { provider: 'deepseek-official', model: 'deepseek-v4-pro' }`.

**Trust model caveat (per workflow-worker-thread/README.md):** 'Workflow scripts are model-written and have the same trust premise as the model's existing bash access. node:vm inside a worker is an API-shaping mechanism, not a security boundary.' This is fine for App Builder Phase 1/2 (single user, same trust as the parent agent) but must be flagged for Phase 3 multi-user.

## Agent preset capability

| Package | Role |
|---|---|
| `packages/preset/agent-presets` | `AgentPresets` service; per-preset agent composition; mount/compose/recompose/standingKeyFor |
| `packages/preset/persona` | Persona as a composable row (shadow the deployment persona for one agent) |

**Plan relevance:** A preset is essentially 'a packaged agent composition with its own tools, persona, and prompt sections' — exactly the App Builder's per-project agent. The new work is shipping an `app-builder` preset that loads:
- the persona (system prompt for an App Builder agent)
- the scaffold tool
- the preview tool
- an LSP tool (if added)
- the deploy tool (Phase 2)

The preset mechanism already handles the model-tier composition: an App Builder preset can declare a primary agent (V4-Pro) that orchestrates and a worker subagent (V4-Flash) that executes file edits.

## Hooks capability

| Package | Role |
|---|---|
| `packages/hooks/hook-protocol` | Shared core: matcher, executor, decoder, merge, `hook/*` events |
| `packages/hooks/hooks-claude-code` | CC hook dialect bridge (`hooks.json` command hooks -> dsh extension points) |
| `packages/hooks/hooks-codex` | Codex hook dialect bridge (subset of CC protocol) |

**Plan relevance:** Not directly needed for App Builder MVP. The hooks system is for users with existing Claude Code or Codex hook configs they want to reuse. The App Builder does not need to expose hook authoring — but it should NOT block hook loading either. If we ship the App Builder as a cordis patch over dsh-base, hooks still work.

## Self-modification

The root `AGENTS.md` mentions a `packages/self-modification` group ('the agent inspects/mounts its own plugins'). Verification: there is NO such directory. The only similar packages live in `packages/experimental/`:
- `packages/experimental/agent-team`
- `packages/experimental/tool-agent-team`

These are explicitly marked experimental (excluded from official releases per the root AGENTS.md layout section). They are not the 'self-modification' group the root AGENTS.md described. **The AGENTS.md description of `packages/self-modification` is aspirational or stale.** Worth filing as a documentation fix.

## Subagent / delegation recap (already in Step 3)

For App Builder, the subagent family is the model-tiering vehicle: the orchestrator agent (V4-Pro) calls `subagent` with `provider: 'spawn'` and `agentOptions: { provider, model: 'deepseek-v4-flash' }` to delegate a focused edit task to a fresh worker (V4-Flash). For structured outputs, `outputSchema` is supported. For background execution (long-running), `enableRunInBackground` plus `backgroundMode: 'one-shot'` returns a job id; `backgroundMode: 'continuable'` returns a durable child id and the orchestrator can `send_message` later.

## Cross-package summary relevant to the App Builder

The orchestration layer is already complete:

1. **Model tiering**: per-agent `provider` + `model` config; `ctx.agents.installModelSelection()` for runtime.
2. **Planner/worker orchestration**: workflow + tool-workflow + subagent family.
3. **Agent composition**: presets (one composition per project type); persona (per-agent shadow of the global persona); tool restriction (`ctx.tools.restrict()`); tool guard (`ctx.tools.guard()`).
4. **Cross-tool integration**: hooks (CC/Codex compat); MCP (`@deepseek-ai/dsh-mcp-client`).
5. **Self-modification**: NOT a stable package group yet. Agent Notes mention HMR (`@deepseek-ai/cordis-plugin-hmr`) for dev-time reload, and `verify-plugin-inventory` for runtime listing. The 'agent mounts its own plugins' capability is partially available via Cordis's runtime effect system but is not packaged.

## Plan mismatches identified (carried to Step 14)

- The plan's 'planner V4-Pro / worker V4-Flash' is a model-config concern, not a multi-agent design. The multi-agent design exists at `packages/subagent` and `packages/workflow` and the App Builder can use it without building it.
- 'Per-project agent composition' is exactly what `agent-presets` provides — the new work is shipping an `app-builder` preset, not building a composition system.
- 'The agent inspects/mounts its own plugins' (root AGENTS.md `self-modification`) is not implemented as a stable group; either drop it or scope it into Phase 3.
- 'Hooks for user-defined safety rails' (plan 'deterministic gates') would not use the `packages/hooks/*` bridges (those are for CC/Codex compatibility) — they would be native Cordis plugins. The plan should not confuse the two.
