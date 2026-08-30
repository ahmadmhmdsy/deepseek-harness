# Agent Note: App Builder shell 重塑到上游 `apps/web/`

状态：已实现

[English](2026-08-30-app-builder-shell-on-upstream-web.md) | 中文

分支：`apps-web-reskin-on-upstream`（叠加在 `relocate/examples-app-builder` 之上）。

栈位置：1.5.3（位于 1.5.2 之上、1.5.4 之下）。

## Problem

在 B2 合入（1.5.1）之后，上游的 `apps/web/` 是一个包含 183 个文件的 Vite SPA，通过 `@deepseek-ai/dsh-client-web` 的 `AppWebEntry` 启动。fork 中的两个 App Builder 客户端插件（`packages/client/ui-app-builder-shell` 与 `packages/client/ui-app-builder-projects`）在 Phase 1 期间基于过时的 `app-builder-web-reskin` 分支进行了脚手架搭建，但从未真正落地；它们使用了上游的槽位系统契约（`ctx.slots.inject("root", ...)` 链式接管、`PropsRuntime` / `PropsRenderSlots` / `PropsStore` / `InjectFace` 四组 props），但没有接入上游的 `apps/web` host。inspect 步骤 21 的计划（`planning/inspect/21-app-builder-web-shell.md`）要求做端到端的重塑，但只有 chunk 1（shell）和 chunk 2（projects）的交付物真正落地——服务端的快照端点（chunk 5）与项目事件发射（chunk 6）从未实现，因此即便 bundle 补丁接好了插件，projects 面板也只会永远停在空状态。Phase 1.5 / 1.5.3 在一个叠加 PR 内一次性闭合整个重塑：桥接器、bundle 接线、标题更新。

## Decision

**1. 新建 host 包 `packages/app-builder/snapshot-bridge/`**（无客户端半包、无 `dsh.client` 声明）。桥接器订阅两个上游拥有的事件源并将它们投影到一个内存快照中，将其原子化写入 `$DSH_HOME/state/app-builder-snapshot.json`（同目录下先写 `.tmp.<ts>.<pid>` 再 `rename`），并在 `ctx.webServer` 上以 `GET /__dsh/app-builder/snapshot.json`（精确路由）对外提供。

- `inject: ["webServer", "appBuilderProjects"]`——路由承载者与快照要镜像的项目注册表。
- 订阅 `project/created`（由 `@deepseek-ai/dsh-app-builder-project` 在 `registry.projects.set(id, project)` 之后触发）与 `app-builder-preview/dev-state`（preview 工具新增的事件，在 starting / ready / failed 三个转换点各发射一次）。
- 文件写入是 fire-and-forget 但通过链式 `writeQueue` 串行化，保证一连串状态变化以单调顺序落到磁盘（否则两次 fire-and-forget 的 `rename` 可能竞速，旧的可能在 `rename` 步骤覆盖新的）。
- `DSH_HOME` 通过 `launchEnvironmentOf(ctx)` 解析（process env 优先，其次是项目 `.env`，再是用户 `.env`）；若 home 未设置则跳过文件投影——HTTP 路由仍然提供内存中的状态，因此 projects 面板仍然能工作。
- HTTP 路由以 `200 application/json` 返回内存快照。inspect 步骤 21 原本提议在空快照时返回 `503`，但内存缓存在 apply 时跑过一次种子 flush 后 `ts` 必然 `> 0`，`503` 这条分支因此是死代码。空快照（`projects: []`）以 `200` 返回，projects 面板的 `state.error: "snapshot_unconfigured"` 已经把它视作空状态。

**2. Preview 工具改动（`packages/app-builder/preview/src/index.ts`）**：新增 Cordis 的 `Events["app-builder-preview/dev-state"]` 声明，并在每次状态转换时发射一个事件，载荷为 `{ rootPath, framework, status, url?, port?, message?, reason?, sinceMs }`。`status` 取值为 `starting` / `ready` / `failed` 之一。桥接器通过注册表的 `rootPath` 匹配把事件解析为项目 id，并把条目写入 `devServers[projectId]`。`stopped` 转换暂不发射（开发服务器自然退出很少见，将通过 `ctx.jobs.onJobDone` 在后续 PR 中跟踪）。

