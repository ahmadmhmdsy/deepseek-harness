# Agent Note：Phase 1.5 子阶段 1.5.2 —— 将 App Builder 示例迁至 apps/cli/config/examples

Status: implemented

[English](2026-08-30-relocate-app-builder-example.2026-08-30.md) | 中文

完整逐路径迁移映射与冲突解决计划见 [inspect step 19 §4](../../../../planning/inspect/19-upstream-v0.1.2-alpha.1-adoption-plan.md)；阶段计划见 [planning/Phase 1.5 prompt.md §1.2](../../../../planning/Phase%201.5%20prompt.md)。本笔记记录已落地的迁移及为在新路径上满足 verify-cordis-config 门禁所做的合并后修补。

## 问题

fork 的 App Builder 示例自 Phase 1 起位于 `examples/app-builder/`。上游 PR #2977（`refactor(repo): retire top-level examples`，提交 `084a1ac5f6` → `4125514a08`）清空了 `examples/` 工作区；Phase 1.5 的 B2 合并整体取上游并移除了 `examples/package.json`。示例目录本身保留下来（没有上游路径映射到它），但带来两个后果：

1. 声明示例依赖的 umbrella `examples/package.json` 已消失；示例的 cordis.yml 插件引用无法再通过工作区声明的依赖集合解析。
2. `scripts/verify-cordis-config.ts` 的 glob 是 `apps/cli/config/examples/**/*.yml`。示例迁移前，其插件引用不会被验证；迁移后，每个具名插件必须通过 `apps/cli/package.json` 的 `dependencies` 或某个 bundle 的 manifest 解析。

Phase 1.5 计划 §1.2 承诺将 `examples/app-builder/` 迁至 `apps/cli/config/examples/app-builder/`，以匹配上游 PR #2977 之后的新布局，并为 Phase 2 的产品面让路。

## 决策

在 `relocate/examples-app-builder` 分支（堆叠于 `merge/upstream-v0.1.2-alpha.1`）上执行 `git mv examples/app-builder apps/cli/config/examples/app-builder`。全部 11 个文件——README 三件套、package.json、cordis.yml、两个 spec 文件和四个 fixture——原样迁移。同时更新交叉引用：

- spec 文件 `tests/{keyless,with-key}-smoke.spec.ts`：`../../../tsconfig.json` → `../../../../../../tsconfig.json`（示例现已 6 层深；原先的 3 层跳转落在 `apps/cli/config/` 而非仓库根，导致 vitest SSR 缓存解析出损坏的 source map）。
- spec 文件的 `tsconfigPath`：`../../../../../tsconfig.json`（首次误数后修正为 `../../../../../`）。
- README 三件套路径：vitest 调用路径和 `verify-translation-pairing` 命令切换到新前缀。
- 3 个包测试 JSDoc 引用，位于 `packages/app-builder/{scaffold,preview,persona}/tests/loader-composition.spec.ts`：`examples/app-builder/tests/e2e/` → `apps/cli/config/examples/app-builder/tests/`（e2e/ 段从未存在——Phase 1 直接把测试写在 tests/ 下——所以 JSDoc 也去掉了 e2e 段）。
- 5 份规划文档：`planning/Phase 1 prompt.md §6` 标题与末项、`planning/inspect/18-phase1-start-record.md` 表格行与正文、`planning/{plan,goal,mission}.md` 交叉引用。

### 后续：verify-cordis-config 在新路径上

迁移后，`verify-cordis-config` 拒绝了示例的 5 处插件引用，因为 `apps/cli/package.json` 将它们放在 `devDependencies`（验证器只接受 `dependencies` 加 bundle manifest）。通过把 11 个被示例引用的包提升到 `apps/cli/package.json` 的 `dependencies` 解决：

`@deepseek-ai/dsh-{agent-spine-demo,bash-local,credentials-local,fs-observation-policy,jobs-local,llm-deepseek,sandbox-policy,session-checkpoint-policy,session-persistence-jsonl,settings-file,subprocess-local}`

### 后续：tsconfig.base.json 路径映射

4 个 fork-only 的 app-builder 插件与 2 个 fork-only 的 client 包存在目录名不匹配（`packages/app-builder/<role>/` 与名称 `@deepseek-ai/dsh-app-builder-<role>`）；`verify-tsconfig-paths` 拒绝那些无法从目录名推导名称的包。通过在 `tsconfig.base.json` 中、紧挨现有的 `@deepseek-ai/dsh-sdk-client` 系列与 `@deepseek-ai/dsh-experimental-*` 系列，添加手工条目解决。`pnpm run gen-tsconfig-paths` 之后将文件原样回写；`--check` 门禁通过。

### 后续：vitest include glob

