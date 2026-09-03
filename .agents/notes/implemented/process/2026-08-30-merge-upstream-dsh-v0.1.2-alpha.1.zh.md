# Agent Note：Phase 1.5 子阶段 1.5.1 —— 合并上游 dsh-v0.1.2-alpha.1

Status: implemented

[English](2026-08-30-merge-upstream-dsh-v0.1.2-alpha.1.md) | 中文

完整逐路径冲突映射与后续堆叠见 [inspect step 19](../../../../planning/inspect/19-upstream-v0.1.2-alpha.1-adoption-plan.md)；阶段计划见 [planning/Phase 1.5 prompt.md](../../../../planning/Phase%201.5%20prompt.md)。本笔记记录已落地的合并及其三次合并后修补；各子阶段后续（1.5.2-1.5.6）各自 PR 携带独立 Agent Note。

## 问题

fork 的 master 处于与上游的合并基线 `b150a551b8`，并承载 40 个 fork-only 提交（App Builder MVP 与 CLAUDE.md / Agent Notes 工作）。上游在 `dsh-v0.1.2-alpha.1` 发布之前已推进 1,079 个提交，包含 inspect step 19 冲突映射列出的四个阻塞性变更：

- PR #3074（`worktree/ptc-rename-base`）：将 `code-mode` 重命名为 `ptc`。
- PR #2948（profile unification）。
- PR #2698 → #3054 → #3111（会话格式迁移）。
- PR #2977（停用 `examples/`）。

三个 Phase 2 加速器同样在 tag 之前落地于上游：

- `xtr/projection-per-session-cache`（PR #2781）—— 每会话投影缓存。
- `worktree-apire-*` 簇（PR #2911、#2968、#3082、#3083、#3085、#3086、#3217、#3235）—— API 网关与 Remote 迁移。
- `feat/subagent-provider`（PR #2663）—— `dsh-subagent` provider 缝隙。

不同步的话，每一项都需要 fork 侧重新实现，且 fork 的 1.0 之前打包 pin（`0.1.1-rc.2`）会与上游的发布号持续偏移。

## 决策

以单一合并提交整体落地上游，再在依赖堆叠上重新应用 fork 独有的工作。合并采用 `merge --no-ff upstream/master`；新分支为 `merge/upstream-v0.1.2-alpha.1`（本 fork pre-Phase 2 master 上的提交 `f2e9585b13`）。

### 冲突解决

三方合并暴露 17 个未合并路径（12 个内容冲突加 5 个 `examples/` 下的 modify/delete 冲突）。依据 inspect step 19 §3 冲突映射：

| 路径 | 处理 |
|---|---|
| `AGENTS.md`、`SAFETY.i18n.yaml` | 取上游 |
| `packages/README.{md,zh.md,i18n.yaml}` | 取上游 |
| `packages/session/session-persistence-sqlite/tests/differential.spec.ts` | 取上游 |
| `packages/shell/tool-pwsh-persistent/tests/loader-composition.spec.ts` | 取上游 |
| `scripts/oxlint-contract.spec.ts`、`scripts/rescope-vendor.ts` | 取上游 |
| `examples/{AGENTS.md,CLAUDE.md,README.md,README.zh.md,package.json}` | 取上游（删除我方；PR #2977 停用了 `examples/`） |
| `packages/subagent/subagent/src/child-agent.ts` | 整体取上游 —— 见下文「子代理路由」 |
| `packages/subagent/subagent/tests/child-agent.spec.ts` | 整体取上游 —— 同上 |
| `pnpm-lock.yaml` | 删除并通过 `pnpm install` 按合并后的清单重新生成 |

fork-only 目录 `examples/app-builder/` 不参与任何冲突——保持原位。子阶段 1.5.2 按 Phase 1.5 计划将其迁移至 `apps/cli/config/examples/app-builder/`。

### 子代理路由

inspect step 19 原本计划重新应用 fork-only 提交 `721c1d6fe1`（通过 `parent.session.requestHeader()?.config`，再 `parent.ctx.get('agentDefaultModel')?.currentSelection()`，把派生的子代理路由到父代理的实时模型选择）。该计划未预料到上游 PR #2663 重构会把 `parentAgentOptionsForDelegation` 抽取为从 `packages/subagent/subagent/src/index.ts` 导出、且被 `packages/subagent/tool-subagent/src/index.ts` 消费的公共 helper。上游 helper 已经实现了 `721c1d6fe1` 中的 `requestHeader` 部分。`agentDefaultModel` 部分是唯一 fork 独有的内容，将与子阶段 1.5.6 中 `feat/subagent-provider` 的 cherry-pick 一并落地。

