# ui-app-builder-projects

[English](README.md) | 中文

App Builder Web 项目面板插件：从宿主快照端点轮询的耐久 App Builder 项目列表，选择写入选中状态存储。在 `app-builder-web-reskin` 分支上，依据 [planning/inspect/21-app-builder-web-shell.md](../../planning/inspect/21-app-builder-web-shell.md) 组合而成。

## Phase 1 内容

- 空的 `apply()` 宿主插件（无 Node 侧行为；纯浏览器 UI）。
- 浏览器 `apply()` 通过 `ctx.slots.inject` 把 `ProjectsList` 注册到宿主声明的 `app-builder.projects` slot；选择写入通过 shell 发布的 `ctx.appBuilder` Cordis 服务完成。
- `ProjectsList` 组件渲染纵向项目列表（标题、根目录路径、dev-server 状态点、点击选中）。通过 inject `hooks` 舱的标准 `useSnapshot` 选择器 hook 读取轮询快照；组件内无本地镜像、无订阅机器。
- `apply()` 中的快照轮询 effect（默认 5 秒，限制在 [1 秒, 60 秒]）把最新快照写入轮询存储。轮询存储是 `SnapshotStore`（框架订阅引擎），由轮询 effect（通过 `set` / `update` 写入）和 slot 条目的 `hooks.snapshot` HostObservable 共享（渲染器将其绑定为 `useSnapshot`）。
- 项目面板 chrome 的多语言字典（English + 中文）。
- 带文档化 "No runtime invariant" 理由的 invariant companion。

## 尚未交付

- 快照端点（`/__dsh/app-builder/snapshot.json`）是 Chunk 5 的交付内容；在此之前 `snapshotUrl` 为空禁用轮询，面板显示 `snapshotUnconfigured` 空态。
- 预览面板（`ui-app-builder-preview`）尚未存在；项目面板从快照中读取对应的 dev-server 状态，但无法与预览组件交互或共享状态。
- 服务端状态桥（宿主写入快照文件；宿主提供端点）是 Chunk 6 的交付内容。
- 轮询频率固定；SSE/WS 订阅延后到 Phase 2。
- 多项目预览、项目重命名、项目删除、项目创建 UI — 全部延后。

## 已知限制与延后工作

- **仅轮询。** 面板每 5 秒轮询一次；Phase 2 用 SSE 通道取代。Phase 1 故意保持同步语义 — 无乐观写入、无差异协调。
- **除形态外无快照验证。** 标准化器通过丢弃条目来容忍格式错误的条目，但快照本身被信任为宿主契约；敌意或陈旧快照可能投射误导性列表。信任依赖于宿主端点的来源校验（规划步骤中的 localhost-only 绑定）。
- **单选。** 项目面板一次发出一个 `selectedProjectId`；未来的预览面板渲染选中项目的 dev server URL。多选是 Phase 2。
- **无项目操作。** 面板不暴露脚手架、重命名、删除、在编辑器中打开；Phase 1 中这些作为对话面板中的模型驱动工具调用。
- **dev-server 状态渲染由快照驱动，非实时。** 状态点反映最后轮询的 `devServers[projectId].status`；不订阅实时任务更新。Phase 2 增强把 `app-builder-preview-dev` 任务面引入面板。
