# Agent Note: Subagent provider live model routing（Phase 1.5 / 1.5.6）

Status: implemented

[English](2026-09-01-subagent-provider.md) | 中文

> Phase 1.5 / 子阶段 1.5.6 —— 采用上游 PR #2663（`feat/subagent-provider`，`f76a225a7d`），并在其之上重新应用 fork 私有补丁 `721c1d6fe1`（`fix(subagent): route spawned children through parent's live model selection`）。叠在 `origin/adopt/api-gateway-cluster`（1.5.5 HEAD `8994998859`）之上。

## 问题

`planning/Phase 1.5 prompt.md` 的 §1.6 计划要求在 1.5.5 栈之上以字面 cherry-pick 方式引入 PR #2663，再叠加 fork 私有补丁 `721c1d6fe1`。但这两个提交都已经通过 1.5.1 的 `dsh-v0.1.2-alpha.1` 合并链进入 `origin/adopt/api-gateway-cluster`：`f2e9585b`（1.5.1 的合并提交）带入了 PR #2663，`7c23f6d8`（fork 自己的 `fix/subagent-live-routing` PR #1）带入了 `721c1d6fe1`。此时再做一次 `f76a225a7d` 的 cherry-pick 会与 ~100 个文件冲突（i18n.yaml 侧车哈希漂移、1.5.1–1.5.5 期间的 README 改动、snapshot JSONL 漂移、以及 1.5.2 把 `examples/{acp,headless,python-sdk}-agent` 重命名为 `apps/cli/tests/profiles/{acp,headless,sdk}` 这条线），而上游 PR 本身并未触碰其中任何一个。

真正要回答的问题是 fork 补丁里有哪一部分在 1.5.1 合并后存活下来。检视 HEAD 上 `packages/subagent/subagent/src/child-agent.ts` 可知：上游 PR #2663 新增了 `parentAgentOptionsForDelegation(parent: Agent): AgentOptions`，其函数体读取 `parent.session.requestHeader()?.config` 作为 live 路由源，并在没有日志头时回退到 `{ ...parent.options }`（冻结的创建时快照）。这恰好就是 `721c1d6fe1` 当年要加入的 `requestHeader()` live 回退 —— 上游重构吸收了 fork 补丁的核心行为。fork 补丁额外加入的中间层（`ctx.get('agentDefaultModel')?.currentSelection()`）落在 `requestHeader()` 与 `parent.options` 之间，而这一层上游并没有采纳。fork 补丁附带的 `packages/subagent/subagent/tests/child-agent.spec.ts`（10 个测试）也不在 HEAD 的 `tests/child-agent.spec.ts`（4 个测试，全是上游版本）中；为 `dsh-agent-default-model` 跨包增强所需的 tsconfig.json 与 package.json 管道虽然在 HEAD 里，但消费它的函数体不在。

因此在父代理首次记录请求之前被分派的子代理（冷启动，或父代理通过 `/model` UI 切换了 provider 但还没用新路由发过任何请求），会继承 `parent.options`——冻结的创建时快照——而不是 `agentDefaultModel` 服务暴露的 live 默认值。这正是 `721c1d6fe1` 当年要堵的洞。

## 决策

不重做 227 文件的上游 PR cherry-pick，而是在 HEAD 的 `parentAgentOptionsForDelegation` 上把缺失的中间层增量移植上去。改动 `packages/subagent/subagent/` 下三个文件：

- `src/child-agent.ts` —— 新增一条 `@deepseek-ai/dsh-agent-default-model` 的纯类型增强 import（沿用已有的 `@deepseek-ai/dsh-sandbox-policy`、`@deepseek-ai/dsh-user-approval`、`@deepseek-ai/dsh-agent-presets` 同款模式）；重写 `parentAgentOptionsForDelegation`：按字段读取三个 live 源并按优先级合并——`parent.session.requestHeader()?.config`（日志头）> `parent.ctx.get('agentDefaultModel')?.currentSelection()`（live 设置）> `parent.options`（冻结回退）。reasoning effort 是路由绑定字段：当某个 live 源提供了路由，该源的 effort 胜出；没有任何 live 源时保留父代理创建时的 effort；live 源提供了路由但未指定 effort 时，清掉父代理的 effort 让被选模型自行决定默认值。`maxTokens` 是预算而非路由，始终从 `parent.options` 继承。每工具 `agentOptions` 覆盖仍然由下游 `resolveChildAgentOptions` 应用，仍胜出所有继承源。
- `package.json` —— 把 `@deepseek-ai/dsh-agent-default-model` 从 `devDependencies` 移到 `peerDependencies`（它现在通过 `ctx.get` 在运行时被消费，不再只是类型增强），并在 `peerDependenciesMeta` 中加入对应 `optional: true` 项（未挂载 `agentDefaultModel` 服务的精简部署仍可通过 `ctx.get` 文档模式工作）。
- `tests/child-agent.spec.ts` —— 新增 6 个测试覆盖中间层：首次记录请求前 `agentDefaultModel` 的 live 选择；live 源省略 effort 时清掉父代理创建时 effort；日志头优先于 `agentDefaultModel`；两个 live 源都未组合时回退到创建选项；`maxTokens` 始终从 `parent.options` 继承；每工具 `requested` 覆盖仍然胜出。把已有 `parentAgent()` 辅助函数补上返回 `undefined` 的 stub `ctx.get`，让既有 4 个测试继续走老的回退路径。