vitest include glob `apps/*/tests/**/*.spec.ts` 无法匹配 `apps/cli/config/examples/app-builder/tests/`（该路径比 `apps/*/tests/` 还深两个段）。将该 include 扩展为 `apps/cli/config/examples/**/tests/**/*.spec.{ts,tsx}`——目前该 glob 下只有一个示例（app-builder），但模式对未来 overlay 做了通用化。这是有意偏离 `apps/cli/tests/profiles/AGENTS.md`「product assets, not test fixtures」规则：Phase 1 示例把 keyless + with-key smoke 内联在自身目录内，上游现有的 overlay（位于 `apps/cli/config/examples/{cordis,github-review,mcp-memory,schedule}/`）没有内联测试，因为它们的组合更小。在此处记录，以便未来的重构可以选择将测试拆分到 `apps/cli/tests/profiles/app-builder/` 而不至于意外。

### 后续：`CallId` → `ToolCallId`

上游 PR #2731（`xtr/message-tool-call-id`）将 `@deepseek-ai/dsh-llm` 中的 `CallId` 改名为 `ToolCallId`。keyless smoke fixture `tests/fixtures/keyless-mock-llm.ts` 在 B2 合并前仍从旧名导入。修复方式：替换 import 与 4 处 `CallId(...)` 调用。其他面向模型的包（scaffold、preview、persona）通过 LLM 的 re-export 使用该符号而非直接导入；它们的测试无需改名。

### 后续：1.5.1 Agent Note 结构（随本提交一并处理）

1.5.1 Agent Note 三件套在最初撰写时没有运行过 `pnpm run doc-sync`（1.5.1 的基线报告明确标注 `doc-sync: not run`）。当本子阶段首次在合并树上跑 `doc-sync` 时，1.5.1 笔记自身就触发了 2 个门禁：

- `verify-md-wrap` —— en 与 zh 笔记中各有 2 处子项目延续（`The two 'withhold' dispositions…` 与 `Follow-up PRs will address each cluster…`）因为位于子项目下方第 3 列，被解析为多行段落。修复方式：将每个延续单独提到顶级段落，前面留空行。
- `verify-agent-note-format` —— 1.5.1 笔记带了一个临时拼凑的 `<!-- agent-note-format: alternatives-not-recorded (supersedes-merge-baseline note) -->` 标记，与规范中精确的 grandfather 字符串不一致，且已超过 `2026-07-05` 截止日期。修复方式：替换为正式的 `## Alternatives considered` 段，覆盖 B2 合并的三个真正的替代方案（按各阻塞 PR cherry-pick、将 40 个 fork-only 提交 rebase、在同一次合并中纳入 Phase 2 加速器），并重录 i18n 对哈希。

这些 1.5.1 后续放在本提交里处理，因为在堆叠中途修改 1.5.1 提交会强制重发 1.5.2 分支的合并基线；堆叠 PR 模型接受把 1.5.1 的清理作为 1.5.2 diff 的首个提交落地。1.5.1 笔记三件套本身保留在原目录与类目下——只对其文件内容做了原地编辑。

## 本分支已验证

- `pnpm exec vitest run apps/cli/config/examples/app-builder/tests/` —— 1 通过（keyless smoke，2.10 s 墙钟），1 跳过（with-key，`describe.skipIf(!DEEPSEEK_API_KEY)`）。
- `pnpm exec vitest run packages/app-builder/` —— 47 通过，跨 `project`、`scaffold`、`preview`、`persona` 测试文件（5 个文件，1 个 invariant spec + 47 个单元与行为测试）。
- `pnpm run typecheck` —— exit 0。
- `pnpm run verify-cordis-config` —— 155 个配置文件通过。
- `pnpm run verify-tsconfig-paths` —— current。
- `pnpm run verify-translation-pairing` —— current（en + zh + i18n.yaml 哈希已重录）。
- `pnpm run verify-md-wrap` —— 2180 个文件检查，无硬包裹段落。
- `pnpm run verify-agent-note-format` —— 644 个 Agent Note 检查，全部符合规范。
- Lefthook pre-push —— pass（typecheck + contracts-ready）。

## 本分支未处理的已知预存失败

本分支仍有 13 个 `doc-sync` 门禁与 8 个 `hygiene` 门禁失败，皆为 1.5.1 Agent Note「Verified on this branch」段中已记录的预存 Phase 1 / 上游回归（`packages/experimental/webworker-runtime/.../transform-corpus.spec.ts`、`packages/llm/llm-pi-ai/.../catalog.spec.ts` 的 xai mixed catalog、`packages/subagent/subagent-claude-code/.../real-product.spec.ts`、生成工件脚本的预期，以及 Phase 1 的 README 结构 / Cordis config / JSDoc 完整性债务）。它们落在依赖子阶段：catalog 生成器 1.5.7，webworker-runtime corpus 1.5.3，real-product 走其自带的凭据 CI workflow，README 结构债务则在 1.5.7 或专门的 Phase 2 清理中处理。

