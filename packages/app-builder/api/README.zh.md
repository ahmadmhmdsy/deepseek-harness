# @deepseek-ai/dsh-app-builder-api

[English](README.md) | 中文

App Builder 宿主 BFF，作为 Typert Remote 服务。planning/Phase 2 prompt.md §3 列出的 13 个 Remote 方法分为：项目 CRUD（4 个）、Session 生命周期（5 个）、SSE 事件订阅（1 个）、预览（1 个）以及两个 Phase 2 延后的占位（deploy、getUsage）。

## 作用

本包暴露一个 AppBuilderApi Cordis 服务（super(ctx, "appBuilderApi", { namespace: "appBuilder" })），所有方法均以 @Remote 装饰。Gateway 通过 ctx.reflect.props 上的反射自动发现该类，并按各自的载体（unary RPC、SSE 流或 live-control 流）传输每个方法。

每个已实现的 Remote 方法都委托给一个已经在运行时证明自身关系的上游服务：

| 方法 | 模式 | 委托对象 | 备注 |
|---|---|---|---|
| listProjects | unary | ctx.appBuilderProjects | 按创建顺序返回公开形态（id、name、rootPath、stack、gitUrl、dshProfile、createdAt）。 |
| createProject | unary | ctx.appBuilderProjects + scaffold 模板 | 校验 name + stack，逐字写入模板文件，然后注册记录。此处有意不启动 npm install。 |
| getProject | unary | ctx.appBuilderProjects | id 未知时返回类型化的 not-found 失败。 |
| deleteProject | unary | ctx.appBuilderProjects | 先移除目录树（rm -rf），再从注册表中删除记录，并发出 project/deleted 事件给 snapshot bridge。 |
| startSession | unary | ctx.sessionController.create | 用 cwd: project.rootPath 合成控制器请求。 |
| sendMessage | unary | ctx.sessionController.prompt | 转发到控制器的 prompt 方法。 |
| getTranscript | unary | ctx.sessionController.page | 冷读页；跨 Session resume 持久。 |
| forkSession | unary | ctx.sessionController.fork | 锚点 seq 默认取最新。 |
| resumeSession | unary | ctx.sessionController.inspect | 返回 header，但不重新挂载 Agent。 |
| subscribeEvents | stream | ctx.sessionController.follow | 先 yield 一个 snapshot 帧，再 yield 无间隙的事件帧；gateway 将 AsyncIterable 按 SSE 传输。 |
| getPreview | unary | ctx.appBuilderSnapshotBridge（可选） | 读取 bridge 的内存 dev-server状态；bridge 未挂载时返回 status: unknown。 |
| deploy | unary | — | Phase 2 延后。抛出类型化的 not-implemented 失败。 |
| getUsage | unary | — | Phase 2 延后。抛出类型化的 not-implemented 失败。 |

## 必需服务（注入）

| 服务 | 是否必需 | 来源 |
|---|---|---|
| appBuilderProjects | 是 | @deepseek-ai/dsh-app-builder-project |
| sessionController | 是 | @deepseek-ai/dsh-api-session-controller |
| appBuilderSnapshotBridge | 可选 | @deepseek-ai/dsh-app-builder-snapshot-bridge（getPreview 返回真实状态时才需要） |

## 挂载

```yaml
- id: app-builder-api
  name: "@deepseek-ai/dsh-app-builder-api"
- id: api-session-controller
  name: "@deepseek-ai/dsh-api-session-controller"
- id: api-remotes
  name: "@deepseek-ai/dsh-api-remotes"
```

Gateway 自动识别 BFF — 不需要额外的 patch 行或注册步骤。

## 已知限制与延后事项

- deploy 返回 code: not-implemented，因为本 fork 尚未引入 @deepseek-ai/dsh-app-builder-deployment。Phase 2 引入 deployment 包时落地。
- getUsage 返回 code: not-implemented，因为 token / 成本核算策略在 Phase 2 延后（树中尚无 @deepseek-ai/dsh-tool-policy）。
- 被删除项目所属 Session 的 projection 缓存在 Session 重启前保留陈旧的项目归属。session-controller 自有的 inspect() 读取最新日志；projection 的 apply 是恒等（cwd 不可变约束），因此缓存视图与注册表直到重启前都不一致。Phase 2 在 projection 折叠里引入 project/deleted 事件钩子时修复。
- deleteProject 不可逆：目录删除非事务化，部分失败会让注册表失去对应的目录。

## 参考

- planning/Phase 1.5 prompt.md §1.5 — 引入 worktree-apire-* cluster
- planning/Phase 2 prompt.md §3 — API 表面
- packages/api/session-controller/ — BFF 转发的上游 Remote 服务
- packages/app-builder/snapshot-bridge/ — getPreview 方法读取的内存快照
- packages/app-builder/project/ — 项目 CRUD 方法包装的持久项目注册表