**3. 项目注册表顺序调整（`packages/app-builder/project/src/index.ts`）**：`create()` 现在在内存 map 中加入项目**之后**才发射 `project/created`。原来的顺序（先发射再加入）是 Phase 1 的内联注释所记录的契约，但 `ctx.on("project/created")` 的监听器一旦调用 `registry.list()`，会因为 `await this.ctx.emit(...)` 自身就排入一个 microtask 而观察到空列表——桥接器中的 `queueMicrotask(flush)` 推迟会在注册表的 `projects.set(...)` 之前先跑，所以快照总投影出空列表。新顺序（先加入后发射）更符合直觉：状态变化之后才发出相应的事件。桥接器的 flush 现在是事件本身的同步响应。

**4. Bundle 注册（`packages/bundle/web-app/`）**：

- `cordis.patch.yml` 在现有的 `insert:` 块中加入三行：
  - `app-builder-snapshot-bridge` → `@deepseek-ai/dsh-app-builder-snapshot-bridge`（host 行，在客户端行之前挂载，使快照端点在 projects 面板开始轮询时已经存活）；
  - `app-builder-shell` → `@deepseek-ai/dsh-client-ui-app-builder-shell`，配置 `config.enabled: true`（链式接管开关，默认 true，false 时保留原有 root 布局不变）；
  - `app-builder-projects` → `@deepseek-ai/dsh-client-ui-app-builder-projects`，配置 `config.snapshotUrl: !!js "/__dsh/app-builder/snapshot.json"`（bundle 自身的 JS 表达式，不是 `cordis.yml` 模板）。
- `package.json` 把这三个包加进 `dependencies`。

**5. 标题（`apps/web/`）**：

- `apps/web/index.html` 静态 `<title>` 改为 `DSH App Builder`。
- `apps/web/vite.config.ts` 中 `DEFAULT_CLIENT_TITLE` 字面量与 `clientDocumentTitle` 插件的替换锚点均改为 `DSH App Builder`。本地构建无需环境变量即可显示 App Builder 构建名；设置 `DSH_CLIENT_TITLE` 时仍能覆盖。

**6. `tsconfig.base.json`**：在 App Builder fork-only 区段（约 244 行）手工写入 `@deepseek-ai/dsh-app-builder-snapshot-bridge → ./packages/app-builder/snapshot-bridge/src`；随后 `gen-tsconfig-paths --check` 确认文件是当前的。

**7. `tsconfig.host.json`**：在 references 中加入 `{ "path": "./packages/app-builder/snapshot-bridge" }`，使 host 聚合类型检查能涵盖新桥接器。

**8. 本 PR 顺手携带的预先存在问题**（阻塞 shell 干净通过类型检查的 Phase 1 遗留问题）：

- `packages/client/ui-app-builder-shell/tsconfig.json` 与 `packages/client/ui-app-builder-projects/tstsconfig.json`：删除失效的 `../runtime` 引用（`packages/client/runtime` 目录仅含 `lib/` 制品，缺少 `src/`、`package.json`、`tsconfig.json`，是上游把 client runtime 合并到 `packages/client/web` 等包之前的过时脚手架）。补上 `../ui-renderer`，使 `ctx.slots` 的 Context merge（由 `ui-renderer/src/client/index.ts` 声明）能进入 shell 与 projects 包。
- 在两个 `src/client/index.ts` 中加入 `import type {} from "@deepseek-ai/dsh-client-ui-renderer/client"`（仅类型的占位导入，把 merge 拉入消费者编译单元；运行期导入图不变，因为基线 externals 已覆盖 `ui-renderer`）。

## Follow-ups

