# PROJECT.md — DeepSeek Harness 上的 App Builder

[English](PROJECT.md) | 中文

> 项目架构、数据模型与 API 的真源；agent 必须在开始一个 phase 之前阅读本文，并在行为、schema 或 API 发生变化时同步更新。本文件取代 `planning/PROJECT.md`，后者仅保留为重定向占位。

## 1. Mission

把 DeepSeek Harness（dsh）——已经是可工作的编程 agent harness 开发预览版——改造成自托管、本地优先的 AI 应用构建器：用户输入一句自然语言需求即可得到一个可运行、可预览、可部署的全栈应用。dsh 就是 App Builder；本项目的工作以插件和 bundle 的形式对 dsh 进行扩展，而不是平行再造一个产品。

## 2. Constraints

1. **本地 + 单用户优先。** 每个 seam 的设计都为后续多用户扩展留余地，但不提前实现多用户功能。
2. **通过插件扩展 dsh，绝不 fork。** 锁定 dsh 版本（0.1.1-rc.2）；dsh 经常发布 breaking change 且不接受外部 PR。
3. **安全是系统属性，不是模型属性。** Landlock / bwrap / Seatbelt / Windows-ACL 沙箱、最小权限和审批门禁都是必需的，不是可选的。
4. **绝不把 dsh 的本地 RPC 直接暴露给终端用户。** 控制平面就是认证边界。
5. **所有工作都留在授权 workspace 之内。** 不碰触凭证、家目录配置或其他项目。
6. **把 dsh 的所有 catalog 类门禁视为强制约束。** 每个新包都必须满足 verify-cordis-config、verify-export-jsdoc、verify-package-invariants、verify-tool-catalog、verify-config-catalog、verify-persistence-catalog、verify-module-graph、verify-scoped-events、verify-doc-budgets、verify-doc-site-fragments、verify-runtime-closure、verify-client-packages、verify-node-next-types、verify-md-links、verify-doc-refs 以及 `packages/*/*/src` 下逐文件 100% 覆盖率门禁。

## 3. Architecture

两条平面，复用 dsh 的现有模型：

- **控制平面** —— `apps/web`（当前 GUI 所在）+ 一个新的 `packages/bundle/app-builder`，在 `packages/bundle/base` 之上做 patch。拥有聊天 UI、项目列表、部署状态和预览 iframe。后续的多租户能力都放在这一层。
- **数据平面** —— 每个项目对应一个 dsh 运行时，由 App Builder bundle 驱动。agent 编辑文件、运行 shell、启动开发服务器。开发服务器端口通过反向代理暴露给预览面板。

```
+-----------------------------------------------------+
|  Control Plane  (apps/web + bundle/app-builder)     |
|  Chat UI · Projects · Sessions · Auth · Deploy       |
|  Event log (source of truth) -> session-query FTS5  |
+---------------------------+-------------------------+
                            | REST + SSE (via Typert RPC gateway)
+---------------------------v-------------------------+
|  Data Plane  (dsh runtime per project)               |
|  Per-project sandbox (bwrap > Landlock > Seatbelt)  |
|  dsh session · scaffold · preview · deploy plugins   |
|  Models: V4-Pro (planner) / V4-Flash (worker)        |
+-----------------------------------------------------+
```

### Tech stack（现实版，不是愿景版）

- **Monorepo**＝sh 的 pnpm workspace（`packages/*/*`、`vendor/*`、`native/landlock-run`、`apps/*`、`examples/`、`website`）。
- **构建**：TypeScript 6，tsdown 打包器，两套 TS 编译面（`host` + `client`）。
- **前端**：React 18 + Vite，由 `dsh-host-frontend-static` 提供服务。
- **事件日志**：append-only JSONL + zstandard（zstd）压缩（`@deepseek-ai/dsh-session-persistence-jsonl`）。
- **会话索引**：专用 SQLite FTS5 数据库（`@deepseek-ai/dsh-session-query-sqlite`）。
- **插件框架**：vendored Cordis，位于 `vendor/cordis`。
- **沙箱**：`@deepseek-ai/node-addon-landlock-run`（Linux Landlock）、`@deepseek-ai/dsh-bash-sandbox` + `dsh-pwsh-sandbox` 消费方、`dsh-fs-sandbox` 模式围栏。
- **线协议传输**：JSON-RPC 2.0 over stdio（`@deepseek-ai/dsh-sdk-protocol`）+ Typert RPC HTTP 网关（`@deepseek-ai/dsh-api-gateway` + `dsh-api-remotes`）。

