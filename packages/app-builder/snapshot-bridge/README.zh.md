# @deepseek-ai/dsh-app-builder-snapshot-bridge

[English](README.md) | 中文

**App Builder 状态投影器**：把项目注册表状态与预览开发服务器生命周期合并到一个内存快照，原子化写入 `$DSH_HOME/state/app-builder-snapshot.json`，并通过 `GET /__dsh/app-builder/snapshot.json` 提供给浏览器项目面板使用。

## API

| 符号 | 类型 | 备注 |
|---|---|---|
| `apply(ctx, config)` | function 插件 | 在 `ctx.webServer` 上挂载快照路由，订阅 `project/created` 与 `app-builder-preview/dev-state`，镜像状态并写入文件 |
| `Config` | schemastery schema | `{ snapshotPath?, snapshotUrlPath? }`；两者均使用下文生产契约的默认值 |
| `name` | `string` | Cordis 插件名（`app-builder-snapshot-bridge`） |
| `inject` | readonly tuple | `["webServer", "appBuilderProjects"]` |
| `AppBuilderSnapshot`、`SnapshotProject`、`SnapshotDevServer`、`DevServerStatus`、`AppBuilderPreviewDevState` | 类型 | 浏览器面板读取的线协议形态 |
| `SNAPSHOT_URL_PATH` | 常量 | 路由路径（`/__dsh/app-builder/snapshot.json`） |
| `EMPTY_SNAPSHOT` | 常量 | 初始空快照，导出供测试与消费者使用 |

## 线协议形态

`GET /__dsh/app-builder/snapshot.json`：

```jsonc
{
  "ts": 1735689600000,
  "projects": [
    {
      "id": "p1",
      "name": "demo-app",
      "rootPath": "/abs/path/to/demo-app",
      "stack": "svelte-spa",
      "createdAt": 1735689000000
    }
  ],
  "devServers": {
    "p1": {
      "url": "http://127.0.0.1:5173/",
      "port": 5173,
      "status": "ready",
      "message": "framework: vite",
      "updatedAt": 1735689100000
    }
  }
}
```

- `ts` 是最近一次写入的时间戳（epoch 毫秒）。
- `projects` 是按创建顺序排列的注册表列表。
- `devServers` 以项目 id 为键。缺失的键表示该项目尚未启动预览。
- 在首次 flush 之前，路由返回 `503 { "error": "app_builder_snapshot_unavailable" }`（尚无项目创建）。

## Events

| Event | 来源 | 作用 |
|---|---|---|
| `project/created` | `@deepseek-ai/dsh-app-builder-project` | flush：重建快照并写入文件 |
| `app-builder-preview/dev-state` | `@deepseek-ai/dsh-app-builder-preview` | 更新 `devServers[projectId]`，然后 flush |

若 dev-state 事件的 `rootPath` 与任何已知项目都不匹配则丢弃（预览启动自非 App Builder 目录，无可投影内容）。

## 文件写入

桥接器先写入同目录下的 `.tmp.<ts>.<pid>` 文件，再 `rename` 覆盖目标文件。读端永远不会看到写入一半的文件。写入失败仅记录警告并不向上抛出；内存中的状态仍是 HTTP 路由的权威来源。

`DSH_HOME` 通过 `launchEnvironmentOf(ctx)` 解析（`process` 环境优先，然后项目 `.env`，再是用户 `.env`）。当 `DSH_HOME` 未设置时跳过文件投影——HTTP 路由仍然提供内存中的状态，项目面板可继续工作。

## 组合

- `ctx.webServer` — 通过 `register({ kind: "exact", path, handler })` 挂载快照路由。
- `ctx.appBuilderProjects` — `list()` 与 `project/created` 事件用于填充投影；桥接器不持有持久化责任。
- `ctx.logger` — 文件写入失败在此处记录。

桥接器仅在 host 端运行：没有浏览器半包、没有客户端 bundle、没有 `dsh.client` 声明。浏览器面板通过自身的 `fetch` 读取投影，不会直接感知桥接器。

## 模型体验

桥接器没有面向模型的接口。它的消费者是浏览器项目面板与 host 端诊断面；没有工具 schema、没有提示词段、没有 session-log 事件。

Token 开销：零。KV-cache 稳定性：不适用。

## 已知限制与延迟工作

- **内存中的 dev-server 状态不持久化。** `dsh` 重启后 dev-server 条目会丢失；项目仍然出现（通过 session log 持久化），但其最新预览状态需要等到下一次 preview 调用才能恢复。
- **未发出 `stopped`。** 桥接器记录预览工具的 `starting` / `ready` / `failed` 转换；开发服务器的自然退出（模型未显式 kill）目前不会把条目标记为 `stopped`。Phase 2 会为 `app-builder-preview-dev` 添加 `onJobDone` 监听器，让干净退出表现为 `stopped`。
- **没有 SSE 通道。** 浏览器面板每 5 秒轮询一次；Phase 2 会用 SSE 流替换轮询，让项目面板实时更新。
- **快照轮询面向单客户端。** 多个浏览器标签同时命中内存缓存；每次状态变化只写一次文件。暂不支持跨标签推送。
- **没有按用户的 `$DSH_HOME`。** Phase 3 加入多用户隔离；当前快照文件写入共享的 `state/` 目录。