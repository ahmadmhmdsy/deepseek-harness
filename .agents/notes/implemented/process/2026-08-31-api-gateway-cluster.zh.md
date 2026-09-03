# Agent Note: App Builder API 网关 cluster（Phase 1.5 / 1.5.5）

Status: implemented

[English](2026-08-31-api-gateway-cluster.md) | 中文

> Phase 1.5 / 子阶段 1.5.5 — 将上游 `worktree-apire-*` cluster（PR #2911、#2968、#3082、#3083、#3085、#3086、#3217、#3235）作为新的 `packages/app-builder/api/` Typert Remote 服务引入 fork，暴露 `planning/Phase 2 prompt.md §3` 列出的 13 个方法。叠在 `origin/adopt/projection-cache`（1.5.4 HEAD `8a28421e02`）之上。

## 问题

Phase 1（App Builder MVP）发布了 `packages/app-builder/{project,scaffold,preview,persona,snapshot-bridge}` —— 组合模型面工具与持久项目实体的函数插件。Phase 2 要求一个宿主 BFF Typert Remote 表面（13 个方法：项目 CRUD + Session 生命周期 + SSE 事件订阅 + preview + deploy + usage），让 Web 客户端与任何外部网关可以驱动 App Builder 而无需绕经模型往返。fork 缺少该 BFF。

上游 `worktree-apire-*` cluster（PR #2911、#2968、#3082、#3083、#3085、#3086、#3217、#3235）是参考形态；该 cluster 在本 fork 的 master 上尚不存在（1.5.1 已合并 `dsh-v0.1.2-alpha.1` 但 cluster 落在更晚的上游批次）。

## 决策

把 `@deepseek-ai/dsh-app-builder-api` 脚手架成一个 Cordis 服务（`AppBuilderApi extends TypertRemoteService`，命名空间 `appBuilder`），它的 13 个 `@Remote` 装饰方法 1:1 委托给已各自掌握关系的上游服务：

- **项目 CRUD（4 个）**：`listProjects`、`createProject`、`getProject`、`deleteProject` 映射到 `ctx.appBuilderProjects`（Phase 1.5.4 的注册表）。`createProject` 重新实现了模型面 scaffold 工具暴露的模板写入路径，导入同一份 `TEMPLATES` 和 `validateProjectName`，让两侧对模板目录和校验规则保持一致。`deleteProject` 先删目录树，再从注册表删除记录，并为 snapshot bridge 发出 `project/deleted` 事件。
- **Session 生命周期（5 个）**：`startSession`、`sendMessage`、`getTranscript`、`forkSession`、`resumeSession` 转发到上游 `@deepseek-ai/dsh-api-session-controller`（`ctx.sessionController`）。`startSession` 用 `cwd: project.rootPath` 合成一个控制器请求；其余按原样使用控制器。
- **SSE 事件订阅（1 个）**：`subscribeEvents` 是 `@Remote({ mode: "stream" })` 方法，委托给 `ctx.sessionController.follow`。gateway 把 `AsyncIterable` 当作 SSE 传输：一个 snapshot 帧后接无间隙的事件帧。
- **预览（1 个）**：`getPreview` 通过 snapshot bridge 新发布的 `ctx.appBuilderSnapshotBridge` 访问器读取 bridge 的内存状态。当 bridge 未挂载时（不需要项目面板的部署）返回 `status: "unknown"`。
- **Phase 2 延后（2 个）**：`deploy` 和 `getUsage` 返回类型化的 `not-implemented` 失败（Typert `code: "not-implemented"`）。它们在 Phase 2 引入 `@deepseek-ai/dsh-app-builder-deployment` 与 token / 成本核算策略包时落地。

挂载无需 Gateway patch 行：Gateway 在 `ctx.reflect.props` 上查找 `type === "service"` 且 `Reflect.get(original, "typertRemote")`（由 `TypertRemoteService` 构造函数通过 `bindTypertRemote` 设置）的项，自动发现新服务。

## Bundle / composition 影响