### Model tiering（现实版，不是愿景版）

已经通过 `cordis.yml` 里的 `agents[].provider` + `agents[].model`，或运行时调用 `ctx.agents.installModelSelection()` 按 agent 设定。DeepSeek V4-Pro 与 V4-Flash 由 `@deepseek-ai/dsh-llm-deepseek` 提供。orchestrator/worker 编排使用 `ctx.subagents`（in-process 提供方：spawn、fork、acp、claude-code、codex、dsh-sdk）或 `ctx.workflowEngine`（带类型化 `agent()` hook 的 worker-thread 引擎）。

缓存感知的成本跟踪：`@deepseek-ai/dsh-token-meter` 记录每个 session 的 `prompt_cache_hit_tokens`。Phase 3 在其之上叠加配额。

## 4. Data model

dsh 已有 Session（事件日志）和 Event（仅追加条目）。App Builder 在此之上新增两个一等实体：

| Entity | dsh equivalent | Notes |
| --- | --- | --- |
| User | none | Phase 1/2 使用 `@deepseek-ai/dsh-anonymous-user-id` 的匿名身份；Phase 3 才引入真实认证。 |
| Project | partial —— Session 自带 `cwd` | 新实体，包装一个或多个 session，并附带元数据（name、stack、git_url、dsh_profile）。 |
| Session | `@deepseek-ai/dsh-session` Session | 每个聊天线程一个；事件日志即为真源；`SessionHeader` 携带 cwd / lineage / seedLength / delegationDepth / agentPreset。 |
| Event | `@deepseek-ai/dsh-session` SessionEvent | 闭合联合的事件类型。 |
| Deployment | none | 新增；生命周期事件 `deployment_started/succeeded/failed` 追加到 Session 日志。 |
| ToolPolicy | partial —— `permission-presets` + `sandbox-policy` + `tools/pre-execute` + `tools/guard` | 新增类型化 schema（`@deepseek-ai/dsh-app-builder-tool-policy`）；运行时强制已经存在。 |

### App Builder 用到的所有事件类型（均由 dsh 定义）

`session/created`, `session/disposed`, `turn/start`, `turn/end`, `step/start`, `step/end`, `tool/call`, `tool/result`, `user/message`, `assistant/message`, `assistant/chunk`, `approval/asked`, `approval/decided`, `permissionPresets/preset`, `sandbox/mode`, `command/run`, `command/done`, `session/title`, `session/inbox/spliced`, `agent/created`, `agent/disposed`, `agent/session-start`. App Builder 新增：`deployment/started`, `deployment/succeeded`, `deployment/failed`, `project/created`, `toolPolicy/decision`。

## 5. API

App Builder 的 API 表面挂在 dsh 现有的传输栈上，不是另起一套平行 HTTP 层。

**线协议层**（已存在）：`@deepseek-ai/dsh-sdk-protocol`（JSON-RPC 2.0 over stdio）+ `dsh-sdk-client`（TS）+ Python SDK + ACP server。

**HTTP 层**（App Builder 新增）：位于 `packages/api/gateway` + `packages/api/remotes` 的 Typert RPC 网关对外暴露 App Builder 方法。SSE 是基于既有 `session/projection` push 帧的扩展。

### Endpoints（Typert Remote service `@deepseek-ai/dsh-app-builder-api`）

```
POST   /projects                          create project (spawns dsh sandbox)
GET    /projects                          list projects
GET    /projects/:id                      project + session list
POST   /projects/:id/sessions             start a session
POST   /sessions/:id/messages             send a prompt -> agent
GET    /sessions/:id/events              SSE stream of the live event log
GET    /sessions/:id/transcript           full conversation projection
POST   /sessions/:id/fork                 fork the log into a new session
POST   /sessions/:id/resume               resume a paused session
GET    /projects/:id/preview             current preview URL + screenshot
POST   /projects/:id/deploy               deploy (gated: SAST/SCA/secrets)
GET    /users/:id/usage                   token + cost, cache-aware
```

## 6. Plugin spec (dsh Cordis plugins)

