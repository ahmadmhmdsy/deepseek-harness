# Agent Note: Promote root CLAUDE.md to the canonical agent operating system

Status: implemented

English | [中文](2026-08-29-claude-md-operating-system.zh.md)

## Problem

`CLAUDE.md` was a Windows/NTFS symbolic link to `AGENTS.md` at root, `packages/`, `examples/`, `vendor/`, and `.agents/notes/implemented/`. The arrangement conflated two distinct concerns:

1. **Repo contribution rules** that belong to `AGENTS.md` (plugin patterns, packaging, defensive patterns, project process, vendoring policy).
2. **General agent operating rules** that every engineering agent should follow regardless of repo (priority order, inspect-before-change, security, file and command safety, testing discipline, communication style, task states, definition of done).

Claude Code looks for `CLAUDE.md`; many other tools look for `AGENTS.md`. Symlinking the two kept one canonical source of truth, but it also forced any agent that opened `CLAUDE.md` to read the entire repo-contribution document, which has nothing to do with generic engineering discipline. The two documents answer different questions for different audiences and should not be the same file.

The downloaded base draft `C:\Users\Ahmad Mahmoud\Downloads\CLAUDE.md` (the senior-engineer operating system plus the DeepSeek App Builder operating system) is the natural content for a dedicated `CLAUDE.md` and is directly relevant to the in-progress `packages/app-builder/` and `examples/app-builder/` work on the current branch.

## Decision

Replace the root `CLAUDE.md` symlink with a regular file containing the operating system (Senior Engineering Operating System, then DeepSeek App Builder Operating System) adapted for this repo. Keep all cross-references repo-aware so the operating system stays generic in spirit but actionable here: link to root `AGENTS.md`, `planning/AGENTS.md`, `docs/AGENTS.md`, `packages/AGENTS.md`, and `examples/AGENTS.md`; reference `dsh-pre-push-checks`, `dsh-doc-standards`, `dsh-archive-agent-notes`, `dsh-merging-stacked-prs`, and the native GitHub stacked-PR rule.

Retarget the `packages/CLAUDE.md` and `examples/CLAUDE.md` symlinks from `AGENTS.md` to `../CLAUDE.md` so the operating system is inherited without duplication. Keep `vendor/CLAUDE.md` and `.agents/notes/implemented/CLAUDE.md` pointing at their local `AGENTS.md` because those folders have their own conventions and vendored content follows the `vendor/README.md` sync procedure.

Add a per-folder `CLAUDE.md` / `AGENTS.md` layout table to the root `AGENTS.md` "Editing these instructions" section that documents every instruction file in the repo (regular file vs symlink, target, scope, where to edit). The table must be updated in the same commit whenever any of those files change shape.

Add a one-line cross-reference from `packages/AGENTS.md` and `examples/AGENTS.md` to the new root `CLAUDE.md` so contributors working in those folders know the operating system lives at the repo root.

On Windows, `tools.write` (and any API that opens a path by name) follows NTFS reparse points, so writing through a symlink overwrites the symlink target. To replace a tracked symlink with a regular file: `git rm` first, then write the new file, then `git add`. Verify the on-disk type with `fs.lstat(...).isSymbolicLink()` rather than `Get-Item`, which still reports the reparse-point view after the symlink has been moved or replaced.

When creating new tracked symlinks on Windows, prefer `git update-index --add --cacheinfo 120000,<blob-hash>,<path>` plus `node:fs/promises` `symlink(target, path, 'file')` for the working-tree entry, rather than `cmd /c mklink` or PowerShell `New-Item -ItemType SymbolicLink`: the shell tools tokenize forward-slash targets under Constrained Language and either fail (`Invalid switch`) or resolve relative paths against the wrong base. `git hash-object -w` against bytes written with no-BOM UTF-8 produces a portable blob target; PowerShell pipes that contain CR-LF or BOMs contaminate the blob.

## Alternatives considered

**Copy the operating system into every folder that needs it.** This duplicates ~30 KB of content per folder and invites drift. A symlink inheritance model keeps one source of truth.

**Keep `CLAUDE.md` symlinked to `AGENTS.md` everywhere.** This perpetuates the conflation between operating rules and contribution rules, and forces any agent that opens `CLAUDE.md` to read contribution rules that do not apply to its task.

**Drop `CLAUDE.md` entirely and rely on `AGENTS.md`.** This breaks Claude Code's auto-discovery of instructions for the operating-system scope; tools that look for `CLAUDE.md` would receive no guidance.

**Make every folder's `CLAUDE.md` an independent regular file.** Not enough folder-specific operating rules exist to justify the duplication; the per-folder supplements already live in `AGENTS.md`.

## Consequences

- Root `CLAUDE.md` is a regular file (mode 100644) of ~30 KB. `packages/CLAUDE.md` and `examples/CLAUDE.md` are symlinks (mode 120000) to `../CLAUDE.md`. `vendor/CLAUDE.md` and `.agents/notes/implemented/CLAUDE.md` remain symlinks (mode 120000) to their local `AGENTS.md`.
- Root `AGENTS.md` keeps all existing contribution rules and gains a "Read this first" header pointing at `CLAUDE.md` plus a per-folder layout table in the editing-instructions section. Update that table whenever any instruction file changes shape (regular ↔ symlink, target, scope).
- `packages/AGENTS.md` and `examples/AGENTS.md` carry one extra sentence pointing at `CLAUDE.md`. No other content changed.
- `git checkout` and `git status` now show root `CLAUDE.md` as a regular file; the symlink-to-regular transition is a `mode change 120000 => 100644`.
- Any contributor who edits `packages/CLAUDE.md` or `examples/CLAUDE.md` no longer edits the local `AGENTS.md`; they edit the root. This is the intended direction but means contributors must follow the symlink to root before editing.
- A Windows contributor replacing a tracked symlink with a regular file must use `git rm` before `tools.write`; the harness `tools.write` follows NTFS reparse points and otherwise writes through to the symlink target.
