# Agent Note: 将根 CLAUDE.md 提升为规范的 agent 操作系统

Status: implemented

[English](2026-08-29-claude-md-operating-system.md) | 中文

## 问题

`CLAUDE.md` 是一个 Windows / NTFS 符号链接，指向根目录、`packages/`、`examples/`、`vendor/` 和 `.agents/notes/implemented/` 中的 `AGENTS.md`。这种安排把两件本应分开的事混在了一起：

1. **仓库贡献规则**，归 `AGENTS.md` 所有（插件模式、打包、防御性模式、项目流程、vendor 政策）。
2. **通用 agent 操作规则**，每名工程 agent 都应遵守，与具体仓库无关（优先级顺序、先检查后修改、安全、文件与命令安全、测试纪律、沟通风格、任务状态、完成的定义）。

Claude Code 会读取 `CLAUDE.md`；许多其他工具会读取 `AGENTS.md`。把两者做成符号链接虽然维持了单一权威源，但也强迫任何打开 `CLAUDE.md` 的 agent 读完整份仓库贡献文档，而后者与通用工程纪律毫无关系。两份文档面向不同受众、回答不同问题，不该是同一份文件。

下载的草案 `C:\Users\Ahmad Mahmoud\Downloads\CLAUDE.md`（资深工程师操作系统 + DeepSeek App Builder 操作系统）天然适合作为专门的 `CLAUDE.md` 内容，且直接对应当前分支上正在进行的 `packages/app-builder/` 与 `examples/app-builder/` 工作。

## 决策

把根 `CLAUDE.md` 符号链接替换为普通文件，内容是该操作系统（资深工程师操作系统，再接 DeepSeek App Builder 操作系统），并按本仓库改造。保留所有跨引用让操作系统在精神上保持通用，但在本仓库中可执行：链接到根 `AGENTS.md`、`planning/AGENTS.md`、`docs/AGENTS.md`、`packages/AGENTS.md`、`examples/AGENTS.md`；引用 `dsh-pre-push-checks`、`dsh-doc-standards`、`dsh-archive-agent-notes`、`dsh-merging-stacked-prs` 以及原生 GitHub 堆叠 PR 规则。

将 `packages/CLAUDE.md` 与 `examples/CLAUDE.md` 这两个符号链接的目标从 `AGENTS.md` 改为 `../CLAUDE.md`，让操作系统可被继承而不复制。`vendor/CLAUDE.md` 与 `.agents/notes/implemented/CLAUDE.md` 仍指向本地的 `AGENTS.md`，因为这两个目录有自己的约定，且 vendor 内容遵循 `vendor/README.md` 的同步流程。

在根 `AGENTS.md` 的「Editing these instructions」一节加入按目录列出 `CLAUDE.md` / `AGENTS.md` 布局的表格，登记仓库里每一份指令文件（普通文件还是符号链接、目标、范围、在哪里编辑）。该表格必须在同一笔提交中随任一指令文件形态变化一起更新。

在 `packages/AGENTS.md` 与 `examples/AGENTS.md` 各加一行对根 `CLAUDE.md` 的交叉引用，让在这两个目录工作的贡献者知道操作系统位于仓库根。

在 Windows 上，`tools.write`（以及任何按路径名打开文件的 API）会跟随 NTFS 重解析点，因此沿符号链接写入会覆盖符号链接的目标。要把一个已跟踪的符号链接替换为普通文件：先 `git rm`，再写入新文件，再 `git add`。用 `fs.lstat(...).isSymbolicLink()` 校验磁盘上的类型，而不是用 `Get-Item`，因为符号链接被移动或替换之后 `Get-Item` 仍会按重解析点返回旧视图。

在 Windows 上新建已跟踪的符号链接时，优先使用 `git update-index --add --cacheinfo 120000,<blob-hash>,<path>` 配合 Node `node:fs/promises` 的 `symlink(target, path, 'file')` 来落工作树条目，而不是 `cmd /c mklink` 或 PowerShell 的 `New-Item -ItemType SymbolicLink`：在 Constrained Language 下，shell 工具对正斜杠目标的分词要么失败（`Invalid switch`），要么基于错误的基准目录解析相对路径。用不带 BOM 的 UTF-8 写出的字节走 `git hash-object -w` 得到可移植的 blob 目标；PowerShell 管道会塞进 CR-LF 和 BOM，污染 blob。

## 已评估的替代方案

**把操作系统复制到每一个需要的目录。** 这会让每目录承担约 30 KB 的复制内容并埋下漂移隐患。符号链接继承模型维持单一权威源。

**保留 `CLAUDE.md` 在所有位置都符号链接到 `AGENTS.md`。** 这延续了「操作规则与贡献规则」的概念混淆，强迫任何打开 `CLAUDE.md` 的 agent 阅读与其任务无关的贡献规则。

**彻底移除 `CLAUDE.md`，只用 `AGENTS.md`。** 那会破坏 Claude Code 自动发现操作系统范围指令的能力；任何依赖 `CLAUDE.md` 的工具都将失去指引。

**把每个目录的 `CLAUDE.md` 都做成独立的普通文件。** 没有足够多的目录专属操作规则来支撑这种复制；按目录的补充规则本就已经写在 `AGENTS.md` 里。

## 后果

