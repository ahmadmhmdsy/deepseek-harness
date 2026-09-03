# @deepseek-ai/dsh-app-builder-project

[English](README.md) | 中文

App Builder 项目实体：类型化记录 `{ id, name, rootPath, stack, gitUrl, dshProfile, createdAt }`，将同一项目根目录下的会话归组。本包拥有 `ProjectRegistry` Cordis 服务、`project/created` session-log 事件，以及 `project` session-projection 单元——把每个会话的 cwd 映射到其所属项目。

## API

| 符号 | 类型 | 说明 |
|---|---|---|
| `ProjectRegistry` | 默认导出 | `Service` 子类；以 `ctx.appBuilderProjects` 暴露 |
| `name` | `string` | Cordis 插件名（`app-builder-project`） |
| `inject` | readonly tuple | `['sessionProjections']` |
| `Config` | schemastery 模式 | `{ defaultProfile: string }`（默认 `'app-builder'`） |
| `apply(ctx, config)` | 函数 | 插件入口；挂载 registry 并注册投影单元 |
| `projectProjectionDefinition` | 命名导出 | `ProjectionDefinition<'project', ProjectState>` |
| `ProjectState`、`ProjectView` | 类型 | 持久化 fold 状态 + 客户端可见值 |
| `Project`、`ProjectId`、`ProjectStack`、`ProjectCreatedEvent`、`CreateProjectInput` | 类型 | 从 `./types.ts` 重新导出 |

### 方法

`await ctx.appBuilderProjects.create({ name, rootPath, stack, gitUrl?, dshProfile? })` 创建一条记录；先经 `path.resolve` + `fs.stat` 规范化路径，发出 `project/created` 后返回记录。

`ctx.appBuilderProjects.list()` 按创建顺序返回全部项目；`get(id)` 取单条记录（找不到为 `undefined`）；`has(id)` 为存在性检查；`listSessionIds(id)` 列出 `cwd` 以项目根目录开头的会话 id（若 `ctx.sessions` 未挂载，返回 `[]`）。

## 投影单元（`project`）

插件在 `ctx.sessionProjections` 上注册一个投影单元，使持久化投影缓存（`@deepseek-ai/dsh-session-projection-cache`，挂载于 `bundle/base`）在节流 write-behind 上 checkpoint 每个会话的 owning-project 关系。

| 字段 | 取值 |
|---|---|
| key | `project` |
| stateVersion | `1` |
| state | `{ owningProjectId: ProjectId \| null, owningProjectName: string \| null, owningProjectRootPath: string \| null }` |
| wire 视图 | `{ owningProjectId: string \| null, owningProjectName: string \| null, owningProjectRootPath: string \| null }` |
| init(header) | 把 `header.cwd` 对 `ctx.appBuilderProjects.list()` 做匹配；选出规范化根为 cwd 目录前缀祖先的第一个项目 |
| apply | state 上的恒等——cwd 在会话创建时设置一次、永不变化，因此每个提交事件都让同一引用穿过（`Object.is` 闸住变更通知） |

读访问：`ctx.sessionProjections.snapshot(session).values.project` 与 `ctx.sessionProjections.stateOf(session, 'project')` 走 live registry；`ctx.sessionProjectionCache.cachedSnapshot(meta)` 走零 IO listing 读。

## 事件

| 事件 | 负载 | 触发时机 |
|---|---|---|
| `project/created` | `ProjectCreatedEvent` | 路径校验通过、registry 发布前 |

## Known Limitations and Deferred Work / 已知限制与延后工作

- **仅在内存中。** Phase 1 让 registry 保持在进程内；持久化靠 session-log 的 `project/created` 事件。Phase 2 会用 `dsh-storage-domain` 替换该实现，参考 `WorkspaceRegistry`。
- **`listSessionIds` 当前基于路径前缀。** 尚未与 `ctx.sessionQuery` 联动；下一轮接 SQLite FTS5 以支持「该项目下的会话」模糊查询。
- **缓存可选。** `project` 投影单元仅在 `@deepseek-ai/dsh-session-projection-cache` 插件挂载时被持久化；未挂载缓存的组合只能通过 live watermark cache 服务投影，没有持久的 `cachedSnapshot` 读。
- **多用户隔离**延后至 Phase 3（egress proxy + 每用户 `$DSH_HOME`）。

## Reference / 参考

- [`planning/Phase 1 prompt.md`](../../../planning/Phase%201%20prompt.md) - Phase 1 任务书，第 2 节
- [`planning/Phase 1.5 prompt.md`](../../../planning/Phase%201.5%20prompt.md) - 子阶段 1.5.4 任务书
- [`planning/Phase 2 prompt.md`](../../../planning/Phase%202%20prompt.md) - 目标形态（本 unit 即 Phase 2 §4，提前于 1.5.4 完成）
- [`packages/workspace/workspace`](../workspace) - 最接近的持久化对应物（Phase 1 在内存中沿用其模式）
- [`packages/session/session-projection-cache`](../../session/session-projection-cache) - checkpoint 该 unit 的缓存
- [`packages/session/session-projection`](../../session/session-projection) - 投影 registry seam