## Bundle / composition 影响

- `packages/subagent/subagent/package.json` 把 `dsh-agent-default-model` 声明为可选 `peerDependency`。挂载 `@deepseek-ai/dsh-agent-default-model` 的 composition 获得 live 中间层；未挂载的 composition 保留上游回退行为。
- `packages/subagent/subagent/tsconfig.json` 已引用 `../../core/agent-default-model`（这条引用是 `721c1d6fe1` 加的，1.5.1 合并后保留下来；本次移植直接复用）。
- `packages/bundle/*/cordis.patch.yml` 与 `apps/cli/config/examples/*/cordis.yml` 不新增任何行。`@deepseek-ai/dsh-agent-default-model` 服务已在 `code`、`cordis`、`standard` 三个 agent preset（`packages/preset/agent-presets/presets/*/agent.cordis.yml`）中挂载；使用这些 preset 的产品 composition 自动获得 live 回退。

## 取代检查

在 `.agents/notes/{implemented,archived}` 搜索 `parentAgentOptionsForDelegation|resolveChildAgentOptions|agentDefaultModel.*currentSelection|subagent.*live.*model|model-selected.*subagent`。没有活动 note 专门覆盖 `parentAgentOptionsForDelegation` 的 live 级联。下列两条前例覆盖相邻行为，本次 triplet 不取代任何一个。

- `.agents/notes/implemented/feature/2026-08-18-model-selected-subagent-routes.{md,zh.md}` —— 上游 PR #2663 的设计文档。描述 `dsh-tool-subagent` 暴露的 `modelSelectionSettings` 按调用模型选择流程。本次移植加入的中间层 live 回退是它的路由侧对应物：工具的模型选择流程是按调用逃生口；当工具未选路由时，这里的 live 级联就是子代理隐式继承的路由。
- `.agents/notes/implemented/feature/2026-08-24-user-authorized-subagent-model-routes.{md,zh.md}` —— 拥有授权策略（`subagent-model-selection` 设置区块 + `allowedModels` 白名单）。与本次移植独立。

## 备选方案

**字面 cherry-pick `f76a225a7d` 并重做 `721c1d6fe1`。** 拒绝：`f76a225a7d` 已是 HEAD 的祖先，cherry-pick 会因 1.5.1–1.5.5 期间做的上游 PR 没有触及的重构（`examples/{acp,headless,python-sdk}-agent` → `apps/cli/tests/profiles/{acp,headless,sdk}` 重命名；i18n.yaml 侧车哈希漂移；snapshot JSONL 模型输出漂移）产生 ~100 个文件冲突。为重新引入已在 HEAD 中的代码（除中间层增量外）手工解决 ~100 个冲突，是一项多日工作量且误判风险极高。

**把 1.5.6 视为纯验证子阶段、只写文档。** 拒绝：fork 补丁的中间层行为是 `721c1d6fe1` 的文档化动机，纯 no-op PR 让冷启动路由漏洞敞着。规划文档把它定位为采用 PR，不是文档 PR。

**把中间层回退实现成包装器，在调用点（`resolveChildAgentOptions`）覆盖 `parentAgentOptionsForDelegation`。** 拒绝：路由逻辑会在两个函数间重复，且任何新 caller 都必须记得包一层；现有函数已经是「子代理从父代理继承什么」的规范边界。

**把 live 级联拆成新的导出函数 `parentAgentLiveRouting`，与 `parentAgentOptionsForDelegation` 并列，由 `resolveChildAgentOptions` 同时调用。** 拒绝：路由决策被切到两个函数里，契约必须严格同步（任何新增到 `AgentOptions` 的字段都得在两边串起来）。现有函数是继承选项的单一事实源。

## 后果