- `packages/bundle/app-builder/cordis.patch.yml` 新增 `app-builder-snapshot-bridge`、`app-builder-api`、`api-session-controller`、`api-remotes` 行（后两者是 BFF Session 方法和 SSE 流的必需 peer）。
- `apps/cli/config/examples/app-builder/cordis.yml` 镜像同样四行，使示例 composition 引导完整 BFF。
- `packages/app-builder/scaffold/package.json` 新增 `./templates` 和 `./validate` 导出，让 BFF 复用模型面 scaffold 工具同一份模板目录。
- `packages/app-builder/snapshot-bridge/src/index.ts` 新增 `ctx.appBuilderSnapshotBridge = { snapshot: () => cachedSnapshot }`，让 BFF 在不经过 HTTP 路由的情况下读取 bridge 的内存状态。同时订阅新的 `project/deleted` 事件以同步刷新。
- `packages/app-builder/project/src/index.ts` 新增 `ProjectRegistry.delete(id)` 与 `project/deleted` 事件。projection cache 在下一个强制写入点丢弃该项目对应的 cell。
- `tsconfig.base.json` 新增手写的 `@deepseek-ai/dsh-app-builder-api` 路径别名（包名段数与目录深度不匹配，`gen-tsconfig-paths` 无法自动派生）。
- `scripts/verify-package-readme-model-experience.ts` 新增 `packages/app-builder/api` 到 `NO_MODEL_EXPERIENCE_SECTION`（BFF 转发到上游服务，不做任何模型面渲染）。

## 取代检查

在 `.agents/notes/{implemented,archived}` 中搜索 `projection.cache|projectionCache|projection.unit|project.*projection|owning.*project|xtr/projection`。没有先前的 note 专门覆盖 App Builder 宿主 BFF Typert Remote 表面。下面交叉链接三个最接近的前例；本次 triplet 不取代任何一个。

- `2026-07-27-session-projection-and-command-log.{md,zh.md}`（RFC）—— 前序 PR（1.5.4）将 session-projection 接缝接入 `app-builder/project` 的那条 RFC。1.5.5 的 BFF 通过 `ctx.sessionController`（构建在同一接缝上）消费 `subscribeEvents`；BFF 不会改动接缝。
- `2026-08-19-session-projection-state-and-client-views.{md,zh.md}` —— 实现了 BFF 通过 `sessionController.follow` 读取的 projection 注册表。无冲突。
- `2026-08-06-subagent-list-identity-projection.{md,zh.md}` —— 在 `ctx.sessionProjections` 上添加新 projection unit 的最早前例；1.5.4 依此模式添加了 `project` unit。1.5.5 不新增 projection unit。

## 备选方案

- **把 13 个方法内联到现有的 app-builder 包**（project / scaffold / preview / persona）。拒绝：13 个 Remote 方法跨越 4 个不同关注点，不属于任何一个现有包；与模型面工具混在一起会模糊函数插件与服务的边界（按 `packages/AGENTS.md` 这些现有包是无 default export 的函数插件）。
- **从 Typert `*.remote.ts` schema 生成 BFF** 而非手写 `@Remote` 装饰方法。在 1.5.5 拒绝：typert 生成器（`packages/typert/generator`）处理 wire-codec 故事，但 BFF 的逐方法逻辑不管哪条路径都是逐方法手写；手写形式让逐方法向 `ctx.sessionController` 与 `ctx.appBuilderProjects` 的委托显式可见。Phase 2 若引入更多 remote 再回头评估。
- **`deploy` 与 `getUsage` 用现有服务做尽力实现**（比如用 preview URL 充当 deploy）。拒绝：每个方法都有唯一的语义所有者；假装部署的 stub 比客户端可以显式渲染的类型化 `not-implemented` 失败更糟。

## 后果

