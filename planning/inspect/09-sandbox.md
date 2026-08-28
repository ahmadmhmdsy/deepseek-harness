# Step 9 — Sandbox: Landlock / bwrap / Seatbelt / Windows ACL

> Status: COMPLETE. Phase alignment: the plan's Phase 3 'Landlock/bwrap sandbox' requirement.

## Headline finding

**Phase 3's Landlock requirement is already met at the provider level.** dsh ships a production-grade Linux Landlock addon (the C launcher, statically linked against musl) and a sandbox-local provider that selects bwrap > Landlock > Seatbelt > Windows ACL. The Phase 3 work is 'bind sandboxing into the per-project dsh session and enforce non-privileged user execution', not 'build a sandbox'.

## Landlock native addon (`native/landlock-run/`)

- Built as a small, auditable C11 self-restrict-then-exec launcher (~300 lines, statically linked against musl, no libraries beyond libc).
- Public JS API: `launcherPath()`, `probe(launcher, opts)`, `grantArgs({ readOnly?, readWrite? })`, `LAUNCHER_BIN`, `LAUNCHER_FAILURE_EXIT` (125).
- Probe results: `'full' | 'partial' | 'unusable'`.
- Fail-closed: if the kernel cannot enforce, exits without running the command. Never runs unconfined as a fallback.
- Platform packages published separately: `@deepseek-ai/node-addon-landlock-run-linux-x64`, `-linux-arm64`. Entry package resolves per-platform.
- **No environment-variable overrides** for which binary confines a process — ambient environment never decides confinement. Test injection is by function parameter; `NALR_*` prefix is for build/test only.
- **No install-time build fallback** by design. A host without a matching platform package gets a nonexistent launcher path, the probe fails, the consumer falls closed. node-gyp is deliberately not a fallback.
- Build is native-only on each architecture's runner (CI is the builder of record).
- Tarball gates at pack time; **platform tarballs use `npm pack`, never `pnpm pack`** (pnpm 11.7.0 strips the executable bit — a regression that would ship a launcher no consumer can spawn).
- Kernel UAPI is self-defined in the C source verbatim from kernel headers; CLI contract is pinned in `native/landlock-run/docs/cli-contract.md`.

## `packages/sandbox/` family

| Package | Role |
|---|---|
| `packages/sandbox/sandbox` | `Sandbox` Service Definition — `wrap(args, policy)` returns argv the consumer spawns directly |
| `packages/sandbox/sandbox-local` | Local provider: probe order Linux = bwrap > Landlock; macOS = Seatbelt; Windows = ACL restricted-token |
| `packages/sandbox/sandbox-policy` | `ctx.sandboxPolicy` owner — default mode + workspace root, single shared resolution for bash + fs + terminal |
| `packages/sandbox/sandbox-windows-acl` | Windows ACE machinery (private temp dir per session/workspace pair with random SID + revocable ACE) |

## Per-platform profile semantics

**Linux bwrap profile:** read-only host root + fresh `/dev` + private-PID `/proc`. Commands manage descendants but cannot see host processes; hiding host `/proc/<pid>` entries prevents magic links (root, fd) from bypassing mounts. `workspace-write` adds ephemeral `/tmp` and a writable workspace bind.

**Linux Landlock profile:** requires exit 125 and a `landlock-run:` fatal line after excluding only the exact partial-enforcement notice. A notice with child exit 1, 2, or 125 remains a child outcome.

**macOS Seatbelt profile:** allow-default with `(deny file-write*)` plus write allow-lists. `read-only` grants the `/dev/null` literal alone; `workspace-write` adds the workspace root, `/tmp`, and the per-user darwin temp dir. Every root canonicalized because Seatbelt matches resolved paths (`/tmp` IS `/private/tmp`).

**Windows restricted-token profile:** one deterministic write SID + standing ACE per workspace; every live session/workspace pair gets a random private temp directory with distinct SID + revocable ACE. Sessions sharing a workspace share intended write authority without inheriting temp authority. A workspace equal to or containing the platform temp root fails before any ACL mutation because its inheritable ACE would otherwise reach every private temp child.

## Mode vocabulary (closed union)

`read-only | workspace-write | danger-full-access` — closed and validated at load. Defaults to `read-only` (fail-safe).

## Selection + failure semantics

