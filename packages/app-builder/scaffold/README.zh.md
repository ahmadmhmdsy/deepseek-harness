# @deepseek-ai/dsh-app-builder-scaffold

[English](README.md) | 中文

**App Builder 脚手架工具**：一个面向模型的工具，从静态模板（`nextjs-app`、`nextjs-pages`、`svelte-spa`）在当前 session 的沙箱策略工作区根目录下创建一个全新项目，然后可选择地将 `npm install` 作为后台任务启动。

## API

| 符号 | 类型 | 说明 |
|---|---|---|
| `apply(ctx, config)` | 函数插件 | 注册 `app_builder_scaffold` 工具和 `tool:app-builder-scaffold` 系统提示段落 |
| `Config` | schemastery schema | `{ defaultTemplate, defaultNpmInstall }`，带文档化的默认值 |
| `name` | `string` | Cordis 插件名（`app-builder-scaffold`） |
| `inject` | 只读元组 | `['tools', 'fs', 'shell', 'systemPrompt', 'sandboxPolicy', 'agent']`；`ctx.jobs` 通过 `ctx.get()` 读取，因为它是可选的（仅当 `npmInstall !== false` 时需要） |
| `ScaffoldTemplate`、`ScaffoldTemplateDefinition`、`ScaffoldFile`、`ScaffoldToolArgs`、`ScaffoldResult` | 类型 | 从 `./types.ts` 重新导出 |

### 输入

`app_builder_scaffold({ template, name, stack?, features?, cwd?, npmInstall? })`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `template` | 枚举 | `nextjs-app`、`nextjs-pages`、`svelte-spa` 之一 |
| `name` | string | 项目目录名；不含路径分隔符、`.`／`..`、控制字符 |
| `stack` | string | 自由格式的栈提示，记录到项目元数据 |
| `features` | string[] | 自由格式的特性目录，记录到项目元数据 |
| `cwd` | string | 可选显式项目根；必须位于沙箱策略工作区根之内 |
| `npmInstall` | boolean | 写入文件后将 `npm install` 作为后台任务运行（默认 `Config.defaultNpmInstall`） |

### 输出

`{ rootPath, template, files: string[], installJobId?: string }` —— 当 `npmInstall !== false` 时，`installJobId` 是 `ctx.jobs.start` 返回的任务 id。用 `job_output` 读取进度，用 `job_kill` 停止。

### 边界

工具通过 `ctx.sandboxPolicy.resolve({ session })` 解析项目根，并拒绝任何规范形式逃出策略 `workspaceRoot` 的 `cwd`。模板路径在每次写入前都针对 `..` ／ `.` 段进行校验。文件写入走 `ctx.fs.writeText`，由后端承接沙箱策略。

## 组合

- `ctx.fs` — `resolve`、`stat`、`writeText`、`contains`。每个模板文件都通过模型面 `write` ／ `edit` 工具所用的同一条 seam 写入。
- `ctx.shell` — `resolve` + `start`。可选的后台 `npm install` 作为 `ctx.jobs.start` producer 运行；取消和输出读取由 jobs 运行时拥有。
- `ctx.jobs` — `start({ kind, label, owner?, run })`。仅当 `npmInstall !== false` 时需要。
- `ctx.systemPrompt` — 在 order 110 注册 `tool:app-builder-scaffold` 指引段（介于 `tool:bash` order 105 与产品段之间）。
- `ctx.sandboxPolicy` — `resolve({ session })` 提供工作区根和工具透传给文件系统和 shell 的每次调用模式。

脚手架工具不复写文件写入、进程执行或后台任务所有权；它按顺序调用能力并校验模型传入的路径。

## 模板

模板位于 `src/templates.ts`，表现为 `Readonly<Record<ScaffoldTemplate, ScaffoldTemplateDefinition>>`。每个定义列出工具逐字写入的文件（无模板引擎、无变量替换），以及脚手架和预览工具所用的 `installCommand` 和 `devCommand` 数组。

| 模板 | 栈 | 写入的文件 |
|---|---|---|
| `nextjs-app` | Next.js App Router | `package.json`、`tsconfig.json`、`next.config.js`、`app/layout.tsx`、`app/page.tsx` |
| `nextjs-pages` | Next.js Pages Router | `package.json`、`tsconfig.json`、`next.config.js`、`pages/_app.tsx`、`pages/index.tsx` |
| `svelte-spa` | Svelte 5 + Vite | `package.json`、`tsconfig.json`、`vite.config.ts`、`index.html`、`src/main.ts`、`src/app.css`、`src/App.svelte` |

模板把每个依赖固定为 `latest`，以便一次全新的 `npm install` 即可产出可工作的构建。Agent Note `scaffold-plugin` 记录了将模板化（字符串插值、条件文件）推迟到 Phase 2 消费者提出需求时的决定。

## 模型体验

工具描述为一段，列出三种模板、工作区根限制以及 `installJobId` 返回字段。系统提示段告诉模型每个新项目只调用 `app_builder_scaffold` 一次，后续编辑使用 `write` ／ `str_replace_editor`，并通过预览工具（而非 `bash`）启动开发服务器。

每次调用 token 成本：工具 schema 有六个字段（`template`、`name`、`stack`、`features`、`cwd`、`npmInstall`），其中 `template` 和 `name` 必填；`features` 是字符串数组。输出 schema 有四个字段，`files` 是模型可见的写入路径列表。

KV-cache 稳定性：工具描述和参数跨调用保持静态；`defaultNpmInstall` 以字面量默认值进入描述，因此切换默认值的部署会重新按字面量固定描述。

## 事件

脚手架工具本身不发出事件。模型可见的持久性由 `fs/observed`（每次写入一个）和 `job/done`（每个安装一个）提供。Agent Note `scaffold-plugin` 记录了被推迟的 `scaffold/completed` 事件。

## 已知限制与延期工作

- 工具拒绝在已存在的目录中进行脚手架；App Builder 投影单元（Phase 2）才是暴露冲突并提示模型取新名的界面。
- `stack` 和 `features` 按原样记录，但目前不会切换模板；模板化（按栈的依赖固定、条件文件）推迟到 Phase 2 消费者。
- 可选的 `npm install` 不解析其输出（如 `npm install --no-audit --no-fund` 风格）；失败通过 `job_output` 暴露，而不是工具返回值。
- 缺少 `scaffold/completed` session-log 事件；Phase 2 添加一个，以便投影单元能把完成的脚手架与项目注册记录关联起来。
- 工具仅在 `npmInstall !== false` 时要求 `ctx.jobs`；loader 不强制这条关系，因此始终传 `npmInstall: false` 的部署可以在不挂载 `dsh-jobs` 的情况下运行。
