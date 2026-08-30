# Agent Note：App Builder project 投影单元 + 缓存集成

Status: implemented

[English](2026-08-31-projection-cache-integration.md) | 中文

Branch: `adopt/projection-cache`（栈于 `apps-web-reskin-on-upstream`）。

栈位置：1.5.4（位于 1.5.3 之上、1.5.5 之下）。

## Problem / 问题

Phase 1 中 App Builder `project` 包以进程级 `ProjectRegistry` 加一个 `project/created` 事件的形式交付。「该会话归属哪个项目」的会话侧视图住在 `ProjectRegistry.listSessionIds(id)` 里——一个运行时扫描，没有任何投影系统能持久化它或跨重启提供它。Phase 2 §4（"Add a `project` projection unit in `packages/app-builder/project/`"）要求 owning-project 关系挂在 `session-projection` 缝上，从而被持久化投影缓存（`@deepseek-ai/dsh-session-projection-cache`，自 B2 merge 起挂载在 `bundle/base`）checkpoint，并在 listing 读路径上不重读全会话日志就能服务出来。子阶段 1.5.4 在一个栈式 PR 内同时落地 unit、注册与缓存接线。

## Decision / 决策

**1. 新投影单元 `packages/app-builder/project/src/projection.ts`。** key 为 `project`，`stateVersion: 1`。state 形状为 `{ owningProjectId: ProjectId | null, owningProjectName: string | null, owningProjectRootPath: string | null }`——按持久化缓存前置条件为纯 JSON，带 brand 的 `ProjectId` 在运行时就是字符串。wire 视图为严格子集，`owningProjectId: string | null`。两个 schema 都是 `zod` `.strict()` 对象；缓存走投影 registry 的标准 `viewSchema` 闸门读它们。该单元通过 declaration merging 扩展 `@deepseek-ai/dsh-session-projection/types` 的 `SessionProjectionMap` 与 `SessionProjectionStateMap`，让新 key 出现在每一次 `ctx.sessionProjections.snapshot(...).values.project` 读路径上。

**2. `init(header)` 在会话创建时做 cwd → registry 查询。** 该函数读 `ctx.get('appBuilderProjects')`（按 `packages/AGENTS.md` 的 Cordis 严格服务查询），挑出规范化根是 `header.cwd` 目录前缀祖先的那个项目。`+ sep` 守卫（`rootPath + '/'` 或 `rootPath + '\\'`）阻断子串误判（`/home/me` 不在 `/home/mex` 之下）。没有 `cwd`、registry 未挂载或没有匹配项目的会话都折叠到零态——每个 nullable 字段都为 `null`。

**3. `apply(state, event) → state` 是恒等折叠。** 会话的 cwd 在创建时设置一次、永不变化（它是 `SessionHeader` 的不可变字段），因此每个提交的事件都让同一引用原样穿过。`Object.is` 闸住变更通知（每个事件零下游工作），缓存的节流 write-behind 只在计数/间隔触发器与三个强制点（创建、`turn/end`、dispose）写，不为每个事件写。这就是「init 时算一次、永不改变」的形态：成本摊到每次会话一次查询，缓存在会话创建时落一次持久化写，listing 读路径在 detach 之前都从缓存服务。

**4. `apply(ctx, config)` 把 unit 注册到 `ctx.sessionProjections`。** `inject` 现为 `['sessionProjections']`。注册是插件 fiber 上的 effect（按 registry 契约）：卸载插件 fiber 会把 `project` key 从每个 live 与 cold 快照上摘掉。插件同时调用 `bindProjectionContext(ctx)`（`projection.ts` 里的一行模块内私有助手），让 unit 的 `init` 在没有 context 参数时仍能解析 `ctx.appBuilderProjects`——Cordis 的 drive 路径不给 `init` 传 context，只传 `SessionHeader`，所以 unit 在注册时把注册方 fiber 的 context 捕获下来。