### fork-only 脚手架兼容性（在同一次合并中提交）

Phase 1 的 `packages/client/ui-app-builder-{shell,projects}` 脚手架引用了 `@deepseek-ai/dsh-client-runtime`——一个上游已经移除的包（`refactor(client): migrate consumers and remove Runtime`，`be531688f3`）。重新指向上游当前的归属：

- `ClientContext` ← `import type { Context as ClientContext } from '@deepseek-ai/cordis'`（与其他 client 插件一致；参见 `packages/client/ui-tool/src/client/apply.ts`）。
- `createSnapshotStore`、`defineStore`、`SnapshotStore`、`EngineStoreHandle` ← `import { ... } from '@deepseek-ai/dsh-client-store'`（不带 `/client` 子路径；`store` 是 `docs/subsystems/web-client.md` 中规范的家）。
- `package.json` 的 `peerDependencies` 与 `devDependencies`：`@deepseek-ai/dsh-client-runtime` → `@deepseek-ai/dsh-client-store`。
- `packages/client/ui-app-builder-shell/package.json` 的 `dsh.client.inject`：同样替换。

这些脚手架是临时的——子阶段 1.5.3 会将它们改写为挂载到上游 `apps/web` 宿主上的 slot。本次兼容性修补是让 `pnpm install`、`pnpm run typecheck` 与 5 个门禁在合并树上通过的最小变更。

### 合并后修补

另有两条修复合入后续提交 `515fa46121`：

1. **`packages/llm/llm-pi-ai/src/catalog.ts`** —— 三项上游新增字段未在我们 drift-gate 记录中归类：
   - `CHAT_TEMPLATE_VAR_GATE`：补充 `'thinking.budget': true`（与 `'thinking.enabled'`、`'thinking.effort'` 同列）。
   - `OPENAI_COMPAT_GATE`：补充 `thinkingTokenBudgetField: 'withhold'` —— 目录路由自动承载，profile 不配置。
   - `ANTHROPIC_COMPAT_GATE`：补充 `allowedFallbackModels: 'withhold'` —— 同理。

两条 `'withhold'` 处置是保守默认；待出现 profile 侧用例后再翻为 `'offer'`。

2. **删除 `packages/host/apiproxy/lib/`** —— 171 个被 `.gitignore` 忽略的陈旧构建产物。上游提交 `4f00a8b82a refactor(api): remove ApiProxy package` 已停用该源码包，但工作区未清理其 lib 输出。合并后 `tsdown` 运行期间 `rolldown` 拾取陈旧 emit，对当前源码中根本不存在的符号（`ApiRemoteSessionNotFound`、`createApiRemoteAgentResolver`、`resolveSessionPreset` …）报 `MISSING_EXPORT`。源代码未改动；仅删除了陈旧构件目录。

### 本分支已验证

- `pnpm install` —— 新增 97 个包，移除 9 个（47 s）。
- `pnpm run typecheck` —— exit 0（提交 `515fa46121` 中三条 catalog drift-gate 修正与 apiproxy lib 清理使其通过）。
- `pnpm run test:coverage` —— 1005 个测试文件中 985 个通过（16181 个测试中 16095 个通过）。15 个测试文件失败，21 个测试失败；全部为合并基线与 alpha tag 之间上游引入的回归，并非合并冲突解决或合并后修补造成：
  - `packages/experimental/webworker-runtime/tests/compile/transform-corpus.spec.ts` 引用了 `packages/examples/acp-demo/lib/index.js`（PR #2977 停用）与 `packages/test-support/acp-snapshot/lib/index.js`（上游改名为 `session-snapshot`）；后续 PR 更新 corpus 基线。
  - `packages/llm/llm-pi-ai/tests/catalog.spec.ts`（2 项）期望 pi-ai xai 目录同时提供 `openai-completions` 与 `openai-responses` 模型；xai 目录已改为单 API（`xai no longer ships a mixed catalog`）。
  - `packages/subagent/subagent-claude-code/tests/real-product.spec.ts`（1 项）需要本机安装 Claude Agent SDK；无 key CI 已跳过该分支。
  - `scripts/build-exe-for-python-sdk.spec.ts`、`scripts/doc-standard.spec.ts`、`scripts/gen-client-catalog.spec.ts`、`scripts/gen-third-party-notices.spec.ts`、`scripts/gen-tsconfig-paths.spec.ts`、`scripts/oxlint-contract.spec.ts`、`scripts/test-invariants.spec.ts`、`packages/experimental/webworker-packer/tests/image-loadable.spec.ts`、`packages/typert/generator/tests/{cordis-catalog,tools-catalog,type-model}.spec.ts`、`scripts/client-build-environment.client.spec.ts` —— 每项对合并后生成的工件存在一条断言失败；均为上游测试脚本预期，并非消费方回归。

