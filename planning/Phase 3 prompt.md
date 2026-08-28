# TASK: Phase 3 — Multi-user scale

Read [docs/PROJECT.md](../../docs/PROJECT.md) first. **Do NOT start until Phases 0–2 are accepted.** Goal: isolated tenants on one deployment.

## 0. Resolved decisions for Phase 3

- **Egress proxy**: small Node-based proxy in `packages/app-builder/egress-proxy/`. Re-uses dsh primitives: `ctx.sessionQuery` for the allow-list snapshot, `dsh-token-meter` for rate-limit buckets, `dsh-host-apiproxy` as the model. Audit log goes through the dsh event log.
  - **Re-evaluation trigger**: migrate to external Squid if any of:
    - Need for TLS termination in the proxy.
    - Need for ICAP content scanning (secrets / DLP).
    - Throughput ceiling (proxy becomes the bottleneck).
    - Compliance requirement (Squid is the only approved egress in some orgs).
  - **Migration cost**: replace the Node server with Squid config; the allow-list store + rate-limit logic stays in dsh as a control-plane API that Squid calls via `external_acl_type`; the audit log stays in dsh.
- **Quota package**: wrap and extend `@deepseek-ai/dsh-token-meter` in `packages/app-builder/quota/`. The wrapper is NOT a passive observer; it is a `tools/post-execute` listener that calls `meter.record(...)` + `checkBudget(...)` synchronously. dsh-token-meter does accounting; the wrapper does enforcement (budgets, alerts, hard-stops).
  - **Re-evaluation trigger**: if dsh-token-meter's API becomes inadequate for the App Builder's budget composition (e.g., per-tool token accounting). Either extend dsh-token-meter upstream, or build the quota package fresh and have it own the accounting too.

## 1. Auth package (`packages/app-builder/auth/`)

- The control plane becomes the auth boundary; dsh's local RPC stays unauthenticated behind it.
- Use `@deepseek-ai/dsh-anonymous-user-id` as the base identity; add real auth (cookie + session, or OAuth).
- Per-project non-privileged user identity (one Linux/Windows user per project where the platform supports it).

## 2. Egress proxy (`packages/app-builder/egress-proxy/`)

(See "Resolved decisions" above for the Node-based vs. external Squid choice and the re-evaluation trigger.)

- **Why**: Landlock/bwrap/Seatbelt/Windows-ACL confine file effects but NOT network. The mode vocabulary claims only file effects. App Builder needs per-project network policy.
- Build a small Node-based HTTP egress proxy with:
  - Per-project allow-list of host:port (consulted via `ctx.sessionQuery`).
  - Per-project rate limit (token bucket, derived from `dsh-token-meter`).
  - Audit log of every request (`egress/{allowed,blocked,rate-limited}` events appended to the session log).
  - Same config surface as everything else: `cordis.yml` mount; settings namespace for the allow-list; `ctx.approval` for changes.
  - Same deployment: the control plane (`apps/web`) already runs Node; adding a Node service is one process.
  - Modeled on `@deepseek-ai/dsh-host-apiproxy`; consult that package's pattern first.
- Per-project dev-server traffic also flows through this proxy (preview pane shows the proxied URL).

## 3. Quota package (`packages/app-builder/quota/`)

(See "Resolved decisions" above for the wrap-and-extend vs. build-fresh choice and the re-evaluation trigger.)

- **Wraps and extends** `@deepseek-ai/dsh-token-meter`. dsh-token-meter does accounting; the wrapper does enforcement.
- The wrapper is NOT a passive observer; it is a `tools/post-execute` listener that calls `meter.record(...)` + `checkBudget(...)` synchronously. This avoids races between record and check.
- Per-user budgets: tokens, cost, retries, sessions.
- Cache-aware pricing (reads `prompt_cache_hit_tokens`).
- Alerts when approaching limits (via `ctx.approval`); hard-stop at the limit (via `QuotaExceededError` returned from the listener).
- Single source of truth: dsh-token-meter. No duplicated accounting wire format.
- Same event vocabulary: `usage/token-recorded` (existing) + `usage/budget-alerted` + `usage/budget-exceeded` (new).

## 4. Per-project worker pool

- Today: one `dsh` process per workspace.
- Phase 3: one `dsh` process per project, started/stopped by the control plane.
- Reuse the existing `dsh` CLI bin (`@deepseek-ai/dsh`) launched as a subprocess with the project dir as `cwd`.

## 5. Memory isolation

- Per-user `$DSH_HOME` directory at the storage layer.
- Per-user `session-query-sqlite` derived index.
- Per-project session directory under the user's home.

## 6. Preview proxying

- Per-project preview proxying via `@deepseek-ai/dsh-host-apiproxy`.
- Rate-limited per user.

## 7. Deployment pipeline

- `git push -> CI -> target` per project, behind approval.
- Per-project deploy credentials (scoped to one repo).

## 8. Snapshot tests

- `multi-tenant-isolation` (two users in two projects; cross-read attempts fail).
- `quota-enforced` (token budget exhausted; further requests rejected).
- `egress-proxy-blocked` (host not in allow-list; request denied).
- `deploy-gated` (approval missing; deploy blocked).

## 9. Agent Notes

- `multi-tenant-isolation` (per-project workers + per-user storage).
- `quota-enforcement` (token budget + alerts).
- `egress-proxy` (per-project network policy).

## 10. Adversarial tests

- Project A's worker tries to read Project B's files -> denied.
- Unbounded loop hits quota -> rejected with reason.
- Web fetch to non-allow-listed host -> denied by egress proxy.
- Deploy without approval -> blocked; `deployment/failed` event.

## 11. Per-package obligations

(Same as Phases 1–2.) `tests/`, `./invariant`, README + JSDoc, real-composition test, per-file 100% coverage, bilingual README, catalog registration, tsconfig extends `tsconfig.base.json`.

## 12. Update `docs/PROJECT.md`

Update the canonical source of truth with any schema/API/event-type changes.

## Verification

`pnpm run typecheck && pnpm run test:coverage && pnpm run test:snapshot && pnpm run doc-sync && pnpm run hygiene` — all green.

## Definition of done

- Two concurrent users build apps in isolated sandboxes with no cross-talk.
- Quotas enforced.
- Deployments gated and auditable.
- All five verification commands pass.

## Do NOT in Phase 3

- Do not expose dsh's local RPC; keep it behind the auth boundary.
- Do not skip the egress proxy; Landlock cannot restrict network.
- Do not weaken the per-file 100% coverage requirement.
- Do not skip the per-package invariant companion.

## Report

Report: new packages, worker pool architecture, snapshot scenarios, Agent Notes, gate results. Update `docs/PROJECT.md` with final architecture.
