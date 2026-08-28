# Step 13 — examples/: existing runnable bundles

> Status: COMPLETE. Phase alignment: what runnable compositions dsh already ships, and how an App Builder example would slot in.

## Headline finding

`examples/` is the workspace member for runnable demos. It is NOT a build target — its `package.json` declares the union of packages loaded by every leaf's `cordis.yml`. Each leaf has its own composition, snapshot tests, and a private `package.json`. An App Builder example would land as `examples/app-builder/`.

## Examples today

| Example | Purpose | Snapshot scenarios |
|---|---|---|
| `examples/acp-agent` | Primary ACP automation server scenario; snapshot harness drives ACP clients over JSON-RPC | 20+ scenarios: `advanced`, `agent-instructions`, `background-job-admission`, `both-mode`, `child-question`, `code-mode*`, `cordis-tools`, `cordis`, `depth-two`, `fs`, `image*`, `partial-landlock`, `product-subagent-*`, `pty`, `retry`, `session-query`, `session-sandbox-root`, `session-title`, `subagent-*`, `web` |
| `examples/headless-agent` | Internal canonical-event JSONL snapshots and replay fixtures | `advanced`, `compaction`, `cordis`, `credentials`, `e2b`, `goal`, `pty`, `ralph`, `retry`, `semantic-checkpoint`, `subagent-*`, `team`, `workspace-context-resume` |
| `examples/jsonrpc-agent` | JSON-RPC SDK demo (TypeScript + Python) | `cordis`, `minimal` |
| `examples/mcp-memory` | MCP server driven by dsh | `engram`, `mcp-reference-memory`, `memorix` |
| `examples/web-cordis` | Web UI demo | none (composition only) |
| `examples/web-schedule` | Web + scheduled jobs demo | none |

## Snapshot harness conventions

- Each scenario: `<scenario>.cordis.yml` (live config) + `<scenario>.cordis.snapshot.yml` (expected output).
- ACP scenarios use `examples/<name>/tests/snapshots/` and a scenario table over the `@deepseek-ai/dsh-acp-snapshot` suite factory. `examples/acp-agent` is primary.
- Headless scenarios use `examples/headless-agent/tests/snapshots/` and `dsh-llm-replay` (replay a recorded session against the snapshot).
- Browser-rendered web GUI journeys use `apps/web/tests/snapshots/`.
- Each example has both keyless and with-key smokes.
- Keyless process smokes use `@deepseek-ai/dsh-loader-smoke` for Loader launch resolution.
- Map a package-owned config to `examples/<agent>/tests/fixtures/<group>/<package>/cordis.yml`; keep its driver and assertions package-local.
- Declare every package the config names in both root `tsconfig.json` references and `examples/package.json`.

## `examples/package.json` dependencies

Already lists ~100 workspace packages — basically the union of every dsh capability. New packages land here so they can be referenced by `examples/<name>/cordis.yml`.

## App Builder example pattern

An `examples/app-builder/` would follow this structure:

```
examples/app-builder/
  cordis.yml                    # base app-builder composition (scaffold + preview + deploy tools)
  package.json                 # private, metadata only
  README.i18n.yaml
  README.md
  README.zh.md
  tests/
    snapshots/                 # expected outputs
    fixtures/
      build/app-builder/       # per-package test configs
        <package>/cordis.yml
    e2e/
      keyless-smoke.spec.ts    # boots cordis.yml, drives it, asserts
      with-key-smoke.spec.ts   # sends a real prompt, verifies output
    built-bin.e2e.ts           # runs the built `lib/` artifact
```

And `examples/package.json` adds the new package to its `dependencies` block.

## Plan implications

An App Builder MVP would add:

1. **An `examples/app-builder/` example** — `cordis.yml` referencing the new app-builder packages, snapshot scenarios for keyless smoke + keyless scaffold-preview-iterate flow.
2. **An `examples/app-builder/cordis.snapshot.yml`** — expected composition output.
3. **An `examples/app-builder/tests/e2e/keyless-smoke.spec.ts`** — boots the composition via `dsh-loader-smoke` and asserts clean exit.
4. **An `examples/app-builder/tests/e2e/with-key-smoke.spec.ts`** — sends a real prompt and verifies a scaffolded project is on disk.
5. **`examples/package.json`** updated with the new package workspace deps.
6. **Root `tsconfig.json`** updated if the new packages add to the project graph.

## Plan mismatches identified (carried to Step 14)

- Plan does not mention that every example has keyless + with-key smokes and a `<scenario>.cordis.snapshot.yml` per scenario. The App Builder MVP will need both.
- Plan does not mention that `examples/package.json` must list every package used by every example's cordis.yml. New packages must be added there.
- Plan does not mention `dsh-loader-smoke`. The keyless smoke test entry uses it.
- Plan does not mention `dsh-llm-replay` for headless scenarios. The with-key test uses it to keep the snapshot reproducible.
- Plan does not mention the `examples/<agent>/tests/fixtures/<group>/<package>/cordis.yml` mapping convention. Per-package test configs go there.
- Plan does not mention that `examples/` is the workspace member for module resolution of runnable configs (not built; resolved through workspace deps). New example code lives in `packages/` not `examples/`.