- 在挂载 `@deepseek-ai/dsh-agent-default-model` 的 composition 下，于父代理首次记录请求前被分派的子代理，现在跟随 live 默认选择——也就是 master 下一次请求会使用的那个模型，而不是父代理冻结的创建时选项。这堵上了 `721c1d6fe1` 当年要修的路由漏洞。
- 在未挂载 `@deepseek-ai/dsh-agent-default-model` 的 composition 下（例如精简 headless bundle），子代理保留上游回退到 `{ ...parent.options }`。向后兼容：现有精简部署行为不变。
- live 选择在分派时读取，不在子代理启动时读取；父代理 `/model` UI 切换对下一个被分派的子代理可见，对已经在飞的子代理不可见。这与 `721c1d6fe1` commit 信息里的 caveat 一致，本次移植未改动。
- 每工具 `agentOptions` 覆盖（`dsh-tool-subagent` 在 `SubagentCapabilities.agentOptions` 为 true 时设置）仍然胜出所有继承源——既通过 `resolveChildAgentOptions` 的 spread，也通过它的路由变更清空 effort 规则。
- `@deepseek-ai/dsh-agent-default-model` 现在是 `dsh-subagent` 的可选 `peerDependency`。未挂载它的 composition 不丢任何现有功能（上游回退仍然工作）；挂载它的 composition 获得中间层 live 回退。
- fork 补丁原始的测试文件（`packages/subagent/subagent/tests/child-agent.spec.ts`，10 个测试）被一个更新版本替换（合计 10 个测试：4 个上游测试 + 6 个新覆盖中间层行为的测试）。`dsh-subagent` 包全部 293 个测试通过（`pnpm exec vitest run packages/subagent/subagent/tests/`）。

## 参考

- [`planning/Phase 1.5 prompt.md`](../../../planning/Phase%201.5%20prompt.md) —— §1.6 采用 `feat/subagent-provider`
- [`planning/inspect/19-upstream-v0.1.2-alpha.1-adoption-plan.md`](../../../planning/inspect/19-upstream-v0.1.2-alpha.1-adoption-plan.md) —— 采用计划参考（未详述 `feat/subagent-provider`；本次移植补上缺口）
- [`packages/subagent/subagent/src/child-agent.ts`](../../../packages/subagent/subagent/src/child-agent.ts) —— `parentAgentOptionsForDelegation`（已移植的函数）+ `resolveChildAgentOptions`（下游消费者）
- [`packages/subagent/subagent/tests/child-agent.spec.ts`](../../../packages/subagent/subagent/tests/child-agent.spec.ts) —— 10 个测试，覆盖上游与移植后的行为
- [`packages/core/agent-default-model/src/index.ts`](../../../packages/core/agent-default-model/src/index.ts) —— `AgentDefaultModelConfig.currentSelection()`（中间层 live 源）
- 上游：PR #2663（`feat/subagent-provider`，`f76a225a7d`）—— 已是 HEAD 的祖先，通过 1.5.1 进入
- Fork：`721c1d6fe1`（`fix(subagent): route spawned children through parent's live model selection`）—— 已是 HEAD 的祖先，通过 7c23f6d8 进入
- `.agents/notes/implemented/feature/2026-08-18-model-selected-subagent-routes.{md,zh.md}` —— 上游 PR #2663 的设计文档（相邻领地；未取代）
- `.agents/notes/implemented/feature/2026-08-24-user-authorized-subagent-model-routes.{md,zh.md}` —— 拥有 `subagent-model-selection` 授权策略（独立）
- `.agents/notes/implemented/process/2026-08-30-merge-upstream-dsh-v0.1.2-alpha.1.{md,zh.md}` —— 1.5.1 合并，把 PR #2663 带入 fork
- `.agents/notes/implemented/process/2026-08-31-api-gateway-cluster.{md,zh.md}` —— 1.5.5；本次的直接下层栈

## 已存在的失败（与 1.5.6 无关）

- `pnpm run verify-translation-pairing` 报告 3 个 1.5.1 基准漂移 note：`2026-06-24-workspace-context.md`、`2026-07-21-follow-instruction-symlinks.md`、`2026-07-21-instruction-load-all-dedup.md`。它们的 `i18n.yaml` 记录与正文不一致；漂移先于本次 PR，按 1.5.4 Agent Note 计划在 1.5.7 解决。
- `pnpm run verify-package-readme-model-experience` 与 `pnpm run verify-package-invariants` 各报告 7 个预存在失败（同一批包：`app-builder/{persona,preview,scaffold,snapshot-bridge}`、`bundle/app-builder`、`client/ui-app-builder-{projects,shell}`）。每一项都先于 1.5.6，在 1.5.7 解决。
- `pnpm run verify-export-jsdoc` 报告 8 个预存在失败，覆盖 `app-builder/{preview,project}` 与 `client/ui-app-builder-{projects,shell}/locales`。先于 1.5.6，在 1.5.7 解决。
- `packages/app-builder/snapshot-bridge/tests/loader-composition-invariant.spec.ts` 在 1.5.5 基准上有 2 个预存在失败。先于 1.5.6，在 1.5.7 解决。
- `pnpm run test:coverage`、`pnpm run test:snapshot`、`pnpm run doc-sync`、`pnpm run hygiene` 各自继承 1.5.1 起的预存在失败——与 1.5.3、1.5.4、1.5.5 同态势。CI 拥有；在 1.5.7 解决。
