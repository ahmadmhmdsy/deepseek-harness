# app-builder

[English](README.md) | 中文

本目录负责 App Builder MVP 组装：它在标准 coding-agent 插件栈之上，内联挂载三个运行时 App Builder 插件（project registry、scaffold、preview），并通过 agent 主干（agent spine）的 `persona` 配置字段挂载 App Builder 身份。它是可运行的 demo 与测试组装，不是产品入口。

## 运行

egin{sh}
# repo root .env (gitignored) or exported env:
#   DEEPSEEK_API_KEY=sk-…
#   DEEPSEEK_BASE_URL=https://…   # optional; defaults to the public API
pnpm exec vitest run apps/cli/config/examples/app-builder/tests/keyless-smoke.spec.ts
pnpm exec vitest run apps/cli/config/examples/app-builder/tests/with-key-smoke.spec.ts   # skips without DEEPSEEK_API_KEY
end{sh}

keyless smoke 通过 Loader 启动真实 `cordis.yml`、挂载 mock LLM 适配器，让模型按四回合脚本执行（scaffold → read → write → 最终文本），并断言 scaffold 工具写出了模板文件、随后的 `write` 调用覆盖了 dev 脚本。with-key 版本对真实 DeepSeek 适配器运行相同组装，要求 agent 先 scaffold 一个新项目，再启动 preview dev 服务器。

## 组装形态

本目录的 `cordis.yml` 内联了三个运行时 App Builder 插件；bundle 包 `@deepseek-ai/dsh-app-builder` 提供一份 `cordis.patch.yml`，供 profile launcher 消费，但 bundle JS 插件有意为空，以便直接使用 `cordis.yml` 的组装方式在不经 `dsh --profile` 的情况下挂载同一套插件。persona 插件仅作用域挂载（若直接挂载会与 system-prompt 的 deployment persona 冲突），所以本组装通过 `createRequire` 把 `APP_BUILDER_PERSONA` 从 `@deepseek-ai/dsh-app-builder-persona/text` 取出，并把它钉到 `agent-spine.config.persona`；keyless 与 with-key 两条快照会通过 `cordis-plugin-include.patches` 用各自的文本覆盖该字段。

## 加载顺序

`agent-spine-demo` 必须在三个 App Builder 插件之前加载，因为 App Builder 插件 inject `agents`（即 `AgentRegistry` 服务），而该注册表必须先发布。`sandbox-policy` 以 `workspace-write` 模式运行，使 scaffold 工具可以创建项目目录、preview 工具可以读取项目的 `package.json`；同时挂载 `fs-observation-policy`，使同一回合内模型驱动的 `write` / `edit` 调用能够把 scaffold 写出的内容作为 CAS 基础。

## Fixtures

[`tests/fixtures/keyless-driver.ts`](tests/fixtures/keyless-driver.ts) 是未导出且仅供测试使用的 driver，它启动 Loader、运行一个 fixture 回合，并在结果信封之前以 JSONL 流出规范会话事件。[`tests/fixtures/keyless-mock-llm.ts`](tests/fixtures/keyless-mock-llm.ts) 实现了一个四步 mock 适配器（scaffold 一个不带 `npmInstall` 的 Svelte SPA，读取生成的 `package.json`，把 dev 脚本覆写为指向内置的 Node preview 服务器，以 smoke 标记收尾）；[`tests/fixtures/preview-server.js`](tests/fixtures/preview-server.js) 是 preview 工具在 `framework: 'unknown'` 直接运行 `npm run dev` 时启动的纯 Node 静态 HTTP 服务器。[`tests/fixtures/keyless.cordis.yml`](tests/fixtures/keyless.cordis.yml) 是 keyless 配置 overlay，禁用真实 DeepSeek 适配器，把 agent 钉到 mock 适配器，并替换为 keyless persona 文本。