插件就是 Cordis 插件：声明所需服务、注册工具，并跟踪副作用。Service 包默认导出其 service class；函数插件命名导出 `name` / `inject` / `Config` / `apply`，不导出默认。

### Scaffold tool（`@deepseek-ai/dsh-app-builder-scaffold`）

组合 `@deepseek-ai/dsh-tool-fs` + `@deepseek-ai/dsh-tool-str-replace-editor` + `@deepseek-ai/dsh-tool-bash`。入参：`template`、`name`、`stack`、`features`。通过 Zod（schemastery Config）校验。把写入限制在项目的 `cwd` 之内。可选 `npm install` 步骤。

### Preview tool（`@deepseek-ai/dsh-app-builder-preview`）

通过 `dsh-tool-bash` 的 `run_in_background: true` 在空闲端口启动项目开发服务器；等待就绪（HTTP 探活助手——新增）；返回 URL + console tail。可选无头浏览器截图（Playwright 或等价物——新增）。只绑定 localhost。由 `dsh-tool-jobs` 托管后台任务。

### Deploy tool（`@deepseek-ai/dsh-app-builder-deploy`）

`git init -> commit -> push`（或 ZIP 导出）。任何部署动作之前都必须先过**确定性门禁**：SAST（`dsh-tool-bash` 调用内置扫描器）、SCA（依赖审计）、secrets 扫描（grep / pattern 匹配）。通过 `ctx.approval` 取得授权。把 `deployment/{started,succeeded,failed}` 追加到 Session 日志。

### ToolPolicy manifest（`@deepseek-ai/dsh-app-builder-tool-policy`）

类型化 schema：

```ts ignore-check
interface ToolPolicy {
  id: string
  tool: string                      // tool name as registered in ctx.tools
  allow: ('read' | 'write' | 'execute' | 'network' | 'credential')[]
  ask:   ('read' | 'write' | 'execute' | 'network' | 'credential')[]
  scope?: {
    paths?: string[]                 // restricted paths for fs tools
    commands?: string[]              // allowed command prefix list
    hosts?: string[]                 // allowed host:port for network tools
    credentials?: string[]           // declared credential references
  }
}
```

执行器：一个 `tools/pre-execute` 监听器，调用 `ctx.toolPolicy.for(toolName)` 把类型化策略转换为 `PreToolDecision`。回退到 `ctx.permissionPresets.current(events)`。审计：每次决策都生成一条 `toolPolicy/decision` 事件（仅记录）。

**重要**：和 `ctx.tools.restrict()` 一样，这是意图 + 审计，不是授权；真正的授权来自沙箱模式围栏和能力 seam。

### Bundle（`packages/bundle/app-builder`）

新 bundle，在 `packages/bundle/base` 之上做 patch。新增：App Builder persona、新工具（scaffold / preview / deploy / tool-policy）、新实体（project / deployment）作为 Cordis 插件、API 挂载点、web UI 钩子。提供 `cordis.patch.yml`，引用所有新包。选择 `app-builder` profile 的 profile 会在 base 之上叠加本 bundle。

## 7. Security & guardrails（现实版，不是愿景版）

- **每个 tool 的最小权限**通过既有的 `tools/pre-execute` + `tools/guard` 流水线落地；新增 ToolPolicy 包只是在之上多加一层类型化 schema。
- **三模式沙箱词汇表**（`read-only | workspace-write | danger-full-access`）是规范的授权边界；App Builder 通过 `@deepseek-ai/dsh-sandbox-policy` 按项目强制。
- **沙箱提供方**由 `@deepseek-ai/dsh-sandbox-local` 选择：bwrap > Landlock > Seatbelt > Windows ACL。**失败即关闭**：绝不静默回退到非受限模式。
- **Landlock 二进制**（`@deepseek-ai/node-addon-landlock-run`）静态链接 musl；不允许用环境变量切换哪个二进制负责沙箱；也没有安装期构建回退。
- **带凭证的 web 请求在真正接触远端前就拒绝重定向**（按 `packages/web/AGENTS.md` 规则使用 `redirect: 'error'`）；匿名 fetch 在同一源内最多跟随 5 跳重定向。
- **Web fetch 的 SSRF**：`@deepseek-ai/dsh-web-fetch-http` 明确不防 SSRF。App Builder 的部署必须挂在出口代理之后（Phase 3）。
- **所有工具输出在通过工具声明的输出 schema（`ctx.tools.register`）校验之前都属于未受信任的模型输出**；`dsh-tool-fs-observation-policy` 增加读-改-写前的读取校验。
- **部署前的确定性门禁**：SAST、SCA、secrets 扫描在 push 之前必须通过。
- **为每个循环设上限**：`dsh-tool-call-timeout-policy` + `dsh-repeat-tool-reminder`；Phase 3 再叠加 `dsh-app-builder-quota`。
- **未经清单与评审绝不安装插件 / skill / MCP server**（按根 AGENTS.md）。
- **人类审批**用于部署、凭证变更、破坏性操作。

