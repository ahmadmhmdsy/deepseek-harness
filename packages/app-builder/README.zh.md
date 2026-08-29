# App Builder packages

[English](README.md) | 中文

App Builder MVP：在 DeepSeek Harness 之上的“提示词 → 运行中应用”界面。用户输入提示词；App Builder 代理脚手架项目、安装依赖、启动开发服务器，并把预览 URL 暴露给聊天面板。Phase 1（修订版）目标是本地的、单用户的、无认证的闭环。

## Packages

| Package | Role |
|---|---|
| [`project/`](project/) | 项目实体 + 投影单元；将 session 挂到项目根下 |
| [`scaffold/`](scaffold/) | 组合 filesystem + bash + str-replace-editor 工具以脚手架模板项目（nextjs-app、nextjs-pages、svelte-spa） |
| [`preview/`](preview/) | 组合 bash + jobs 启动项目开发服务器并轮询就绪；仅 localhost |
| [`persona/`](persona/) | 基于 `@deepseek-ai/dsh-persona` 的 App Builder 编程 persona |

## Bundle

App Builder bundle 位于 [`packages/bundle/app-builder/`](../../bundle/app-builder/)，并对 [`packages/bundle/base`](../../bundle/base/) 打补丁。它不引入新的 HTTP 层，也不引入并行的 `apps/app-builder-web`；Web GUI 通过现有 `apps/web` 在分支 `app-builder-web-reskin` 上重新换肤。

## Reference

- [`planning/Phase 1 prompt.md`](../../../planning/Phase%201%20prompt.md) - Phase 1 task brief
- [`planning/plan.md`](../../../planning/plan.md) - App Builder MVP section (Phase 1)
- [`planning/inspect/18-phase1-start-record.md`](../../../planning/inspect/18-phase1-start-record.md) - Phase 1 kickoff log
