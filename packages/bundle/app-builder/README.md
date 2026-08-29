# @deepseek-ai/dsh-app-builder

English | [中文](README.zh.md)

The **App Builder MVP bundle**: a `dsh --profile app-builder` patch layer that mounts the project entity, scaffold/preview tools, and the App Builder persona over the [`@deepseek-ai/dsh-base`](../base/) profile.

## Patch

The bundle's behavior is the [`cordis.patch.yml`](./cordis.patch.yml) file, not a runtime plugin. It registers four rows:

- `app-builder-project` - project entity + projection unit
- `app-builder-scaffold` - scaffold tool (template -> running project)
- `app-builder-preview` - preview tool (start dev server + readiness poll)
- `app-builder-persona` - App Builder coding persona

Each row's plugin package owns its own invariant; the bundle registers an empty manifest (see [src/invariant.ts](./src/invariant.ts)).

## Usage

The bundle is a `dsh --profile` layer. A user profile applies this patch over base:

```yaml
extends: '@deepseek-ai/dsh-app-builder/cordis.patch.yml'
```

## Known Limitations and Deferred Work

- Phase 1 supports a local, single-user loop. Multi-tenant isolation, quotas, and the egress proxy live in Phase 3.
- The bundle assumes `apps/web` is re-skinned for the App Builder on the `app-builder-web-reskin` branch; the classic UI rows remain loadable through `appBuilder.enabled`.