- **快照桥接器的 `stopped` 转换**：在桥接器中为 `app-builder-preview/dev-state` 之外的 `app-builder-preview-dev` 任务加入 `ctx.jobs.onJobDone`；收到终态 `JobSnapshot` 时，把对应 `devServers[projectId].status` 更新为 `stopped`（或依 `snapshot.status` 为 `failed`）。更干净的做法是让 preview 工具的 `run()` 回调在 producer `done` resolve 时再发一个 `app-builder-preview/dev-state`，使桥接器只关心一个事件族。
- **快照轮询节奏与 SSE**：projects 面板当前每 5 秒轮询；Phase 2 / 子阶段 1.5.4 将用 SSE 流替换轮询，使面板即时更新。桥接器的 `SNAPSHOT_URL_PATH` 保持不变；bundle 补丁中的 `snapshotUrl` 变成单个 `/api/events` 通道。
- **按用户划分的 `$DSH_HOME`**：当前快照文件落入共享的 `$DSH_HOME/state/` 目录。Phase 3 的多用户隔离把文件移到用户作用域下的 DSH home。
- **桥接器纳入 per-file 100% 覆盖率门**：桥接器有自己的 `tests/loader-composition-invariant.spec.ts`（2 个用例，通过捕获注册路由的 `FakeWebServer` 进行真实组合）。测试轨道的 `processBoundTests` 列表未包含它，因为桥接器是纯 Node 且文件写入是异步——per-file 100% 门会在 `pnpm run test:coverage` 中拾取它。
- **`apps/web/index.html` 静态标题与 `DSH_CLIENT_TITLE` 环境变量**：静态标题现在是 `DSH App Builder`，使裸 `vite build` 产出的页面能自识别为 App Builder 构建。需要稳定标题的部署仍可通过 `DSH_CLIENT_TITLE` 在构建时覆盖。

## Verified

在 `apps-web-reskin-on-upstream` 分支上跑（相对 1.5.2 基线）：

- `pnpm install`——PASS（lockfile 在净新增依赖后不变）。
- `pnpm run typecheck`——PASS（`build:lib:host` 构建每个 host 包包括新的桥接器；`tsc -b tsconfig.client.json` 构建客户端插件包括 shell + projects）。
- `pnpm run verify-cordis-config`——PASS（155 个配置文件）。
- `pnpm run verify-tsconfig-paths`——PASS（`gen-tsconfig-paths --check` 通过）。
- `pnpm run verify-translation-pairing --write packages/app-builder/snapshot-bridge/README.md`——录入了桥接器 README 配对；后续检查是当前的。
- `pnpm run verify-md-wrap`——PASS（2184 个文件，无硬换行段落）。
- `pnpm run verify-agent-note-format`——PASS（645 个 Agent Note 全部符合格式）。
- `pnpm exec vitest run packages/app-builder/snapshot-bridge/tests/ packages/app-builder/project/tests/ packages/app-builder/preview/tests/ packages/host/webserver/tests/`——36 个用例在 4 个文件中全部通过。
- `pnpm exec vitest run packages/bundle/web-app/tests/`——21 个用例在 4 个文件中全部通过。
- `pnpm --filter @deepseek-ai/dsh-app-builder-snapshot-bridge build`（由 `build:lib:host` 覆盖）。

## Known pre-existing failures

这些已经在 1.5.2 基线（`relocate/examples-app-builder`）上失败，在本分支依然失败；它们并非 1.5.3 引入，已在 1.5.1 Agent Note（`merge-upstream-v0.1.2-alpha.1`）中跟踪：

- `pnpm run verify-translation-pairing`——三个预先存在的双语漂移注释（`2026-06-24-workspace-context.md`、`2026-07-21-follow-instruction-symlinks.md`、`2026-07-21-instruction-load-all-dedup.md`）引用了并不存在的 `2026-08-29-claude-md-operating-system.md`。1.5.7 子阶段会在规划制品落地后重新录入这些配对。
- `pnpm run doc-sync`（CI 拥有）——上游 v0.1.2-alpha.1 合入继承的 13 个预先存在失败；记录在 `planning/inspect/19-upstream-v0.1.2-alpha.1-adoption-plan.md §9` 与 1.5.1 Agent Note 中。
- `pnpm run hygiene`（CI 拥有）——上游 v0.1.2-alpha.1 合入继承的 8 个预先存在失败。
- `pnpm run test:coverage`（CI 拥有）——1.5.1 基线报告 985 / 1005 通过，15 个上游引入的回归文件；其中没有 1.5.3 造成的。
- `pnpm run test:snapshot`（CI 拥有）——本分支未跑；按 AGENTS.md §Run relevant checks locally，CI 拥有平台矩阵。

## Alternatives considered

### 为什么不把快照桥接器推迟到更晚的子阶段？

Phase 1.5 / 1.5.3 简报写道"Update snapshot polling URL to match upstream's apps/web endpoint"。这种措辞假定端点已经存在。inspect 步骤 21 把端点列为 chunk 5（服务端端点）与 chunk 6（项目事件发射）；过时的 `app-builder-web-reskin` 分支从未真正落地它们。没有桥接器，重塑实际上不能工作——projects 面板会永远停在空状态。桥接器本身很小（一个新包，preview 工具三处事件发射，一处 `projects.set` 顺序调整），与 bundle 接线紧密耦合，因此推迟它会把一个单一逻辑变更拆成两个叠加 PR。

