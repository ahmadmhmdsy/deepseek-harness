# Step 4 — Capability packages (shell, subprocess, fs, web, skill, sandbox, terminal, lsp, storage)

> Status: COMPLETE. Phase alignment: defines the OS/process/IO surface and the credential/tool substrate.

## Headline finding

dsh already implements every OS-facing capability the App Builder plan needs. The plan's Phase 1.1 'scaffold tool' and Phase 1.2 'preview tool' are both expressible as compositions over the existing tools. The web/skill/storage layers are all plugin-shaped and loadable. The native Landlock sandbox addon already ships. The 'no Postgres / use SQLite' decision is already in place.

## Filesystem capability

| Package | Role |
|---|---|
| `packages/fs/fs` | `FileSystem` Service Definition (read/write/edit/observe) |
| `packages/fs/fs-local` | Concrete `LocalFileSystem` provider |
| `packages/fs/fs-sandbox` | `SandboxedFileSystem` with per-call MODE fence on write/edit; reads always pass through; canonicalizes the target immediately before delegating. |
| `packages/fs/fs-observation-policy` | Optional `ctx.fs/*` event gate (read-before-write/edit) |
| `packages/fs/tool-fs` | Model-facing `read`, `read_image`, `write`, `edit` |
| `packages/fs/tool-fs-search` | Model-facing `glob`, `grep` over a packaged `@vscode/ripgrep` binary via `ctx.subprocess` (NOT a host `rg` install) |
| `packages/fs/tool-str-replace-editor` | Standalone `str_replace_editor` over `ctx.fs` (view/create/str_replace/insert) |

**Plan Phase 1.1 'scaffold a project from a template'** — already achievable: read template files via `dsh-tool-fs` `read`; copy them into the project cwd via `dsh-tool-fs` `write`; call `npm install` via `dsh-tool-bash`. A dedicated `dsh-tool-scaffold` is a thin composition, not new infrastructure.

## Shell capability

| Package | Role |
|---|---|
| `packages/shell/shell` | `Shell` Service Definition (executor seam, `ShellExecSpec`) |
| `packages/shell/shell-env` | Managed `DSH_*` environment registry (per-call trusted snapshot) |
| `packages/shell/bash-local` | Local bash executor (no sandbox) |
| `packages/shell/bash-sandbox` | Sandboxed bash executor (consumes `ctx.sandbox` + `ctx.sandboxPolicy`) |
| `packages/shell/pwsh-local` | Local PowerShell executor |
| `packages/shell/pwsh-sandbox` | Sandboxed PowerShell executor |
| `packages/shell/tool-bash` | Model-facing `bash` tool (foreground + background via `ctx.jobs`); auto-advertises `sandbox_permissions` only when executor reports `sandboxMode` |
| `packages/shell/tool-bash-persistent` | Persistent bash tool (long-lived processes) |
| `packages/shell/tool-pwsh` | Model-facing PowerShell tool |
| `packages/shell/tool-pwsh-persistent` | Persistent PowerShell tool |

**Plan Phase 1.2 'preview tool starts the dev server on a free port'** — `dsh-tool-bash` already supports `run_in_background: true`, returning a job id controlled by `dsh-tool-jobs` (job_output / job_list / job_kill). Combined with `dsh-tool-bash-persistent` for streaming logs, this covers 'start `npm run dev` in background; return URL when ready'. The 'wait for readiness' part needs a small helper (poll HTTP). The 'screenshot the rendered page' part needs a headless-browser integration we would add.

**Sandbox story:** `dsh-bash-sandbox` is already production-grade — three modes (`read-only`, `workspace-write`, `danger-full-access`), per-session policy resolution via `dsh-sandbox-policy`, cross-family coordination with `dsh-fs-sandbox` (same `writableRoots()` function shared between bash and fs), structured denial facts (`ShellRunResult.sandbox.denied: true`), runner-failure vs denial classification, escalation paths via `sandbox_permissions`. The plan's Phase 1 'keep sandboxing on' is literally one config row (`@deepseek-ai/dsh-sandbox-policy` in `cordis.patch.yml`).

## Sandbox capability

