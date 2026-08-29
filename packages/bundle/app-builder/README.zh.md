# @deepseek-ai/dsh-app-builder

[English](README.md) | 中文

App Builder MVP 包：在 [`@deepseek-ai/dsh-base`](../base/) 之上叠加的 `dsh --profile app-builder` 补丁层，挂载 project entity、scaffold/preview 工具与 App Builder persona。

## 补丁

本包的行为就是 [`cordis.patch.yml`](./cordis.patch.yml) 文件本身，没有运行时插件。它注册四行：

- `app-builder-project` - project 实体 + 投影单元
- `app-builder-scaffold` - scaffold 工具（模板 -> 可运行项目）
- `app-builder-preview` - preview 工具（启动 dev server + 就绪轮询）
- `app-builder-persona` - App Builder 编程 persona

每行的插件包自负责自己的 invariant；本 bundle 在 invariant 注册表里登记一条空记录（见 [src/invariant.ts](./src/invariant.ts)）。

## 使用

本 bundle 是 `dsh --profile` 层。用户 profile 通过以下方式叠加：

```yaml
extends: '@deepseek-ai/dsh-app-builder/cordis.patch.yml'
```

## Known Limitations and Deferred Work / 已知限制与延后工作

- Phase 1 支持本地、单用户循环。多租户隔离、配额、egress proxy 在 Phase 3。
- bundle 假定 `apps/web` 已在 `app-builder-web-reskin` 分支上完成 App Builder 改造；通过 `appBuilder.enabled` 仍可加载经典 UI 行。