- 根 `CLAUDE.md` 是约 30 KB 的普通文件（mode 100644）。`packages/CLAUDE.md` 与 `examples/CLAUDE.md` 是指向 `../CLAUDE.md` 的符号链接（mode 120000）。`vendor/CLAUDE.md` 与 `.agents/notes/implemented/CLAUDE.md` 仍是符号链接（mode 120000），目标为本地 `AGENTS.md`。
- 根 `AGENTS.md` 保留所有现有贡献规则，并新增「Read this first」标题指向 `CLAUDE.md`，以及在 editing-instructions 一节新增按目录布局表。任何指令文件形态变化（普通 ↔ 符号链接、目标、范围）都要同步更新该表。
- `packages/AGENTS.md` 与 `examples/AGENTS.md` 各加一句指向 `CLAUDE.md`，其余内容不变。
- `git checkout` 与 `git status` 现在把根 `CLAUDE.md` 显示为普通文件；符号链接到普通文件的转换会以 `mode change 120000 => 100644` 出现。
- 任何编辑 `packages/CLAUDE.md` 或 `examples/CLAUDE.md` 的贡献者不再编辑本地 `AGENTS.md`；他们编辑根。这是预期方向，但意味着贡献者必须先跟随符号链接到根再编辑。
- Windows 上的贡献者要把已跟踪的符号链接换成普通文件，必须在 `tools.write` 之前执行 `git rm`；本工具的 `tools.write` 会跟随 NTFS 重解析点，否则就会写穿到符号链接目标。

## 相关

本次改动部分取代了三条较早的 Agent Note 中「`CLAUDE.md` 应被视作 `AGENTS.md` 的逐字节镜像」这一隐含假设。那些 note 中的机制仍然成立，符号链接镜像这种布局仍适用于 `vendor/CLAUDE.md` 与 `.agents/notes/implemented/CLAUDE.md`。

- [Workspace context instruction files](../feature/2026-06-24-workspace-context.zh.md) — 候选列表 `['AGENTS.md', 'CLAUDE.md']`、scope key、基线与动态刷新。机制不变；「`CLAUDE.md → AGENTS.md` 镜像」现在是一种受支持的布局，而非唯一规范。
- [Follow symlinked instruction files](../feature/2026-07-21-follow-instruction-symlinks.zh.md) — 跟随符号链接而非拒绝。该规则现在也覆盖 `packages/CLAUDE.md → ../CLAUDE.md` 与 `examples/CLAUDE.md → ../CLAUDE.md`，不再仅限于 `CLAUDE.md → AGENTS.md`。
- [Load all instruction candidates with per-directory dedup](../feature/2026-07-21-instruction-load-all-dedup.zh.md) — 按候选粒度去重。去重键是解析后的内容，所以指向 `../CLAUDE.md` 的符号链接与指向本地 `AGENTS.md` 的符号链接解析到不同内容并保持区分；兄弟目录里两个指向 `../CLAUDE.md` 的符号链接依旧会按内容去重。

## 后续：将所有 `CLAUDE.md` 符号链接替换为普通文件副本

最初这次改动把根 `CLAUDE.md` 提升为普通文件，但 `packages/CLAUDE.md`、`examples/CLAUDE.md`、`vendor/CLAUDE.md`、`.agents/notes/implemented/CLAUDE.md` 仍是符号链接（指向 `../CLAUDE.md` 或本地 `AGENTS.md`）。这留下了真实失败模式：任何对已跟踪 `CLAUDE.md` 符号链接的 `tools.write` 都会跟随 NTFS 重解析点并覆盖链接目标，向 `packages/CLAUDE.md` 写入空内容会清空根操作系统文件，向 `vendor/CLAUDE.md` 写入会破坏 `vendor/AGENTS.md`（与最初销毁 18 KB 根 `AGENTS.md` 的是同一类 bug）。

为消除整类 bug，所有 `CLAUDE.md` 符号链接均替换为目标内容的普通文件同步副本。`packages/CLAUDE.md` 与 `examples/CLAUDE.md` 现在包含完整根操作系统内容，相对路径已相应调整（例如根里的 `./AGENTS.md` 在 `packages/` 中变为 `../AGENTS.md`）。`vendor/CLAUDE.md` 与 `.agents/notes/implemented/CLAUDE.md` 镜像本地 `AGENTS.md`。每份副本在文件顶部带有横幅说明这是同步副本并指向真正的源，任何打开它的 agent 都能立即理解编辑规则。

代价真实但有界：编辑 `CLAUDE.md` 现在需要在同一笔提交中把改动镜像到最多其他四个文件。根 `AGENTS.md` 中 editing-instructions 表格记录了按目录的规则（"编辑源，同一笔提交内镜像"），新增的 `Why no CLAUDE.md is a symlink in this repo` 一节说明了这种间接性存在的原因。

对已跟踪符号链接在工作树中执行 `git checkout -- CLAUDE.md` 会把它恢复为普通的 NTFS 符号链接而不管索引条目，所以任何贡献者本地对曾为符号链接的路径运行 `git checkout -- CLAUDE.md` 都会拿回重解析点。如果此布局被还原为符号链接，bug 就会回来；根 `AGENTS.md` 中的 `Why no CLAUDE.md is a symlink in this repo` 一节是对抗该回归的持久护栏。