### 为什么不把宿主快照写入器拆成单独的包？

inspect 文档建议直接在 `@deepseek-ai/dsh-host-webserver` 中加入路由（"New server snapshot endpoint on `@deepseek-ai/dsh-host-webserver`"）。host 包是一个不认识任何 harness 概念的通用 HTTP 载体；把 App Builder 特定的知识塞进那里会让领域知识渗入传输层。专门的 `packages/app-builder/snapshot-bridge/` 让 `host/webserver` 对 App Builder 一无所知，并允许桥接器拥有自己的状态镜像契约。路由注册走的是与任何其他路由相同的 `ctx.webServer.register({ kind: "exact", path, handler })` API——不需要传输层改动。

### 为什么不通过轮询注册表来代替订阅事件？

对 `registry.list()` 做 `setInterval` 轮询可以在不动注册表的前提下投影注册表，但会漏掉 dev-server 的生命周期（preview 工具不发射任何 `devServers` 镜像）。事件驱动设计是「每个数据源订阅一次」，并且能自然地扩展到 Phase 2 的 SSE。

### 为什么不调整 `Project.create()` 的顺序，而把桥接器 flush 推迟？

桥接器中的 `queueMicrotask(flush)` 会在注册表的 `await this.ctx.emit(...)` 延续之前先跑，所以推迟仍然观察到空列表。最干净的修复就是符合直觉的：状态变化先于通知。新契约在 `Project.create()` 的 JSDoc 中记录；原有注释（"emits a `project/created` event before publishing"）替换为正确的顺序。没有其他插件依赖旧顺序——唯一的其他消费者是 session log，它无论 `projects.set` 何时跑都会记录该事件。

### 为什么不手工写 `tsconfig.base.json` 别名，让 `gen-tsconfig-paths` 自动派生？

`gen-tsconfig-paths` 只生成包名与目录名匹配的别名。`@deepseek-ai/dsh-app-builder-snapshot-bridge` 与 `app-builder/snapshot-bridge`（四个段 vs 两个）不匹配，因此生成器拒绝。已有的 App Builder fork-only 区段（约 234-247 行）出于同样的原因已经承载手工写入的别名——新条目就放在 `dsh-app-builder-persona` 与客户端 shell / projects 别名旁边。

### 为什么不每次键入或每次注册表变更都跑桥接器？

桥接器在每个 `project/created` 事件与每个 `app-builder-preview/dev-state` 事件各 flush 一次。dev-server 生命周期通过这些事件可观察，注册表本身也是事件驱动的，所以桥接器在每次变化时都镜像出一个一致的状态视图。更快的轮询只会消耗 CPU 而不会带来语义收益。

## Consequences

- `pnpm dsh --profile web`（或任何引导 `dsh-bundle-web-app` bundle 的 profile）现在在 `apps/web/` 下提供 3 面板的 App Builder 布局。当 `appBuilder.enabled: true` 时，shell 通过 `ctx.slots.inject("root", ...)` 接管 root 布局；设为 `false` 则保留经典 UI。
- 浏览器 projects 面板通过 bundle 补丁接线的轮询 URL 接收快照；快照端点以 `200 application/json` 返回内存缓存的最新投影（文件写入是尽力而为）。
- 桥接器仅运行在 host 端（无客户端 bundle、无 `dsh.client` 声明）。它通过 bundle 补丁作为普通 Cordis 行挂载；浏览器只能通过 `/__dsh/app-builder/snapshot.json` 的 JSON 看到桥接器。
- Preview 工具现在在每个 dev-server 状态转换时都发射一个 Cordis 事件。桥接器消费该事件；未来的消费者（调试面板、TUI 状态行、bundle-app-builder 自带的 dev-server 列表）都可以订阅，而无需与桥接器耦合。
- `Project.create()` 顺序的变更只能通过 `projects.set` 与 `ctx.emit` 的次序观察到；API 表面（返回值、错误行为、事件载荷）不变。在 `project/created` 事件之后读取 `registry.list()` 的下游消费者现在能看到新项目，这正是契约所规定的。
- 本地 `pnpm dsh web` 启动后页面标题显示"DSH App Builder"；需要稳定标题的 CI e2e lane 在构建时设置 `DSH_CLIENT_TITLE`。