后续 PR 分别处理各簇（catalog 生成器在 1.5.7，webworker-runtime corpus 在 1.5.3，real-product 走其自带凭据 CI workflow）。
- `pnpm run test:snapshot`、`pnpm run doc-sync`、`pnpm run hygiene` —— 本分支尚未运行。两者都将暴露类似上游回归噪声；交由依赖子阶段 PR 处理。

## 已考虑的替代方案

### 为何不留在 `0.1.1-rc.2` 并 cherry-pick 各阻塞 PR？

四个 BLOCKING 上游 PR（#3074 ptc 改名、#2948 profile 统一、#2698 → #3054 → #3111 会话格式、#2977 停用 examples）位于 1079 个提交的栈上，数百个中间修复是 fork 兼容性的根基。逐一 cherry-pick 会迫使 fork 侧重新实现每个中间修复（例如 #2731 中 pi-ai 的 `CallId` → `ToolCallId` 改名使 Phase 1 keyless smoke 中断直至 fixture 更新；在 cherry-pick 上复现该修复会丢失周围的基建测试）。单次整体合并保留中间上下文，并让 17 个未合并路径的冲突解决由一轮 sweep 完成。

### 为何不将 40 个 fork-only 提交 rebase 到 `upstream/master` 之上？

rebase 会改写 fork 提交 SHA，破坏 Phase 0-1 产出的历史记录（依据 CLAUDE.md「Choose PR history deliberately」：「Rewrites use --force-with-lease, abort on remote movement, never raw --force; preserve an in-progress merge-forward checkpoint before taking a newer base」），并丢失使 17 个冲突解决可审计为单次提交的合并语义。用户出于该原因明确选择了选项 B2（merge --no-ff）而非 B1（rebase）。

### 为何不在同一次合并中纳入 Phase 2 加速器？

投影缓存（`#2781`）、API 网关簇（`worktree-apire-*`）、子代理 provider（`#2663`）每一项都需要 fork 侧接入 App Builder 切片（`packages/app-builder/{project,api,subagent-...}`）。把三者捆入合并提交会让上游采纳与 fork 侧产品代码混淆，使 1079 个提交的评审不可行，并把 Phase 1.5 与 Phase 2 混淆。堆叠 PR 策略（1.5.4-1.5.6）保留审计边界。

## 后果

- fork 重新与上游发布线同步；后续上游补丁将基于 `merge/upstream-v0.1.2-alpha.1` 而非陈旧的 `b150a551b8` 基线。
- Phase 2 加速器（投影缓存、API 网关簇、子代理 provider）已在合并树中，但尚未接入 App Builder 切片。每一项在各自的堆叠子阶段分支（1.5.4、1.5.5、1.5.6）落地，便于评审隔离变更。
- `dsh-client-store` 改名意味着 `packages/runtime-diagnostics/invariants/README.md` 仍历史性地提及 `dsh-client-runtime`（冻结的归档 Agent Note 同样提及）。子阶段 1.5.7 刷新活动 README；归档笔记保持冻结。
- 两个新增 pi-ai 兼容字段的 `'withhold'` 处置是保守的。若 profile 需要设置 `thinkingTokenBudgetField` 或 `allowedFallbackModels`，需要一份小型的后续 Agent Note 将其翻为 `'offer'`。
- 合并位于 `merge/upstream-v0.1.2-alpha.1`。子阶段 1.5.2-1.5.7 在依赖分支上落地（`examples/.../relocation`、`app-builder/web/reskin`、`feature/cache-integration`、`feature/api-gateway-cluster`、`feature/subagent-provider`、`planning/phase-1.5-record`），按 inspect step 19 计划组成 GitHub 原生堆叠 PR 栈。