## 8. Phases（修订后贴合现实）

### Phase 0 —— 验收门禁，不写新代码（0.5 天）

- 锁定 dsh 版本（`0.1.1-rc.2`）；记录发版节奏。
- 校验 Node 22.19+ + pnpm 11.7.0。
- 在 `DEEPSEEK_API_KEY` 存在时执行 `pnpm dsh --profile headless 'create a hello-world app'`，捕获产生的 JSONL。
- 执行 `pnpm run doc-sync` + `pnpm run hygiene` 确认当前树上零门禁失败。
- 把本文件从 `planning/PROJECT.md` 重定位到 `docs/PROJECT.md`（已完成）。
- 决定 bundle 位置：`packages/bundle/app-builder/`（推荐）。

### Phase 1 —— App Builder MVP（1–2 周）

目标：提示词 → 运行中的应用 + 实时预览，本地、无认证。

- 新 bundle `packages/bundle/app-builder/cordis.patch.yml`，叠加在 `base` 之上。
- `packages/app-builder/` 下的新包：
  - `dsh-app-builder-project`（Project 实体 + projection unit）。
  - `dsh-app-builder-scaffold`（~150 LOC；组合 fs + bash + str-replace-editor）。
  - `dsh-app-builder-preview`（探活 + 无头截图；组合 bash + jobs）。
  - `dsh-app-builder-persona`（通过 `dsh-persona` 实现的 App Builder persona）。
- 新示例 `examples/app-builder/`：
  - `cordis.yml` + `cordis.snapshot.yml`。
  - `tests/e2e/keyless-smoke.spec.ts`（通过 `dsh-loader-smoke` 启动）。
  - `tests/e2e/with-key-smoke.spec.ts`（发送真实提示词，验证 scaffold + preview）。
- 把 `apps/web` 改成展示 App Builder UI（项目列表 + 聊天 + 预览 iframe）。
- Snapshot 场景：`cordis.yml`、`scaffold-hello-world`、`preview-dev-server`、`preview-iterate`。
- Agent Note：每个非平凡包都要一篇。

### Phase 2 —— 产品化控制平面（2–4 周）

目标：把 dsh 包成真正的产品形态，仍是单用户，但具备规模化的能力。

- 新增 `packages/app-builder/deployment`（Deployment 实体 + `deploy` 工具 + SAST / SCA / secrets 门禁）。
- 新增 `packages/app-builder/tool-policy`（类型化 `ToolPolicy` schema + `tools/pre-execute` 监听器）。
- 新增 `packages/app-builder/api`（Typert Remote service：REST + SSE）。
- 通过既有的 `dsh-api-gateway` + `dsh-api-remotes` 挂载该 API。
- 增加 `Project` projection unit + 用于项目列表面板的 projection 缓存。
- 更新 `apps/web`，加入项目列表、部署状态面板、用 `EventSource` 推送实时更新的预览 iframe。
- Snapshot 场景：`deploy-local`、`tool-policy-allow`、`tool-policy-deny`、`api-list-projects`。

### Phase 3 —— 多用户规模化（2–4 周）

目标：一份部署支撑多个隔离租户。

- 新增 `packages/app-builder/auth`（控制平面认证边界）。
- 新增 `packages/app-builder/egress-proxy`（按项目的 HTTP 出口 + 限速；必需，因为 Landlock 不能限制网络）。
- 新增 `packages/app-builder/quota`（按用户的 token / 成本 / 重试 / 会话预算）。
- 为每个项目拉起独立的 dsh worker 进程（一个项目一个进程）。
- 在存储层做按用户的内存分区。
- 通过 `dsh-host-apiproxy` 做按项目的预览代理。
- 部署路径加一道审批门。
- Snapshot 场景：`multi-tenant-isolation`、`quota-enforced`、`deploy-gated`。