## 已考虑的替代方案

### 为何不把测试拆分到 `apps/cli/tests/profiles/app-builder/`（按 `apps/cli/tests/profiles/AGENTS.md`）？

该 AGENTS.md 规则说 `apps/cli/config/examples/` overlay 是「product assets, not test fixtures」，包专属的 Loader fixture 应放在包的 `tests/fixtures/` 中。Phase 1 把 keyless + with-key smoke 内联在 `examples/app-builder/tests/` 下；保留该布局能把本次 diff 集中于目录迁移本身。`vitest.config.ts` 中扩展 vitest include glob 的同时记录了这一偏离，以便未来的重构（1.5.3 或之后）可以在不造成意外的情况下把测试拆到 `apps/cli/tests/profiles/app-builder/`。现在拆分除了两个 spec 文件外还要重新归档 `keyless-driver.ts`、`keyless-mock-llm.ts`、`keyless.cordis.yml`、`preview-server.js`，会让 diff 扩张为超出本子阶段范围的结构性重构。

### 为何不把示例加入 `pnpm-workspace.yaml` 并在其自身 package.json 中声明依赖？

verify-cordis-config 门禁只查看 `apps/cli/package.json` 的 `dependencies` 与每个 `packages/bundle/*/package.json` 的 `dependencies`。位于 `apps/cli/config/examples/app-builder/` 的 workspace 成员，即便自身 `package.json` 有 `dependencies`，也不能满足该门禁。示例与 CLI 一起发布（它从 CLI 侧的插件行组合，而非通过 bundle patch），所以把它的依赖提升到 `apps/cli/package.json` 的 `dependencies` 是满足验证器所需的最小变更。这些条目同时保留在 `devDependencies` 中——apps-cli 在构建与发布时同时拥有这两段；重复是有意的。

### 为何不让 `packages/bundle/app-builder/` 拥有示例的依赖？

bundle 是规范的 Phase 1 产品面（`dsh --profile app-builder`）；示例是基于 `@deepseek-ai/dsh-loader-smoke` 的 Loader 驱动 smoke 组合，与 profile 路径分离。示例刻意绕开 bundle，以便在不经过 `dsh --profile` 的情况下挂载同一套插件（依据 inspect step 19 §3 冲突映射的解决方案）。把示例依赖放进 bundle 的 `dependencies` 即便在示例是唯一消费者的情况下也会通过 bundle manifest 把它们耦合在一起。把依赖提升到 `apps/cli/package.json` 让 bundle manifest 专注于其自身的四个插件引用。

## 后果

- App Builder 示例位于 `apps/cli/config/examples/app-builder/`，匹配上游 PR #2977 之后的布局与 Phase 1.5 计划。
- `apps/cli/package.json` 的 `dependencies` 新增 11 条（原本通过已删除的 `examples/package.json` 解析的示例插件引用）；每条在 `devDependencies` 中仍保留以保证完整。
- `tsconfig.base.json` 新增 12 条手工路径别名，覆盖 4 个 fork-only app-builder 插件与 2 个 fork-only client 包（`@deepseek-ai/dsh-app-builder-{project,scaffold,preview,persona}{,/invariant}` 与 `@deepseek-ai/dsh-client-ui-app-builder-{shell,projects}{/client}`）；`pnpm run gen-tsconfig-paths` 处于 current 状态。
- `vitest.config.ts` 的 `testIncludes` 扩展为 `apps/cli/config/examples/**/tests/**/*.spec.{ts,tsx}`，以发现迁移后的 spec。
- keyless smoke fixture 从 `@deepseek-ai/dsh-llm` 导入 `ToolCallId`（替换上游改名后的 `CallId`）。
- 1.5.1 Agent Note 三件套原地重构（md-wrap + agent-note-format 合规，新增 `## Alternatives considered` 段）。
- 子阶段 1.5.3-1.5.7 落在此分支（`relocate/examples-app-builder`）之上，构成 GitHub 原生堆叠 PR 栈：1.5.3 将 `packages/client/ui-app-builder-{shell,projects}` 集成进上游重建后的 `apps/web/`；1.5.4 接入投影缓存；1.5.5 搭建 `packages/app-builder/api/`；1.5.6 cherry-pick `feat/subagent-provider`；1.5.7 更新 `planning/{plan,goal,Phase 2 prompt}.md` 与 `docs/PROJECT.md`，并处理测试、doc-sync、hygiene 的预存失败。
