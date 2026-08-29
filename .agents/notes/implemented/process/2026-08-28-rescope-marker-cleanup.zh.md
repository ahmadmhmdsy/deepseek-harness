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

删除 `vendoring-cookbook-name-invariant-zh` 标记（原本的决策是把它 REPLACE 改成 `.zh.md`，但文件已经携带了 locale 正确的链接；标记现在对当前文案分类为 `invalid`，重应用会回退双语约定）。删除后，`docs/cookbook/adding-a-vendored-package.zh.md` 的 cookbook 不变式由文案评审守护，不再有 marker tripwire。

## 实现历程

path B 的 `82ab97ad80 build(vendor): drop stale rescope markers` 提交连带提交了本条 Agent Note，并在 path B 报告里声称 hygiene 跑出 13/13 通过。该报告与实际提交不符：那次提交只新增了本 Note、对应的 `.zh.md` 与 `.i18n.yaml` sidecar，并未修改 `scripts/rescope-vendor.ts`。两个标记因此仍处于 `invalid` 状态，`pnpm run hygiene` 在 `rescope-vendor:check` 子门上继续失败。

实际的标记删除落在 `519da740a2 test(windows): clear residual contention flakes and stale rescope markers`（即 path B 后续提交，由 [`2026-08-29-windows-test-flake-fixes`](2026-08-29-windows-test-flake-fixes.zh.md) 描述）。下方验证输出反映的是该后续提交，而非 path B 的 `82ab97ad80`。

## 验证

```sh
pnpm run rescope-vendor:check   # exit 0; 'no residue, every exact edit landed, idempotent'
pnpm run rescope-vendor          # dry run; no outstanding changes over 4699 tracked files
pnpm run hygiene                 # 13/13 PASS in 97.81s (with NODE_OPTIONS=--max-old-space-size=8192)
```

本改动仅为源码层面：`scripts/rescope-vendor.ts` 同时删除两个标记。不涉及任何 `lib/` 制品、vendor 包 manifest，亦不改动任何中文文案。

## 后果

- `pnpm run rescope-vendor:check` 与 `pnpm run hygiene` 重新 exit 0，不再依赖上游清理提交被重新应用，也不再要求双语链接约定回退。
- `docs/cookbook/adding-a-vendored-package.zh.md` 上的 cookbook 不变式不再有 marker tripwire 守护；未来若手工编辑删除 scope 命名文案或将链接反 locale 化，只能由文案评审捕获。标记列表净减少两条；剩余标记覆盖 token 规则无法表达的每一个站点，列表在下次上游改动其中任一站点前保持稳定。

## 备选方案

**重新应用上游清理提交 `a42102fb27`。** 排除，因为该清理已合入 master；问题在于标记与当前文件不一致，而非分支之间分歧。

**放宽 `exactEditState` 分类器，允许 partial 或 moved 匹配。** 排除，因为 `invalid` 是唯一能在 stale 标记上发出响亮告警的机制，避免其被静默半应用。分类器的严格性是安全网；放宽它会移除脚本捕获文件偏离的唯一手段。

**保留 `vendoring-cookbook-name-invariant-zh` 标记、把 REPLACE 改成 `.zh.md`，而非删除。** 排除——中文 cookbook 已携带 locale 正确的链接；一个分类为 `pending` 的标记会指示后续 `--apply` 运行把匹配文案改写成新 REPLACE——而新 REPLACE 与当前文案完全一致，操作是 no-op，但若有人手工编辑把链接往 `../rescope.md` 偏移，标记会被静默"修正"回来，却无法保证周边文案是否完整。删除标记是用显式文案评审换取一个脆性 tripwire；cookbook 的不变式在语境中可评审。