**5. 不变式伴生器仍为空，原因文案更新。** `src/invariant.ts` 保留空的 `install: InvariantInstaller = () => {}`，更新 `No runtime invariant:` 段落以覆盖新职责。cwd → owning-project 关系由 `ProjectRegistry.create()`（校验 rootPath 是目录）以及 `ProjectRegistry.listSessionIds()`（推导前缀匹配集）所有并运行时校验；投影单元是那个关系上的纯折叠，不是它的所有者。持久化缓存 checkpoint 该单元的 state，陈旧或 ver 不匹配的记录在读时丢弃（不做迁移）——unit 的 `stateVersion` 就是闸门。

**6. 增加 peer 依赖。** `@deepseek-ai/dsh-session-projection`（unit 引 `ProjectionDefinition` 与 `/types` 模块路径以做 declaration merging）与 `@deepseek-ai/dsh-session-projection-cache`（按 `planning/inspect/19-upstream-v0.1.2-alpha.1-adoption-plan.md §6.1` 第 2 步——本包声明其缓存伴生，使下游省略缓存的 bundle 组合过不了 cordis-config 验证，而不是悄悄交付一个不持久化的投影）。缓存插件本身以 `session-projection-cache` 行挂载在 `packages/bundle/base/cordis.patch.yml`，配置 `writeEveryEvents: 200, writeIntervalMs: 5000`——App Builder bundle 不动。

**7. 双语 README triplet。** 中英文 README 各加一节，记录投影 key、wire 负载、缓存关系，再加一条 Known Limitations 说明 listing 读依赖缓存插件挂载（没有缓存的组合会服务非持久化的投影）。翻译配对 hash 通过 `pnpm run verify-translation-pairing --write packages/app-builder/project/README.md` 重记。

## Verification / 验证

- `pnpm install` 用两个新 peer 重新生成 lockfile。
- `pnpm run typecheck` 通过 host + client aggregate；本包 tsconfig 加 `session-projection`、`session-projection-cache`、`storage-domain` 三个引用。
- `pnpm run verify-cordis-config` 通过 155 份配置（App Builder bundle patch 已引用 project 包）。
- `pnpm run verify-tsconfig-paths` 通过（包路径 `@deepseek-ai/dsh-app-builder-project` ↔ `packages/app-builder/project` 与目录布局一致；`gen-tsconfig-paths` 不需要手写别名）。
- `pnpm run verify-translation-pairing --write` 重记 README 与 Agent Note triplet。
- `pnpm run verify-md-wrap` 通过（2186 份文件，无硬折散文）。
- `pnpm run verify-agent-note-format` 通过（落本 triplet 后共 647 份 Agent Note 合规）。
- `pnpm exec vitest run packages/app-builder/project/tests/`——4 个测试通过：已有 loader-composition-invariant smoke，加上新的 projection-cache Loader 组合套件（命名空间形态钉、cwd-在-项目-下解析、无匹配零态、事件上的恒等折叠）。
- `pnpm exec vitest run packages/session/session-projection/tests/ packages/session/session-projection-cache/tests/`——缓存契约测试保持绿。
- Lefthook pre-push（build:lib:host + typecheck:contracts-ready，约 32 s）push 时通过。
- `pnpm run doc-sync` / `pnpm run hygiene` / `pnpm run test:coverage` / `pnpm run test:snapshot`——CI 拥有；从 1.5.1 继承下来的 13 doc-sync + 8 hygiene 失败 + 15 项上游引入的 coverage 回归，留到 1.5.7。

## Known pre-existing failures / 已知既有失败

1.5.4 不引入新失败。从 1.5.1 继承的 3 个 doc-sync 双语漂移 note（`2026-06-24-workspace-context.md`、`2026-07-21-follow-instruction-symlinks.md`、`2026-07-21-instruction-load-all-dedup.md`）保持不动；它们引用一个不存在的 `2026-08-29-claude-md-operating-system.md`，在 1.5.7 处理。

## Alternatives considered / 考虑的替代方案

