# @deepseek-ai/dsh-app-builder-persona

[English](README.md) | 中文

**App Builder 人设插件**：对 [`@deepseek-ai/dsh-persona`](../../preset/persona) 的薄封装，把 App Builder 身份挂载为某个 agent preset 的 `deployment:persona` 系统提示词段落。该插件让 App Builder bundle 只需插入一个 `app-builder-persona` 行，就能在所有使用它的 preset 中保持一致的身份。

## API

| 符号 | 类型 | 说明 |
|---|---|---|
| `apply(ctx, config)` | 函数插件 | 委派给 `@deepseek-ai/dsh-persona` 的 `apply`；canonical 提示词注册表集成（scope 校验、complete 模式、runtime-context 抑制、HMR 安全释放）原样复用 |
| `Config` | 接口 | `{ text?, complete?, includeRuntimeContext? }`；`text` 默认是 App Builder 身份，另两项原样转发 |
| `name` | `string` | Cordis 插件名（`app-builder-persona`） |
| `inject` | 只读元组 | `['systemPrompt']` |
| `APP_BUILDER_PERSONA` | `string` | 从 `./text.ts` 重新导出；默认人设文本 |
| `PERSONA_ORDER`、`PERSONA_SECTION` | 常量 | 从 `@deepseek-ai/dsh-persona` 重新导出 |

### 输入

`Config({ text?, complete?, includeRuntimeContext? })`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `text` | string | 作为 `deployment:persona` 段落渲染的人设文本；默认是 `APP_BUILDER_PERSONA` |
| `complete` | boolean | 组装后将此人设恢复为唯一的系统提示词段落；默认 false |
| `includeRuntimeContext` | boolean | 为此 agent 作用域包含动态 runtime-context 快照；默认 true |

### 默认值

当以空 `Config` 挂载时，插件会把 `APP_BUILDER_PERSONA` 文本作为挂载上下文作用域的人设段落应用。空 `text`（重新赋值 `APP_BUILDER_PERSONA` 常量，或显式 `text: ""` 覆盖）仍占据该槽位，因此会把部署级人设整个遮蔽掉，然后在渲染时消失。

## 组合

- `@deepseek-ai/dsh-persona` — `apply` 与 `Config`；App Builder 插件是一次重新挂载，把人设文本默认设为 App Builder 身份。
- `ctx.systemPrompt` — `section` 与 `suppressRuntimeContext`；提示词注册表拥有身份、complete-prompt 强制、遮蔽和释放。

App Builder 人设不拥有事件流或可变运行时数据。canonical 提示词注册表集成承担实际工作；App Builder 插件仅按顺序填入默认文本并转发可选开关。

## 模型体验

人设段落在系统提示词中以一段散文的形式在 order 0 渲染（紧接 harness 身份开场白之后）。默认文本为 agent 锁定了四件事：作用域（项目脚手架 + 迭代，而非自由聊天）、工具（App Builder 工具加上现有 harness 能力 —— `write`、`str_replace_editor`、`bash` —— 不引入其它工具）、循环（每个新项目只调用一次 scaffold，开发服务器走 preview 而非 bash，编辑走 `write` ／ `str_replace_editor`）、确认（agent 在破坏性命令前询问用户，并拒绝在已存在的目录中脚手架）。

Token 成本：默认 `APP_BUILDER_PERSONA` 在系统提示词中增加约 110 个 token；字面覆盖则在部署时固定大小。该段落在一个 agent 的整个生命周期内保持前缀稳定，因为本行只挂载一次，发生在 agent 发布之前、因而也在它的首个请求之前，且在 agent 运行期间文本不再改变。

KV-cache 影响：每个 agent 的前缀稳定。两个使用不同 preset 的 agent 从该段落起建立各自不同的前缀，谁都无法让对方失去缓存复用。

## 事件

人设插件本身不发出事件。模型可见的持久性来自提示词注册表的 `system-prompt/assemble` 事件；App Builder 人设只是组装结果中的一段。

## Known Limitations and Deferred Work / 已知限制与延后工作

- **不支持全局挂载。** 在 agent scope 之外挂载本行会与提示词注册表自身的人设注册相撞并被拒绝。要改变部署级人设，应在 `dsh-system-prompt` 自身的配置中修改。
- **默认文本中没有模板变量。** App Builder 身份是固定的散文。Phase 2 后续步骤接受部署覆盖中的 `{{…}}` 组，让部署方能在不分叉插件的情况下插入模型名或产品区域。
- **每个框架不区分人设变体。** Phase 1 整个 App Builder MVP 共享一个身份；Phase 2 后续步骤按模板拆分人设（next ／ vite ／ unknown），前提是模型开始混淆框架特定指引。
- **委派意味着强 `dsh-persona` peer dependency。** 加载 App Builder 人设但未加载 `@deepseek-ai/dsh-persona` 的组合会在 import 阶段失败；loader 当前不会在 package.json 声明之外强制 peer 关系。
