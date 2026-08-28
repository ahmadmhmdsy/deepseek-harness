# Agent Note: 清理 rescope EXACT_EDIT 标记

Status: implemented

[English](2026-08-28-rescope-marker-cleanup.md) | 中文

## 问题

`scripts/rescope-vendor.ts` 中两个 EXACT_EDIT 标记处于 `invalid` 状态，导致 `pnpm run rescope-vendor:check` 以及每一次 `pnpm run hygiene` 失败：

```
rescope-vendor: exact edit knip-logger-console: knip.json is neither pending nor cleanly applied (duplicated, partial, or moved)
rescope-vendor: exact edit vendoring-cookbook-name-invariant-zh: docs/cookbook/adding-a-vendored-package.zh.md is neither pending nor cleanly applied (duplicated, partial, or moved)
rescope-vendor: 2 problem(s); nothing was written.
```

当文件既不是 `pending`（FIND 存在，REPLACE 缺失）也不是 `applied`（REPLACE 存在，FIND 缺失）时，标记即为 `invalid`；脚本在该分支拒绝重写任何文件，避免对陈旧标记半途应用。

**`knip-logger-console`** 引用了已被删除的 `packages/util/home` workspace 块。其意图——移除冗余的 `@cordisjs/plugin-logger-console` `ignoreDependencies` 条目——已由 `a42102fb27 chore(knip): drop stale and glob-duplicate workspace entries` 满足，该提交直接移除了整个 `packages/util/home` 块。标记的 FIND 锚定了不再存在的代码块，FIND 与 REPLACE 都不能匹配。

**`vendoring-cookbook-name-invariant-zh`** 的 REPLACE 指向 `../rescope.md`。[`2026-08-18-localized-bilingual-links`](2026-08-18-localized-bilingual-links.zh.md) 确立的双语链接约定要求中文源对语料内的文档链接使用 `.zh.md` 目标。该中文 cookbook 已手工更新为 locale 正确的目标，使标记的 FIND 不匹配新文案，REPLACE 反过来又会回退双语约定。

## 决策

删除 `knip-logger-console` 标记。意图已由上游清理提交实现，且不会回退——当前 knip.json 中没有任何残留块列出 `@cordisjs/plugin-logger-console`。若未来 vendoring 在新 workspace 中重新引入该上游名，token-rewrite 流程仍会改写；EXACT_EDIT 列表只记录 token 规则无法表达的站点。

将 `vendoring-cookbook-name-invariant-zh` 的 REPLACE 更新为 `../rescope.zh.md`，遵循双语链接约定。标记现在对当前文案分类为 `applied`，使 `--check` 通过；未来若有人改动中文 cookbook 不变式，标记将立即报错。

## 验证

```sh
pnpm run rescope-vendor:check   # exit 0; 'no residue, every exact edit landed, idempotent'
pnpm run rescope-vendor          # dry run; no outstanding changes over 4668 tracked files
pnpm run hygiene                 # vendor rescope sub-gate passes; remaining 12 sub-gates independent
```

本改动仅为源码层面：`scripts/rescope-vendor.ts` 移除 `knip-logger-console` 标记，并在 `vendoring-cookbook-name-invariant-zh` REPLACE 中多出一个 `.zh`。不涉及任何 `lib/` 制品、vendor 包 manifest，亦不改动该标记文件以外的中文文案。

## 后果

- `pnpm run rescope-vendor:check` 与 `pnpm run hygiene` 重新 exit 0，不再依赖上游清理提交被重新应用，也不再要求双语链接约定回退。
- `docs/cookbook/adding-a-vendored-package.zh.md` 上的 cookbook 不变式现处于 `applied` 状态。未来若手工编辑删除 scope 命名文案或将链接反 locale 化，标记会立刻报错；保留文案但改动其他措辞仍可通过。
- 标记列表净减少一条。剩余 27 个 EXACT_EDIT 标记覆盖 token 规则无法表达的每一个站点；该列表在下次上游改动其中任一站点前保持稳定。

## 备选方案

**重新应用上游清理提交 `a42102fb27`。** 排除，因为该清理已合入 master；问题在于标记与当前文件不一致，而非分支之间分歧。

**放宽 `exactEditState` 分类器，允许 partial 或 moved 匹配。** 排除，因为 `invalid` 是唯一能在 stale 标记上发出响亮告警的机制，避免其被静默半应用。分类器的严格性是安全网；放宽它会移除脚本捕获文件偏离的唯一手段。

**通过双语 brief skill 翻译中文 cookbook REPLACE。** 排除，因为本次改动仅是一个链接后缀交换；按 `docs/i18n/README.md` 的规则，heavy workflow 仅在用户显式调用时才使用。
