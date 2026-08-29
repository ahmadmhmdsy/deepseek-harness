# @deepseek-ai/dsh-app-builder-project

[English](README.md) | 中文

App Builder 项目实体：类型化记录 `{ id, name, rootPath, stack, gitUrl, dshProfile, createdAt }`，将同一项目根目录下的会话归组。本包拥有 `ProjectRegistry` Cordis 服务以及 `project/created` session-log 事件。

## API

| 符号 | 类型 | 说明 |
|---|---|---|
| `ProjectRegistry` | 默认导出 | `Service` 子类；以 `ctx.appBuilderProjects` 暴露 |
| `name` | `string` | Cordis 插件名（`app-builder-project`） |
| `inject` | readonly tuple | `['logger']` |
| `Config` | schemastery 模式 | `{ defaultProfile: string }`（默认 `'app-builder'`） |
| `apply(ctx, config)` | 函数 | 插件入口 |
| `Project`、`ProjectId`、`ProjectStack`、`ProjectCreatedEvent`、`CreateProjectInput` | 类型 | 从 `./types.ts` 重新导出 |

### 方法

`await ctx.appBuilderProjects.create({ name, rootPath, stack, gitUrl?, dshProfile? })` 创建一条记录；先经 `path.resolve` + `fs.stat` 规范化路径，发出 `project/created` 后返回记录。

`ctx.appBuilderProjects.list()` 按创建顺序返回全部项目；`get(id)` 取单条记录（找不到为 `undefined`）；`has(id)` 为存在性检查；`listSessionIds(id)` 列出 `cwd` 以项目根目录开头的会话 id（若 `ctx.sessions` 未挂载，返回 `[]`）。

## 事件

| 事件 | 负载 | 触发时机 |
|---|---|---|
| `project/created` | `ProjectCreatedEvent` | 路径校验通过、registry 发布前 |

## Known Limitations and Deferred Work / 已知限制与延后工作

- **仅在内存中。** Phase 1 让 registry 保持在进程内；持久化靠 session-log 的 `project/created` 事件。Phase 2 会用 `dsh-storage-domain` 替换该实现，参考 `WorkspaceRegistry`。
- **`listSessionIds` 当前基于路径前缀。** 尚未与 `ctx.sessionQuery` 联动；下一轮接 SQLite FTS5 以支持「该项目下的会话」模糊查询。
- **多用户隔离**延后至 Phase 3（egress proxy + 每用户 `$DSH_HOME`）。

## Reference / 参考

- [`planning/Phase 1 prompt.md`](../../../planning/Phase%201%20prompt.md) - Phase 1 任务书，第 2 节
- [`packages/workspace/workspace`](../workspace) - 最接近的持久化对应物（Phase 1 在内存中沿用其模式）