- Multiple candidates are probed in order; a sole candidate is selected directly.
- Unsupported platforms and unusable runners fail closed with `SANDBOX_UNAVAILABLE`. Execution never silently falls through unconfined.
- Each wrap carries structured runner-failure rules so consumers can distinguish a broken sandbox from a command failure.
- Policy is per call; the provider stores only the mechanism and cached runner verdict.
- Each wrap reports enforcement completeness plus backend-specific denial signatures and runner-failure rules.

## `packages/shell/bash-sandbox` consumer

- Confines every command by handing the provider the exact `['bash', '-c', command]` argv this executor is about to spawn.
- **Denials are result facts, not throws.** A failed run whose stderr carries the selected backend's denial dialect (EROFS under bwrap, EACCES under Landlock, EPERM under Seatbelt) is `ShellRunResult.sandbox.denied: true`. Every confined run carries its mode and the provider's enforcement completeness (`full` or `partial`).
- **The runner path or syscall must match.** Before a process starts, a rejection is attributed to the runner only when the caller-owned workdir is independently usable and Node reports `ENOENT`/`EACCES` with `error.path` equal to provider argv[0] or `syscall: 'spawn <runner>'`.
- **Deployment fallback, per-call policy.** `ctx.sandboxPolicy.resolve({ session?, mode? })` resolves a complete `SandboxExecutionPolicy` for every tool call; session override outranks defaultMode. `ctx.shell.sandboxMode` capability reports the configured default so the tool layer advertises escalation only when this executor is mounted.
- **File effects only.** The mode vocabulary claims only file effects. Network stays unrestricted; process visibility is backend-specific and documented by `dsh-sandbox-local`.
- **Deny-only at the seam.** A denial is a reported fact; this executor never negotiates permissions — the approval question lives in the tool layer (`dsh-tool-bash`).

## Plan implications

Phase 3's 'Landlock/bwrap' work is essentially done. The remaining Phase 3 sandbox work is:

1. **Per-project sandboxing.** When the App Builder starts a session for `project X`, the session's `cwd` is the project root, and `ctx.sandboxPolicy.resolve()` automatically confines to that project root. Today this is already the default; Phase 3's job is to ensure cross-project isolation is enforced at the worker pool level.
2. **Non-privileged user execution.** Each dsh worker process should run as a non-privileged user with restricted network. This is a process-management concern (separate from Landlock), and it's how App Builder's per-project worker pool would bind to per-project OS identities. dsh today does not fork per-project workers — each `dsh` invocation is one process; multi-tenancy at the OS-user level would require one worker process per project.
3. **Restricted network per project.** Not in dsh today; would need a per-process network policy (e.g., firewall rules or an HTTP egress proxy). The Landlock launcher itself cannot restrict network — it restricts the filesystem.
4. **Adversarial tests.** dsh has `test-support/agent-loop-testkit`; we should add adversarial tests for sandbox bypass attempts (TOCTOU via symlinks, fs-sandbox + bash-sandbox drift, etc.).

## Plan mismatches identified (carried to Step 14)

- Plan calls Phase 3 'Landlock/bwrap sandbox' as new work. The landlock launcher is shipped; bwrap is supported; Seatbelt and Windows ACL are supported. The provider abstraction (`ctx.sandbox`) is mature. Phase 3 work is binding sandboxing to per-project workers + adding network restrictions.
- Plan does not mention that dsh already supports Windows ACL restricted-token sandboxing. Multi-platform deployment just works.
- Plan does not mention the 'fail-closed' invariant. Worth restating in the App Builder's safety contract.
- Plan does not mention that the Landlock binary is statically linked musl, fails closed, and cannot be replaced by a non-enforcing binary (no env-var overrides). This is a load-bearing safety property.
- Plan does not mention the npm-pack-not-pnpm-pack detail (tarball executable bit). Only matters if App Builder ships its own native sandbox binaries.
- Plan does not mention that sandbox-local probes bwrap first on Linux and falls back to Landlock. This means Landlock is the fallback when bwrap is missing, not the primary; we should verify the App Builder's deployment expectation.
- Plan does not mention the 'mode vocabulary claims only file effects' caveat. Network is unrestricted at the runner level. Phase 3 must address this separately.
- Plan does not mention the Windows per-session private temp SID. Important for cross-project isolation on Windows.