## 9. Definition of done（按 phase）

- **Phase 0**：版本锁定；hello-world 提示词跑通；`pnpm run doc-sync` 干净；本文档已重定位。
- **Phase 1**：提示词 → scaffold → run → preview → 迭代 → resume 在本地沙箱里跑通。
- **Phase 2**：完整的聊天循环、事件溯源的 session、ToolPolicy 强制、带门禁的部署路径、REST + SSE API。
- **Phase 3**：隔离的多租户沙箱、配额、带审批的部署、可审计。

## 10. Testing & evaluation

按 `docs/testing.md`：

- **单测**：`pnpm run test`（vitest 跑包内 `tests/**` + `scripts/**/*.spec.ts`）。
- **覆盖率门禁**：`pnpm run test:coverage`（`packages/*/*/src` 下逐文件 100%）。
- **真实 API e2e**：`pnpm run test:e2e`（无 `DEEPSEEK_API_KEY` 时自动 skip）。
- **Snapshot**：`pnpm run test:snapshot`（ACP + headless JSONL 场景）。
- **Web 浏览器 snapshot**：`pnpm run test:web`（Chromium 对比回放出的浏览器输出；Linux PR 门禁）。
- **Doc sync**：`pnpm run doc-sync`。
- **Hygiene**：`pnpm run hygiene`（knip + publint + workspace constraints + NodeNext 消费方检查）。

每个包的不变量：

- 真实组合测试（由 Loader 驱动的 `cordis.yml` 启动，而不是单元 mock）。
- 每个非平凡的、模型可见或产品用户可见的变更都要带 snapshot 测试。
- 每个非平凡变更都要带 Agent Note（仅机械 / 局部编辑豁免）。
- 双语文档（zh.md + i18n.yaml）。
- 每个包都要有 `./invariant` 伴随文件（注册 manifest 名 + 事件 / 数据关系校验）。

### Adversarial test suite

- Prompt 注入（绕过 ToolPolicy 的模型输入）。
- 通过 symlink 的 TOCTOU（fs-sandbox 与 bash-sandbox 之间漂移）。
- 重定向走私（带凭证的 web 提供方）。
- 资源耗尽（无界循环、缺失 timeout-policy）。
- 成本失控（Phase 3 的 quota 包）。

## 11. Decisions

以下决策已敲定。带迁移代价的决策附上再评估触发条件。

| Question | Decision | Re-evaluation trigger |
|---|---|---|
| Workspace group | 新增组 `packages/app-builder/`（位于 `packages/` 下）。 | 无 —— 与现有组正交。 |
| API style | Typert RPC + JSON-RPC。控制平面通过 Typert Remote service 暴露 REST + SSE endpoint；底层传输是 JSON-RPC 2.0 over stdio + Typert RPC 网关。 | 如果 App Builder 需要浏览器原生 WebSocket（而非 SSE），在不破坏 JSON-RPC 客户端的前提下，通过既有的 `packages/api/remotes` 机制增加 WebSocket 传输。 |
| UI shell | 用 git 分支（不要永久保留 workspace 副本）。开始重写之前先打 tag `apps-web-classic-pre-app-builder`。重写在 feature 分支上做；tag 就是安全网。 | 如果 App Builder UI 需要和经典 UI 共存几周以做分阶段上线，可以复制 `apps/web` 到 `apps/app-builder-web`（方案 B），并附 deprecation 时间表：Phase 2 把 `apps/web` 改名为 `apps/web-classic`；Phase 3 删除。 |
| Headless driver | `pnpm dsh --profile headless`（既有 dsh headless profile）。App Builder 的自动化测试 + 非交互流程都走这条路径；`examples/headless-agent` 是规范示例。 | 无 —— 已经发布。 |
| Egress proxy（Phase 3）| `packages/app-builder/egress-proxy/` 下的小型 Node 代理。复用 dsh 原语：`ctx.sessionQuery` 拿 allow-list 快照、`dsh-token-meter` 做限速桶、`dsh-host-apiproxy` 作为参考实现。审计日志走 dsh 事件日志。 | 出现以下任一情况时迁移到外部 Squid：(a) 代理需要做 TLS 终止；(b) 需要 ICAP 内容扫描（secrets / DLP）；(c) 代理本身成为吞吐瓶颈；(d) 合规要求强制 Squid 作为唯一允许的出口。迁移成本：把 Node 服务替换为 Squid 配置；allow-list 存储 + 限速逻辑留在 dsh 作为控制平面 API，由 Squid 通过 `external_acl_type` 调用；审计日志仍留在 dsh。 |
| Quota package（Phase 3）| 在 `packages/app-builder/quota/` 里包装并扩展 `@deepseek-ai/dsh-token-meter`。包装层不是被动观察者，而是 `tools/post-execute` 监听器，同步调用 `meter.record(...)` + `checkBudget(...)`。dsh-token-meter 负责记账，包装层负责执行（预算、告警、硬停止）。 | 如果 `dsh-token-meter` 的 API 不能满足 App Builder 的预算组合需求（例如按 tool 的 token 记账），就重新评估：要么在上游扩展 dsh-token-meter，要么让 quota 包自己拥有记账。 |

