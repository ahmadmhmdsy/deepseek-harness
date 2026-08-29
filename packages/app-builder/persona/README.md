# @deepseek-ai/dsh-app-builder-persona

English | [中文](README.zh.md)

The **App Builder persona plugin**: a thin wrapper around [`@deepseek-ai/dsh-persona`](../../preset/persona) that mounts the App Builder identity as the `deployment:persona` system-prompt section for one agent preset. The plugin exists so the App Builder bundle can patch in a single `app-builder-persona` row and inherit one consistent identity across every preset that uses it.

## API

| Symbol | Kind | Notes |
|---|---|---|
| `apply(ctx, config)` | function plugin | delegates to `@deepseek-ai/dsh-persona`'s `apply`; the canonical prompt-registry integration (scope check, complete mode, runtime-context suppression, HMR-safe disposal) is reused unchanged |
| `Config` | interface | `{ text?, complete?, includeRuntimeContext? }`; `text` defaults to the App Builder identity, the other two forward as-is |
| `name` | `string` | Cordis plugin name (`app-builder-persona`) |
| `inject` | readonly tuple | `['systemPrompt']` |
| `APP_BUILDER_PERSONA` | `string` | re-exported from `./text.ts`; the default persona text |
| `PERSONA_ORDER`, `PERSONA_SECTION` | constants | re-exported from `@deepseek-ai/dsh-persona` |

### Inputs

`Config({ text?, complete?, includeRuntimeContext? })`:

| Field | Type | Notes |
|---|---|---|
| `text` | string | persona prose rendered as the `deployment:persona` section; default is `APP_BUILDER_PERSONA` |
| `complete` | boolean | restore this persona after assembly as the only system-prompt section; default false |
| `includeRuntimeContext` | boolean | include dynamic runtime-context snapshots for this agent scope; default true |

### Defaults

When mounted with an empty `Config`, the plugin applies the `APP_BUILDER_PERSONA` text as the persona section for the mounting context scope. Empty `text` (the `APP_BUILDER_PERSONA` constant reassigned, or an explicit `text: ""` override) still occupies the slot, so it shadows the deployment persona away entirely and then disappears at render.

## Composition

- `@deepseek-ai/dsh-persona` — `apply` and `Config`; the App Builder plugin is a re-mount that defaults the persona text to the App Builder identity.
- `ctx.systemPrompt` — `section` and `suppressRuntimeContext`; the prompt registry owns identity, complete-prompt enforcement, shadowing, and disposal.

The App Builder persona does NOT own event streams or mutable runtime data. The canonical prompt-registry integration does the work; the App Builder plugin only sequences the default text and forwards the optional knobs.

## Model Experience

The persona section renders as one prose block in the system prompt at order 0 (immediately after the harness identity opener). The default text fixes four things for the agent: scope (project scaffolding + iteration, not free-form chat), tools (the App Builder tools plus the existing harness capabilities — `write`, `str_replace_editor`, `bash` — no other tools), loop (one scaffold call per fresh project, dev server through preview not bash, edits through `write` / `str_replace_editor`), and confirmation (the model asks before destructive commands and refuses to scaffold into an existing directory).

Token cost: the default `APP_BUILDER_PERSONA` adds roughly 110 tokens to the system prompt; a verbatim override fixes the size at deployment time. The section is prefix-stable for the life of an agent because the row mounts once, before the agent is published and therefore before its first request, and the text never changes while the agent runs.

KV-cache effect: prefix-stable per agent. Two agents on different presets establish different prefixes from this section onward; neither can invalidate the other's cache reuse.

## Events

The persona plugin emits no events of its own. The model-visible durability is the prompt-registry's `system-prompt/assemble` event; the App Builder persona is one section in the resulting assembly.

## Known Limitations and Deferred Work

- **No global mount.** Mounting this row outside an agent scope collides with the prompt registry's own persona registration and rejects. A deployment-wide persona change belongs in `dsh-system-prompt`'s own config.
- **No template variables in the default text.** The App Builder identity is fixed prose. A Phase 2 follow-up accepts `{{…}}` groups in the deployment override so a deployment can interpolate the model name or product region without forking the plugin.
- **No persona variants per framework.** Phase 1 carries one identity for the whole App Builder MVP; a Phase 2 follow-up splits it into per-template personas (next / vite / unknown) if the model starts confusing the framework-specific guidance.
- **Delegation implies a strict `dsh-persona` peer dependency.** A composition that loads the App Builder persona without `@deepseek-ai/dsh-persona` fails at the import stage; the loader does not currently enforce the peer relationship beyond the package.json declaration.