- **只在 `listSessionIds` 里按需计算。** 否决：让每个 listing 读路径保持 O(n×m) 的每次扫描，且缓存没有可 checkpoint 的东西。投影单元才是折叠的权威所有者；`listSessionIds` 在缓存 `cachedSnapshot` 阶梯被端到端跑通后的后续版本里变成 `ctx.sessionProjections.stateOf(session, 'project')` 的薄壳调用。
- **把 owning project 持久化进 `SessionHeader.meta.projectId`。** 否决：把 App Builder 域烤进会话信封，强制所有其他消费者读它。投影单元把关系作为对未变 header 的折叠留在线后——seam 保持开放给未来的 `projectsPerSession` 形态（一个会话被多个项目持有，比如共享 worktree），无需信封 bump。
- **在 unit 的 `init` 里手写缓存写路径。** 否决：绕过投影 registry 的 checkpoint 阶梯（计数/间隔节流 + 三个强制点），等于重蹈 snapshot bridge 1.5.3 §2 刚关闭的 fire-and-forget 写竞态。缓存插件拥有写纪律；unit 拥有折叠。
- **把 cache 标成强制 peerDep 并在缺失时崩溃。** 否决：缓存是部署选择（不带持久化启动 App Builder 是合法组合）。空伴生器的原因文案与 README 的 Known Limitations 段落传达这层依赖而不强制。

## Consequences / 后果

- App Builder bundle 自 `bundle/base` 继承缓存覆盖；bundle patch 不变。
- `ProjectRegistry.listSessionIds` 在后续（1.5.5 或之后）成为派生视图；当前实现保留以向后兼容。
- `project` 投影 key 现在是 App Builder 组合里每次 `ctx.sessionProjections.snapshot(...).values` 读路径的一部分；下游消费者（web 列表面板、API 网关）可以无需额外查询就读到。
- unit 的 `stateVersion: 1` 是持久化缓存闸门；未来字段改动 bump 到 `2`，旧记录读时丢弃。
- 子阶段 1.5.5 在 `packages/app-builder/api/` 起 Typert Remote 服务并暴露 `listProjects` / `getProject`，读路径走投影快照。

## References / 参考

- [`planning/Phase 1.5 prompt.md` §1.4](../../../../planning/Phase%201.5%20prompt.md)——子阶段任务书。
- [`planning/Phase 2 prompt.md` §4](../../../../planning/Phase%202%20prompt.md)——目标形态（本 unit 就是 Phase 2 §4 的交付物，提前到 1.5.4 完成以便走在 1.5.5 API 工作之前）。
- [`planning/inspect/19-upstream-v0.1.2-alpha.1-adoption-plan.md` §6.1](../../../../planning/inspect/19-upstream-v0.1.2-alpha.1-adoption-plan.md)——上游 PR #2781（`53c8f64eed`）落地步骤。
- [`packages/session/session-projection-cache/README.md`](../../../session/session-projection-cache/README.md)——缓存契约（节流 write-behind、按 identity 绑定的行、`ver` 不匹配即丢）。
- [`packages/session/session-projection/src/index.ts`](../../../session/session-projection/src/index.ts)——drive registry（`register`、`snapshot`、`restore`、`Object.is` 变更通知闸）。
- [`.agents/notes/proposed/architecture/2026-07-27-session-projection-and-command-log.zh.md`](../../proposed/architecture/2026-07-27-session-projection-and-command-log.zh.md)——session-projection RFC。
- [`.agents/notes/implemented/architecture/2026-08-19-session-projection-state-and-client-views.zh.md`](../../implemented/architecture/2026-08-19-session-projection-state-and-client-views.zh.md)——该 seam 的实现形态。
- [`.agents/notes/implemented/architecture/2026-08-06-subagent-list-identity-projection.zh.md`](../../implemented/architecture/2026-08-06-subagent-list-identity-projection.zh.md)——新增投影单元最接近的先例。
- [`.agents/notes/implemented/process/2026-08-30-app-builder-shell-on-upstream-web.zh.md`](2026-08-30-app-builder-shell-on-upstream-web.zh.md)——1.5.3 栈式 PR，交付 snapshot bridge 并把 App Builder 重铺到 `apps/web/`。