| Package | Role |
|---|---|
| `packages/sandbox/sandbox` | `Sandbox` Service Definition (runner's wrap API) |
| `packages/sandbox/sandbox-local` | Local provider; selects bwrap (Linux) > Landlock (Linux) > Seatbelt (macOS) > Windows ACL restricted-token |
| `packages/sandbox/sandbox-policy` | Single owner of `ctx.sandboxPolicy` (default mode + per-session override via `sandbox/mode` event) |
| `packages/sandbox/sandbox-windows-acl` | Windows-specific ACE machinery |

**Plan Phase 3 'Landlock/bwrap sandbox' is already there.** `dsh-sandbox-local` already selects bwrap first then Landlock on Linux. The native Landlock addon ships at `native/landlock-run/` and is exposed as `@deepseek-ai/node-addon-landlock-run`. Phase 3's work is not 'build a sandbox' — it is 'wire sandboxing into the per-project dsh session' and 'enforce non-privileged user execution'.

Crucially: **Landlock, bwrap, Seatbelt, and Windows ACL all fail closed**. No silent unconfined fallback. Multiple candidates are probed; a sole candidate is selected directly; an unusable runner throws `SANDBOX_UNAVAILABLE`. This matches the plan's safety invariants.

## Subprocess capability

| Package | Role |
|---|---|
| `packages/subprocess/subprocess` | `SubprocessRuntime` Service Definition (spawn/exec/output) |
| `packages/subprocess/subprocess-local` | Local Node implementation |

## Web capability (search + fetch)

| Package | Role |
|---|---|
| `packages/web/web` | `WebRuntime` Service Definition: provider registry, selection policy, request/result vocabulary, error taxonomy |
| `packages/web/web-fetch-http` | Anonymous public HTTP(S) fetch provider (no credentials, follows up to 5 same-origin redirects) |
| `packages/web/web-search-deepseek` | DeepSeek-backed search (Anthropic-compatible Messages API with `web_search_20250305` server tool); credentialed |
| `packages/web/web-search-perplexity` | Perplexity search; credentialed |
| `packages/web/web-search-exa` | Exa search; credentialed |
| `packages/web/tool-web` | Model-facing `web_search` + `web_fetch` tools |

**Important safety note from `packages/web/AGENTS.md`:** 'Reject redirects on credential-bearing provider requests. Configure the HTTP client to fail before following any redirect response. Regression coverage must prove that the redirect target is not contacted and that every credentialed provider opts into the policy.'

Perplexity and Exa READMEs explicitly say: 'HTTP redirects are rejected before the Location target is contacted and surface as `WEB_PROVIDER_ERROR`.' That is the policy working. `web-fetch-http` is anonymous so the same-origin redirect limit is acceptable; `web-search-deepseek` should be checked for the same behavior (its README does not explicitly say 'redirects rejected' — Step 10 will re-verify).

## Skill capability

| Package | Role |
|---|---|
| `packages/skill/skill` | `SkillRegistry` Service Definition (`ctx.skills`), scope-layered, host+per-scope |
| `packages/skill/skill-filesystem` | Local filesystem provider (project + user + custom roots, Chokidar watcher) |
| `packages/skill/skill-badge` | UI badge |
| `packages/skill/tool-skill` | Model-facing `skill` tool + per-step `skill-catalog` digest |

**Plan implications:** the skill system already provides a docket of 'role-specific instructions' a model can request. For App Builder, we could ship skills like `dsh-app-builder:scaffold-nextjs`, `dsh-app-builder:tailwind-setup`, etc. as discoverable entries without any new infrastructure. The catalog is auto-injected into the system prompt on every step.

## Terminal capability

| Package | Role |
|---|---|
| `packages/terminal/terminal` | Terminal Service Definition (persistent session over PTY) |
| `packages/terminal/terminal-bash` | Bash PTY provider (uses node-pty patched for cross-platform) |
| `packages/terminal/tool-terminal` | Model-facing terminal tool |

## LSP capability

| Package | Role |
|---|---|
| `packages/lsp/lsp` | LSP Service Definition |
| `packages/lsp/lsp-stdio` | stdio LSP provider |
| `packages/lsp/tool-lsp` | Model-facing LSP tool |

**Plan implications:** if we ship a real App Builder, an LSP tool that lets the agent query the generated project for type errors / definitions would be a high-value add. dsh already has the seam and the stdio provider.

## Storage capability

| Package | Role |
|---|---|
| `packages/storage/storage` | Storage Service Definition |
| `packages/storage/storage-domain` | Typed domain helpers |
| `packages/storage/storage-json` | JSON file backend |
| `packages/storage/storage-sqlite` | SQLite backend |

**Plan 'Postgres for the control-plane index'**: dsh does not ship a Postgres backend. SQLite is the standard backend, with the additional session-query-sqlite dedicated derived index. Adopting Postgres would require a new package `dsh-storage-postgres` and a new `dsh-session-query-postgres`. For Phase 1/2 single-user scope, SQLite + the existing JSONL persistence is more than sufficient.

## Host (server-side) capability

| Package | Role |
|---|---|
| `packages/host/webserver` | Server host for the dsh web UI |
| `packages/host/frontend-static` | Serves the built frontend dist (with `dist-fallback-owner` policy) |
| `packages/host/apiproxy` | Reverse proxy in front of the API gateway |
| `packages/host/directory-picker`, `directory-picker-browse`, `directory-picker-native`, `directory-picker-auto` | Native directory pickers for desktop launch |
| `packages/host/plugin-inventory` | Tracks installed plugins |

## Client (browser-side) capability

| Package | Role |
|---|---|
| `packages/client/runtime` | Browser-side runtime |
| `packages/client/modules` | Module loader for the browser |
| `packages/client/connection` | Browser-to-host transport |
| `packages/client/web` | Web shell library (the GUI library apps/web wraps) |
| `packages/client/ui-*` (~36 packages) | UI slot packages: layout, sidebar, conversation, plan, goal, todo, skill, subagent, jobs, settings, theme, etc. |
| `packages/client/hmr` | Browser HMR receiver |
| `packages/client/locale` | Bilingual locale |
| `packages/client/attachment` | Attachment display |
| `packages/client/primitives` | UI primitives |
| `packages/client/slots` | UI slot registry |
| `packages/client/conversation`, `tool`, `plan`, `goal`, `todo`, `subagent`, `jobs`, `skill`, `settings*`, `permission-presets`, `model-selection`, `agent-preset`, `theme`, `reference`, `commands`, `user-questions`, `message-feedback`, `input-trigger`, `workspace`, `trajectory`, `deliverables`, `workflow-run`, `layout`, `sidebar`, `brand-official` | The actual UI slot components |

**Plan implications for the App Builder web UI:** most chat/plan/todo/subagent/skill/settings UI exists; we need to ADD a project-list pane, a preview iframe pane, and a deployment status indicator. The slot system is built for exactly this kind of plug-in UI.

## Other capabilities

| Package | Role |
|---|---|
| `packages/e2b/e2b` | E2B (cloud sandbox) provider seam |
| `packages/e2b/fs-e2b` | E2B filesystem provider |
| `packages/e2b/subprocess-e2b` | E2B subprocess provider |
| `packages/code-runtime/code-runtime` | Code-runtime Service Definition (multi-language: Node, Python, ...) |
| `packages/code-runtime/code-runtime-python` | Python code runtime provider |
| `packages/code-runtime/code-runtime-worker-thread` | Worker-thread code runtime (Node `node:vm` style) |
| `packages/spill/spill`, `spill-local`, `spill-policy` | Spill large payloads to disk before they hit the model |
| `packages/guard/timeout-policy` | Per-tool timeout policy |
| `packages/guard/repeat-tool-reminder` | Nudge the model when it stalls on the same tool |
| `packages/settings/settings`, `settings-file` | User settings |
| `packages/credentials/credentials`, `credentials-local`, `authorization` | Credential storage + authorization scopes |
| `packages/identity/anonymous-user-id` | Anonymous per-machine identity |
| `packages/schedule/schedule` | Scheduled jobs |
| `packages/jobs/jobs`, `jobs-local`, `tool-jobs` | Background job runtime + tool |
| `packages/feedback/command-feedback`, `message-feedback` | User feedback collection |
| `packages/mcp/mcp-client` | Model Context Protocol client |
| `packages/util/*` | Zero-dep utilities: brand, atomic-write, home-paths, launch-environment, native-command, output-retention, timeout |
| `packages/workspace/workspace` | Workspace concept (multi-cwd management) |
| `packages/boot/app-boot`, `cmdline` | Shared app-bin glue |

## Plan mismatches identified (carried to Step 14)

- **Plan Phase 1.1 'build a scaffold tool'** — the storage, fs, and shell capabilities exist; the tool is a small composition. Calling it 'a big new feature' overstates it.
- **Plan Phase 1.2 'build a preview tool'** — bash + persistent bash + jobs + a readiness probe + (optionally) a headless screenshot integration. The hard part is the readiness probe and the headless screenshot — neither exists in dsh today and both need greenfield work.
- **Plan Phase 2.2 'ToolPolicy permission manifest'** — sandbox-policy + permission-presets + tools/pre-execute + tools/guard ALREADY compose the equivalent. An explicit typed `ToolPolicy` schema is an additive enrichment, not a from-scratch build.
- **Plan 'Postgres for the control-plane index'** — dsh ships SQLite + dedicated derived SQLite FTS5 index. Adopting Postgres is orthogonal to the plan's MVP and could be deferred.
- **Plan Phase 3 'Landlock sandbox'** — already provided by `@deepseek-ai/node-addon-landlock-run` consumed by `@deepseek-ai/dsh-sandbox-local`. Phase 3 work is binding it to per-project sessions, not building the kernel layer.
- **Plan 'Web capabilities (search/fetch)'** — already exists (`@deepseek-ai/dsh-web` seam + 3 search providers + 1 fetch provider + tool-web). Skip the 'add web capability' framing.
- **Plan 'Skill system'** — already exists (`@deepseek-ai/dsh-skill` + filesystem provider + model-facing tool). New App Builder skills can ship as standalone `SKILL.md` files.
- **Plan 'LSP integration'** — not mentioned, but the capability seam exists; high value add for App Builder quality.
- **Plan does not mention Code Mode** (`@deepseek-ai/dsh-code-runtime`) — but it exists and is useful for letting the App Builder run short verification scripts without spawning bash.
- **Plan does not mention MCP** — but `@deepseek-ai/dsh-mcp-client` exists and lets the App Builder consume external tool servers. Worth deciding whether MCP servers are app-builder plugins or per-project.