本表的每项决策都对应到相关 Phase 提示词（Phase 1 prompt / Phase 2 prompt / Phase 3 prompt）。当某项决策变化时，请在同一次改动里同时更新本表和对应提示词。

## 12. Inspect artifacts

本计划的逐步检视结论位于 `planning/inspect/01..17-*.md` + `SUMMARY.md` + `INDEX.md`。检视过程中识别的所有 plan 与现实不符项都汇总在 `planning/inspect/14-gap-analysis.md`。

## 13. Phase 0 验收状态

Phase 0（无新代码的验收门）**带说明通过**。证据与逐项结论在 [`planning/inspect/17-phase0-acceptance-results.md`](../planning/inspect/17-phase0-acceptance-results.md)；内联摘要附在 [`planning/Phase 0 prompt.md`](../planning/Phase%200%20prompt.md) 末尾。

- **版本固定**：`0.1.1-rc.2`，所有 workspace 包共享同一版本。
- **Hello-world smoke**：未设置 `DEEPSEEK_API_KEY` 时自跳过（CLI 引导出 mock fallback，agent 用澄清问题回应——门未失败）。
- **各门**：`pnpm install` PASS；`pnpm run build` PASS；`pnpm run typecheck` PASS；`pnpm run hygiene` PASS 13/13，97.81s（需要 `NODE_OPTIONS=--max-old-space-size=8192`）；`pnpm run doc-sync` PASS 28/28，179.45s。
- **`docs/PROJECT.md` 即规范来源**，附中文配对；`planning/PROJECT.md` 为重定向。
- **Git 锚点**：tag `apps-web-classic-pre-app-builder` 固定 Phase 1 UI 重皮前状态；branch `app-builder-web-reskin` 承载 Phase 1 UI 重皮。
- **Path B 收尾**：范围内的 flake 类别已清掉，并按更新后的 [`2026-08-28-rescope-marker-cleanup`](../.agents/notes/implemented/process/2026-08-28-rescope-marker-cleanup.zh.md) 删除两条陈旧 `rescope-vendor` marker。四项测试修复 + path B 破修复位于 [`2026-08-29-windows-test-flake-fixes`](../.agents/notes/implemented/process/2026-08-29-windows-test-flake-fixes.zh.md)。

`pnpm run test` 剩余失败（8 个，位于 3 个文件，全部按 [`planning/inspect/15-phase0-pre-existing-failures.md §6.7`](../planning/inspect/15-phase0-pre-existing-failures.md) 视为超出范围）：

| 数量 | 文件 | 类别 | 建议修复 |
|---|---|---|---|
| 6 | `packages/sandbox/sandbox-windows-acl/tests/runner.spec.ts` | 环境性（resolver 标准位置未安装 PowerShell 7） | 在 `C:\Program Files\PowerShell\7\pwsh.exe` 安装 PowerShell 7 |
| 1 | `packages/shell/pwsh-sandbox/tests/sandbox.spec.ts > wraps the exact pwsh argv` | 同根因 | 同上，或一行正则放宽 |
| 1 | `scripts/change-scope.spec.ts > renders deterministic versioned JSON` | 间歇 contention flake（孤立运行通过） | 重试；若确定失败，参考 path B 模式 |

用户需做出验收决策：把这 8 个超出范围失败视为 Phase 0 不阻塞项，进入 Phase 1；或者先安装 PowerShell 7 清掉 7 个环境失败，再开始 Phase 1。
