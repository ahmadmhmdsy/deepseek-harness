# Step 11 — Skill system: catalog, loader, registry

> Status: COMPLETE. Phase alignment: skill-shaped project guidance + discoverable role-specific instructions.

## Headline finding

dsh's skill system is a complete implementation: registry (`ctx.skills`), local filesystem provider (project + user + custom roots, Chokidar-watched), bundled skills (`skill-badge` ships `dsh-badge` by default but is `disabled: true`), and a model-facing `skill` tool with auto-injected catalog. App Builder can ship project-local `SKILL.md` files without building any new infrastructure.

## Packages

| Package | Role |
|---|---|
| `packages/skill/skill` | `SkillRegistry` Service Definition (`ctx.skills`); scope-layered (host + per-scope); `registerProvider`, `snapshot`, `list`, `get`, `register` |
| `packages/skill/skill-filesystem` | Local filesystem provider; scans `<projectRoot>/.dsh/skills`, `<projectRoot>/.agents/skills`, `customSkillDirs`, `<dshHome>/skills`, `<agentsHome>/skills` |
| `packages/skill/skill-badge` | Bundled skill provider (ships `dsh-badge`, an 'official dsh' badge; disabled by default in shipped CLI) |
| `packages/skill/tool-skill` | Model-facing `skill` tool + per-step `skill-catalog` digest |

## Skill discovery roots (rank order)

| Rank | Source | Path |
|---|---|---|
| 100 | `project-dsh` | `<projectRoot>/.dsh/skills` |
| 200 | `project-agents` | `<projectRoot>/.agents/skills` |
| 300 | `custom` | `Config.customSkillDirs` |
| 400 | `user-dsh` | `<dshHome>/skills` (default `~/.dsh/skills`) |
| 500 | `user-agents` | `<agentsHome>/skills` (default `~/.agents/skills`) |

## Skill file format

Two accepted forms: `SKILL.md` (Claude Code-compatible, with YAML frontmatter) or flat Markdown skill files.

## Registry semantics

- **Host + per-scope layered over `dsh-scope`.** Registrations file into the calling context's scope layer — host rows and repository plugins land in the global layer, plugin mounted by an agent preset's standing composition lands in that preset's layer.
- **Reads merge global + viewing scope's chain.** Nearest layer wins a duplicate name outright; rank decides duplicates only within one layer.
- **`register(skill)`** for runtime-embedded skills; **`registerProvider(create)`** for synchronous provider factories.
- **`skills/change`** unfiltered invalidation notification after a provider/runtime contribution registers or disposes. No catalog or diff carried — consumers refetch `snapshot()` with their own lookup options.

## Model-facing `skill` tool

- **Catalog lifecycle.** Every eligible `agent/pre-step`, the plugin calls `ctx.skills.snapshot()` for the calling session's cwd, applies exact `skill` tool visibility, and renders ordered `name` and `description` entries.
- **Initial durable user-role `<system-reminder>`** when no prior catalog exists and the current view is non-empty. Catalog messages contain only those summaries; skill bodies, paths, sources, providers, and `whenToUse` hints remain outside the catalog.
- **`catalogDescriptionMaxLength`** (default 500, min 3) controls normalized catalog descriptions; rendering XML-escapes them.
- **Tool arg:** `name` (exact kebab-case skill name).
- **Returns:** canonical `{ name, provider, resourceBase?, content }` with Native renderer's `<skill_content>`, `<skill_resources>`, `<skill_resources>` blocks.
- **Resource guidance** resolves only paths or URLs explicitly referenced by the instructions.

## Bundled `dsh-badge` skill

The shipped CLI composition includes `skill-badge` as `disabled: true`. Users must explicitly enable its `skill-badge` row before the skill enters a catalog. The provider exposes its packaged `assets/` directory as the skill resource base. `dsh-badge.png` is 726x120 source asset; consumers render at 121x20. Remote Markdown uses Shields.io; use the packaged PNG when the target cannot fetch remote images reliably.

## Plan implications

App Builder can ship:

1. **Per-template skills** at `<projectRoot>/.dsh/skills/<name>/SKILL.md` — auto-discovered when a project is opened. Examples: `scaffolding-nextjs`, `tailwind-setup`, `vercel-deploy`.
2. **Per-step catalog digest** — already auto-injected into the system prompt on every step. The model sees the list of available skills without explicitly asking.
3. **Per-preset skill mounts** — via `agent-presets` composition. An App Builder preset can `ctx.skills.register(skill)` for skills that should be available only when that preset is active.

## Plan mismatches identified (carried to Step 14)

- Plan does not mention the skill system at all. The plan's 'role-specific instructions' framing maps directly to skills; App Builder should ship skills.
- Plan does not mention `skill-badge` is `disabled: true` by default. App Builder must opt in or ship its own.
- Plan does not mention the rank-ordered discovery roots. App Builder's per-project skills go at rank 100 (`.dsh/skills`) — earliest.
- Plan does not mention that catalog messages are scoped to the calling session's cwd. Skill availability is workspace-aware.
- Plan does not mention `catalogDescriptionMaxLength` is a deployment config. Tokens may balloon if left at 500 with verbose descriptions.
- Plan does not mention the `invocation.modelInvocable` and `invocation.userInvocable` flags on each skill. The `skill` tool respects them.
