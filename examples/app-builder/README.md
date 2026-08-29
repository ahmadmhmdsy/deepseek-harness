# app-builder

English | [中文](README.zh.md)

This directory owns the App Builder MVP composition: it inlines the three runtime App Builder plugins (project registry, scaffold, preview) on top of the standard coding-agent plugin stack and mounts the App Builder persona through the agent spine's `persona` config field. It is a runnable demo and test composition, not a product entry point.

## Run it

egin{sh}
# repo root .env (gitignored) or exported env:
#   DEEPSEEK_API_KEY=sk-…
#   DEEPSEEK_BASE_URL=https://…   # optional; defaults to the public API
pnpm exec vitest run examples/app-builder/tests/keyless-smoke.spec.ts
pnpm exec vitest run examples/app-builder/tests/with-key-smoke.spec.ts   # skips without DEEPSEEK_API_KEY
end{sh}

The keyless smoke boots the real `cordis.yml` through the Loader with a mock LLM adapter, drives the model through a four-turn fixture (scaffold → read → write → final text), and asserts that the scaffold tool wrote template files and the follow-up `write` call overrode the dev script. The with-key twin runs the same composition against the real DeepSeek adapter and asks the agent to scaffold a fresh project then start a preview dev server.

## Composition shape

The leaf `cordis.yml` inlines the three runtime App Builder plugins; the bundle package `@deepseek-ai/dsh-app-builder` ships a `cordis.patch.yml` consumed by the profile launcher, but the bundle JS plugin is intentionally a no-op so direct `cordis.yml` compositions can mount the same plugin set without going through `dsh --profile`. The persona plugin is scope-only (it would collide with the system-prompt deployment persona), so this composition pulls `APP_BUILDER_PERSONA` out of `@deepseek-ai/dsh-app-builder-persona/text` via `createRequire` and pins it on `agent-spine.config.persona`; the keyless + with-key snapshots override that field with their own text via `cordis-plugin-include.patches`.

## Load order

`agent-spine-demo` loads before the three App Builder plugins because the App Builder plugins inject `agents` (the `AgentRegistry` service) and the registry must be published first. `sandbox-policy` runs in `workspace-write` mode so the scaffold tool can create the project directory and the preview tool can read the project `package.json`; `fs-observation-policy` is mounted so model-driven `write` /`edit` calls in the same turn accept the scaffold's writes as the CAS basis.

## Fixtures

[`tests/fixtures/keyless-driver.ts`](tests/fixtures/keyless-driver.ts) is the unexported test-only driver that boots the Loader, runs one fixture turn, and streams canonical session events as JSONL before the result envelope. [`tests/fixtures/keyless-mock-llm.ts`](tests/fixtures/keyless-mock-llm.ts) implements a four-step mock adapter (scaffold a Svelte SPA without `npmInstall`, read the generated `package.json`, overwrite the dev script to point at the bundled Node preview server, finish with a smoke marker); [`tests/fixtures/preview-server.js`](tests/fixtures/preview-server.js) is the Node-only static HTTP server the preview tool boots when `framework: 'unknown'` runs `npm run dev` verbatim. [`tests/fixtures/keyless.cordis.yml`](tests/fixtures/keyless.cordis.yml) is the keyless config overlay that disables the real DeepSeek adapter, pins the agent to the mock adapter, and swaps in the keyless persona text.
