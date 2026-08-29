# ui-app-builder-shell

[English](README.md) | 中文

App Builder Web Shell 插件：当 `appBuilder.enabled` 为 true 时，通过 slot 链接管机制占用 root layout 的 3 栏 CSS Grid 布局（项目 | 对话 | 预览）。在 `app-builder-web-reskin` 分支上，依据 [planning/inspect/21-app-builder-web-shell.md](../../planning/inspect/21-app-builder-web-shell.md) 组合而成。

## Phase 1 内容

- 空的 `apply()` 宿主插件（无 Node 侧行为；纯浏览器 UI）。
- 浏览器 `apply()` 通过 `ctx.slots.inject` 把 `app-builder-shell` 注册到 `root` slot（链接管），并声明三个子 slot：`app-builder.projects`、`app-builder.preview`（root 作用域）、`app-builder.conversation`（session 作用域）。
- `Shell` 组件渲染 3 栏 CSS Grid 布局，把从 slot 声明的选择 store 读到的 selected project id 通过 owner share 传给 preview pane。
- Shell chrome 的多语言字典（English + 中文）。
- 带文档化 "No runtime invariant" 理由的 invariant companion。

## 尚未交付

- 接管 `root` 需要现有 `ui-layout` 的 `root` 注册改为 `kind: chain`（目前为 `single`）；这一步与 `apps/web/index.html` 中的 `appBuilder.enabled` 配置一起在后续提交中完成。
- `ui-app-builder-projects` 与 `ui-app-builder-preview` 包尚未存在；shell 在它们完成之前渲染空的占位区域。
- `ConversationRoot` 注册未改动；`root` 改造为 chain 后，现有 `@deepseek-ai/dsh-client-ui-conversation` 条目会填充 `app-builder.conversation` slot。
- 服务端状态桥（`/__dsh/app-builder/snapshot.json` 轮询）是单独的 chunk。

## 已知限制与延后工作

- **链接管待办。** Shell 通过 `ctx.slots.inject` 把自己的条目声明进 `root`，但现有 `ui-layout` 的注册把 `root` 声明为 `single`。在不把 `ui-layout` 改为 `kind: chain`（并加入返回 `appBuilder.enabled` 的 select）之前，链接管在加载时仅是 typecheck 层面的成功，实际并不会替换默认布局。该问题在后续提交中与 apps/web 配置一并解决。
- **三个子 slot 是空占位。** 在 `ui-app-builder-projects` 与 `ui-app-builder-preview` 完成前，projects / preview pane 渲染空的 `<aside>` 与 `<section>` 元素；shell 本身仍能正确 typecheck 与加载。
- **无面板拖拽分隔条。** 260px / 1fr / 1fr 的栅格固定；可拖拽分隔条延后到 Phase 2。
- **不支持多项目预览。** 同一时间只能预览一个项目；列表选择切换 URL。多 iframe 实时预览为 Phase 2 内容。
