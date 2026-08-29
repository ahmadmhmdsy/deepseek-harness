# @deepseek-ai/dsh-app-builder-preview

[English](README.md) | 中文

**App Builder 预览工具**：一个面向模型的工具，在后台启动项目开发服务器，在 localhost 上轮询 HTTP 就绪状态，并返回预览 URL 以及一个任务 id，App Builder UI 将该 id 绑定到自身的 iframe 面板。

## API

| 符号 | 类型 | 说明 |
|---|---|---|
| `apply(ctx, config)` | 函数插件 | 注册 `app_builder_preview` 工具和 `tool:app-builder-preview` 系统提示段落 |
| `Config` | schemastery schema | `{ defaultReadyTimeoutMs, defaultPollIntervalMs, frameworkOverride }`，带文档化的默认值 |
| `name` | `string` | Cordis 插件名（`app-builder-preview`） |
| `inject` | 只读元组 | `['tools', 'fs', 'shell', 'systemPrompt', 'sandboxPolicy', 'agent']`；`ctx.jobs` 通过 `ctx.get()` 读取，因为它是可选的 |
| `PreviewFramework`、`PreviewResult`、`PreviewToolArgs`、`ReadinessProbe`、`ReadinessAttempt`、`ReadinessResult` | 类型 | 从 `./types.ts` 和 `./readiness.ts` 重新导出 |
| `detectFramework`、`buildDevCommand`、`pickFreePort` | 辅助函数 | 单元测试覆盖的表面 |

### 输入

`app_builder_preview({ rootPath?, port?, framework?, readyTimeoutMs?, pollIntervalMs? })`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `rootPath` | string | 项目根路径；默认是 session 工作区 cwd。必须留在沙箱策略工作区根之内。 |
| `port` | integer | 要绑定的显式 TCP 端口（范围 1..65535）；默认在 127.0.0.1 上选一个空闲临时端口 |
| `framework` | 枚举 | 框架覆盖（`next` ／ `vite` ／ `unknown`）；默认从 `package.json` 自动检测 |
| `readyTimeoutMs` | number | 轮询超时（毫秒，默认 30000，上限 600000） |
| `pollIntervalMs` | number | 轮询间隔（毫秒，默认 250，限制在 1..5000） |

### 输出

`{ jobId, framework, host: '127.0.0.1', port, url, polls, readyMs }` —— `jobId` 是 `ctx.jobs.start` 返回的任务 id；`url` 是 `http://127.0.0.1:<port>/`。用 `job_output` 读取服务器输出，用 `job_kill` 停止。

### 仅绑定 localhost

空闲端口探测与就绪轮询都指向 `127.0.0.1`。开发服务器不会绑定公网或 LAN 接口；非环回访问需要下游反向代理。框架检测通过 `ctx.fs.readText` 读取项目 `package.json`，不会执行它。

## 组合

- `ctx.fs` — `resolve`、`readText`。用于读取项目 `package.json` 以做框架检测。
- `ctx.shell` — `resolve` + `start`。开发服务器作为 `ctx.jobs.start` producer 运行，包覆 `shell.start`；取消与输出读取由 jobs 运行时拥有。
- `ctx.jobs` — `start({ kind, label, owner?, run })` 与 `kill(id, caller?, reason?)` 用于就绪超时清理。必需，因为开发服务器是长期运行的后台 producer。
- `ctx.systemPrompt` — 在 order 111 注册 `tool:app-builder-preview` 指引段（在脚手架工具段之后）。
- `ctx.sandboxPolicy` — `resolve({ session })` 提供工具拒绝越界的工作区根。

预览工具不复写进程执行、端口分配或 HTTP 轮询这些能力级操作；它按顺序调用能力并校验模型传入的输入。

## 就绪探测

`./readiness.ts` 暴露 `awaitReadiness({ host, port, path?, timeoutMs, pollIntervalMs, signal })`。每次尝试都在自身的 `AbortController` 中运行，因此一个挂起的 socket 不会一次消耗整段 wall-clock 预算；当预算耗尽时返回 `{ ready: false, polls, readyMs }`，当外部信号中止时抛出。

## 框架检测

`detectFramework({ scripts, dependencies, devDependencies })` 在 dev 脚本提到 `next` 或 `next` 是依赖时选 `next`，在提到 `vite` 或 `vite` 是依赖时选 `vite`，否则回退到 `unknown`。`buildDevCommand` 将选择映射为正确的端口参数：`npm exec -- next dev -p <port>`（next）或 `npm exec -- vite --port <port>`（vite）。`unknown` 分支按字面运行 `npm run dev`，并通过 shell 环境将 `PORT` 暴露给脚本。

## 模型体验

工具描述为一段：在后台启动项目开发服务器、返回预览 URL 加上任务 id、在 `http://127.0.0.1:<port>/` 上轮询直到服务器响应（默认 30 秒预算）、从 `package.json` 检测框架（next ／ vite ／ unknown）、仅绑定 localhost。系统提示段告诉模型用预览工具而非 `bash` 处理开发服务器工作，用 `job_output` ／ `job_kill` 监控与停止。

每次调用 token 成本：工具 schema 有五个字段（`rootPath`、`port`、`framework`、`readyTimeoutMs`、`pollIntervalMs`）；都不必填。输出 schema 有七个字段，其中 `framework` 和 `host` 是枚举。

KV-cache 稳定性：工具描述和参数跨调用保持静态；`defaultReadyTimeoutMs` 和 `defaultPollIntervalMs` 以字面量默认值进入描述，因此切换默认值的部署会重新按字面量固定描述。

## 事件

预览工具本身不发出事件。模型可见的持久性由 `job/done`（每个开发服务器生命周期一个）和 `tools/call`（每次就绪探测一个）承载。Agent Note `preview-plugin`（延后到后续步骤）记录了被推迟的 `preview/ready` 事件。

## Known Limitations and Deferred Work / 已知限制与延后工作

- **仅 localhost。** 工具不会绑定非环回接口；非环回访问是部署问题（反向代理），bundle 不承担。
- **框架检测仅覆盖 `next` 与 `vite`。** 运行自定义脚本（例如 `node server.js`）的项目回退到 `npm run dev`，模型必须让 dev 脚本读取 `$PORT` 或 `npm exec --` 参数。
- **无 headless 截图。** Phase 1 只返回 URL；Phase 2 后续步骤在 App Builder UI 需要缩略图时增加可选的 Playwright 截图。
- **缺少 `preview/ready` session-log 事件。** Phase 2 添加一个，以便投影单元能把就绪的预览与 `Project` 记录关联。
- **就绪探测只看连接。** 帮助器在第一次成功的 TCP + HTTP 握手时即停止，无论 HTTP 状态如何；返回 404 的服务器也算就绪，因为开发服务器可能延迟编译页面。
- **空闲端口分配在争用下存在竞态。** 工具立即关闭监听器并把端口交给开发服务器；另一进程可能在空隙中抢到端口。`readyTimeoutMs` 预算界定了最坏情况。
- **开发服务器生命周期不会自动清理。** 当模型 turn 结束或组合销毁时，`ctx.jobs.start` producer 由 jobs 运行时杀死；模型必须调用 `job_kill` 停止当前 turn 内的服务器。
- **工具要求 `ctx.jobs`。** 挂载预览工具但未挂载 jobs 实现的组合无法启动开发服务器；工具会以清晰的错误信息失败，而不是回退到前台进程。