- 只要 `@deepseek-ai/dsh-app-builder-api` + `@deepseek-ai/dsh-api-session-controller` + `@deepseek-ai/dsh-api-remotes` 共同安装，13 个方法就挂上了。省略 `session-controller` 的 bundle / composition 仍能看到 BFF 的项目 CRUD 与 preview 方法；Session 方法抛出类型化的 `service-unavailable` 失败（不会出现静默的部分表面）。
- `project/deleted` 是新的 Cordis 事件（在 `app-builder/project` 的 `Context.Events` 上声明）。所有订阅者绑定到注册表插件的同一 fiber；本 PR 中新增的 snapshot-bridge 订阅是当下的唯一首方消费者。
- 被删除项目所属 Session 的 projection 缓存在 Session 重启前保留陈旧的项目归属。session-controller 自有的 `inspect()` 读取最新日志；projection 的 `apply` 是恒等（cwd 不可变约束），所以缓存视图与注册表直到重启前都不一致。在包 README 的 `## 已知限制与延后事项` 中有记录。
- `deleteProject` 不可逆：目录删除非事务化，部分失败会让注册表失去对应目录。在包 README 的 `## 已知限制` 中有记录。
- BFF 的 `appBuilderSnapshotBridge` 依赖是可选的（不需要项目面板的部署可以不带 bridge 运行 BFF；`getPreview` 返回 `status: "unknown"`）。`inject` 只列出两个必需服务。

## 参考

- [`planning/Phase 1.5 prompt.md`](../../../planning/Phase%201.5%20prompt.md) — §1.5 引入 `worktree-apire-*` cluster
- [`planning/Phase 2 prompt.md`](../../../planning/Phase%202%20prompt.md) — §3 API 表面
- [`planning/inspect/19-upstream-v0.1.2-alpha.1-adoption-plan.md`](../../../planning/inspect/19-upstream-v0.1.2-alpha.1-adoption-plan.md) —— 采纳计划参考（未详述 cluster；本 PR 补齐）
- [`packages/app-builder/api/`](../../packages/app-builder/api/) —— 新包
- [`packages/api/session-controller/`](../../packages/api/session-controller/) —— BFF 转发的上游 Remote 服务
- [`packages/app-builder/snapshot-bridge/`](../../packages/app-builder/snapshot-bridge/) —— `getPreview` 方法读取的内存快照
- [`packages/app-builder/project/`](../../packages/app-builder/project/) —— 项目 CRUD 方法包装的持久项目注册表
- `.agents/notes/implemented/architecture/2026-07-27-session-projection-and-command-log.{md,zh.md}` —— 上游 session-controller 所基于的 session-projection 接缝 RFC
- `.agents/notes/implemented/feature/2026-08-19-session-projection-state-and-client-views.{md,zh.md}` —— BFF 通过 `sessionController.follow` 读取的 projection 注册表实现
- `.agents/notes/implemented/feature/2026-08-06-subagent-list-identity-projection.{md,zh.md}` —— 在 `ctx.sessionProjections` 上添加新 projection unit 的最早前例（1.5.4 跟随此模式添加 `project` unit）

## 已存在的失败（与 1.5.5 无关）

- `pnpm run verify-translation-pairing` 报告 3 个 1.5.1 baseline 起就 out-of-sync 的 note：`2026-06-24-workspace-context.md`、`2026-07-21-follow-instruction-symlinks.md`、`2026-07-21-instruction-load-all-dedup.md`。其 `i18n.yaml` 记录与正文漂移；漂移早于本 PR，按 1.5.4 Agent Note 计划落到 1.5.7。
- `pnpm run verify-package-readme-model-experience` 报告 7 个已存在失败，覆盖 `app-builder/{persona,preview,scaffold,snapshot-bridge}`、`bundle/app-builder`、`client/ui-app-builder-{projects,shell}` —— 全部早于 1.5.5（1.5.4 baseline 时模型体验 gate 已对这些失败）。
- `pnpm run verify-package-invariants` 报告 7 个已存在失败，标记 `app-builder/{persona,preview,scaffold,snapshot-bridge}` 与 `bundle/app-builder` 中 `@deepseek-ai/dsh-invariants` peer / devDep 不匹配 —— 全部早于 1.5.5。1.5.5 中对 scaffold 的编辑（新增 `./templates` 和 `./validate` 导出）保留了 1.5.4 package.json 里已有的 dsh-invariants devDep。
- `pnpm run test:coverage`（本地未跑；CI 负责）与 `pnpm run doc-sync` / `pnpm run hygiene`（亦 CI 负责）继承自 1.5.1 的 15 个 coverage 回归 + 13 个 doc-sync + 8 个 hygiene 已存在失败 —— 与 1.5.3、1.5.4 同姿态。
