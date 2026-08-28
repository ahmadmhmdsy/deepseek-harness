# Step 7 — Session/Event system: durability, projection, replay

> Status: COMPLETE. Phase alignment: the event-sourced session log the plan describes as Phase 1.4 + 2.1 work.

## Headline finding

**The plan's 'event-sourced sessions to resume/fork/replay' is already implemented end-to-end.** The persistence, projection, query, and projection-cache layers are mature and documented. Phase 2.1 of the plan should mostly be 'wrap a Project around an existing Session' rather than 'build the event log'.

## Session log (event-sourced model)

`packages/core/session` owns:

- `SessionStore` (ctx key: `sessions`) — creates and holds live `Session` instances.
- `Session` class — append-only event log; `append(type, data, opts?)` snapshots + freezes durable data, validates marker shape and cited source-event seqs, commits synchronously, then notifies observers with independent failure containment.
- `SessionSurface` — readonly ordered projection over message-producing events (the model-history view). Rewrite-rebuilding; no raw-log fallback for consumer reads.
- `deriveMessages()` — incrementally projects each new surface entry once and returns the fresh frozen array.
- `SessionHeader` — detached, deep-frozen creation metadata: `version`, `id`, `createdAt`, optional `cwd` / `parentSession` / `seedLength` / `delegationDepth` / `agentPreset` / `origin`.
- `chunk-rows.ts` — lossless codec: storage records are `SessionEvent` JSON verbatim, or packed chunk rows for runs of >=3 same-block `assistant/chunk` deltas. Reading is layout-blind (packed, unpacked, mixed files all load identically).
- Lossless JSON helpers: `isJsonValue`, `snapshotJsonValue` (iterative, one-pass, propagates throwing getters, finite JSON numbers except `-0`, dense arrays, plain objects; rejects cycles and exotic prototypes).

**Agent Note reference:** `SessionEventType` is a closed union; session event JSDoc requires `@mode` and payload `@param`; scoped keys absent from payloads need `@dshScopeScan unsupported`. `SESSION_FORMAT_VERSION` is the breaking-change anchor.

## Persistence seam

| Package | Role |
|---|---|
| `packages/session/session-persistence` | `SessionPersistence` Service Definition + invariants |
| `packages/session/session-persistence-jsonl` | Default JSONL backend with zstd compression (or raw) |
| `packages/session/session-persistence-sqlite` | Alternate SQLite backend |

**`dsh-session-persistence` invariants every backend must honor:**

1. **Append-only; a crashed turn is closed, not truncated.** Flushed events are never rewritten. A crash can leave an unclosed final turn whose events are real and possibly large; `load` preserves them and durably appends synthetic closers (a risk-classified error `tool/result` per unanswered assistant call, then `step/end?`+`turn/end {interrupted}`) to balance the log.
2. **Contiguous seq.** `load` rejects a `seq` gap/parse error in the MIDDLE of the log; `append`'s first `seq` must equal the stored next-seq.
3. **JSON-serializable data.** `append` materializes each batch through the shared lossless-JSON boundary.
4. **Durability.** `append` returns only once the batch is durable.

**`PersistenceCoordinator`** owns per-id state and serialization, one bounded write controller per live session, lazy materialization, crash-tail repair, session adoption, and quiescent disposal. JSONL and SQLite share lifecycle correctness through it.

## Session-query seam (the 'control plane index')

| Package | Role |
|---|---|
| `packages/session-query/session-query` | Service Definition: trusted reads, relationship queries, search |
| `packages/session-query/session-query-sqlite` | SQLite FTS5 implementation (searchSessions / searchEvents) |
| `packages/session-query/session-log-export` | Web `/export` command + browser download |
| `packages/session-query/tool-session-query` | Model-facing tool (workspace-authorized session queries) |

**Plan Phase 2 'GET /sessions/:id/events' (SSE) and 'GET /sessions/:id/transcript':**

- `ctx.sessionQuery.readSession(sessionId)` returns one complete detached raw log.
- `ctx.sessionQuery.readSurface(sessionId)` returns one cloned header, raw-log capture boundary, and the complete folded current surface in model-history order.
- `ctx.sessionQuery.readTitleSnapshots(sessionIds, signal?)` resolves titles from one live-preferred corpus observation.
- `ctx.sessionQuery.traceSession(sessionId, signal?)` returns immediate-to-outward ancestors + recursive descendant trees.
- `ctx.sessionQuery.filterSessions(filters, signal?)` and `filterEvents(sessionId, filters)` provide provider-independent metadata and literal-text filtering.
- Live streaming uses the projection push frame (`session/projection`) + agent lifecycle notifications (`session.status`).

## Projection registry

`packages/session/session-projection` is the per-domain projection registry.

- `ctx.sessionProjections.register(definition)` — register one domain's unit (synchronous state-driven computation).
- `ctx.sessionProjections.onChanged(listener)` — subscribe to the change feed.
- `ctx.sessionProjections.stateOf(session, key)` — live read-only reference.
- `ctx.sessionProjections.snapshot(session)` — one consistent synchronous cut: `{ asOfSeq, values }`.

**Contract:**

- The framework drives; the domain computes. Every committed event passes every unit's `apply` eagerly. Cells (`{state, observedSeq}` per unit per session) build lazily.
- **Same-reference means no work.** `apply` MUST return the same state reference for events that do not concern the unit.
- **Whole-value event rule (load-bearing).** A state-carrying log event MUST carry the complete post-change state, never a bare delta.
- **Synchronous unit discipline.** `init`/`apply`/`wire.view` MUST be synchronous.
- **State validated, `stateVersion` is the invalidation anchor.** Bump `stateVersion` whenever the state fields or fold semantics change.
- **No wire vocabulary here.** Carriers (api-proxy) mint their own frames.
- **Optional capability.** Domain plugins register under `ctx.inject(['sessionProjections'], …)` so headless assemblies without the registry stay unaffected.

## Projection cache (persisted)

`packages/session/session-projection-cache` provides durable checkpoints of every projection unit's state (one record per session on the `session_projcache` domain).

**Invariants:**
- **A stored row is a fold shortcut, never an authority.** Possibly stale (`seq` says exactly how stale) but never wrong.
- **Every background write is fail-soft.** A failed write logs a warning and keeps the cache stale; the next write or cold read self-heals.
- **A `ver` mismatch against the live unit's `stateVersion` discards, never migrates.**
- **A row must pass the live unit's `stateSchema`.** Malformed rows are omitted from the zero-I/O view and rejected by restore.
- **Whole-record writes.** Each write replaces the session's full checkpoint.
- **Records are bound to a log lifecycle, not just an id.** Each record stores the header identity (`createdAt`, `cwd`) it was folded from; every read validates it.
- **The log leads, the cache follows.** A live checkpoint flushes the session's buffered events durably BEFORE the cache row lands.

**Write policy:** two mandatory points (turn/end + session disposal), throttled by `writeEveryEvents` and `writeIntervalMs`. Both `Config` fields are required — no defaults.

**Read ladder (`coldSnapshot(id, signal?)`):** cached rows -> `sessionProjections.restoreFloor` -> persistence `readFrom(id, floor)` -> `sessionProjections.restore` -> fail-soft write-back of refreshed rows. Anchored one event below the lowest usable watermark, so a shrunk log is provable.

## Session stats (existing projection unit)

`packages/session/session-stats` registers a `sessionStats` projection unit computing whole-log conversation figures — turn/step counts and the LLM, tool, first-token, and decode wall times.

**Plan Phase 2 'GET /users/:id/usage (token + cost, cache-aware)':** this is the data source. The cache-aware token accounting would come from `packages/llm/token-meter` + a `usage` projection unit. New work.

## Session titles (existing projection unit)

`packages/session/session-title` provides log-backed session titles with an immediate deterministic fallback and one optional asynchronous provider. Every revision is a log-only `session/title` event.

`packages/session/session-title-first-prompt-llm` — LLM-backed first-prompt title provider.
`packages/session/session-title-all-prompts-llm` — LLM-backed all-prompts title provider.

## Session telemetry (existing)

`packages/session/session-telemetry` + `packages/session/session-telemetry-otel` — OpenTelemetry observability for the session lifecycle.

## Fork / resume (already in core/session + core/agent)

- `ctx.sessions.fork(source, boundary?, childSessionId?): Session` — child session with lineage metadata; `seedLength` is preserved.
- `ctx.agents.create({ seed?, meta?, ... })` — programmatic create under caller-supplied id; seed reconstructs a forked child prefix after the session boundary validates and snapshots the durable values.
- `ctx.agents.resume({ resumeSessionId, ... })` — load a persisted session, mint a fresh unpublished agent scope, reconstruct its history.
- `agent.send({ kind: 'followup' | 'steer' | 'inject' })` — same primitive.

## Plan implications

Phase 2.1's data model and API are largely greenfield at the User/Project/Deployment level but the Session log is mature:

1. **Project entity** is the new work. Each project owns one or more sessions; `Project.cwd` becomes the agent's session cwd.
2. **Deployment entity** is greenfield. Add dsh events for `deployment/{started,succeeded,failed}` so the event log captures it.
3. **ToolPolicy manifest** is partly there (permissions, sandbox-policy); the new work is the typed schema and the enforcer.
4. **REST + SSE API** mounts over Typert RPC. The read path uses `ctx.sessionQuery` (already there) + a new `ctx.appBuilder.listProjects/getProject` etc.
5. **Resume/fork** are already there.
6. **Audit trail** is the event log itself. Every tool call is a `tool/call`+`tool/result` pair; every state-changing action is an event.

## Plan mismatches identified (carried to Step 14)

- The plan overcounts 'event-sourced sessions' as Phase 1.4 + 2.1 work. The session log, projection registry, projection cache, session-query, session-stats, and session-title are all done. The new work is binding them to the Project entity, not building the infrastructure.
- The plan calls for 'audit trail'. The event log IS the audit trail. The new work is a query UI.
- The plan does not mention the projection-cache 'write policy requires explicit config'. The App Builder must decide turn-vs-interval flush cadence.
- The plan does not mention session-query-sqlite as the App Builder's 'project/session index'. This is the actual mechanism; the plan's 'Postgres for the control-plane index' would replace a working component.
- The plan does not mention session telemetry. OpenTelemetry already wires in; we get traces for free if we use it.
- The plan does not mention the 'agent/initiator scope' boundary (no unscoped service access) or the agent/event vocabulary; both shape the App Builder's UI surface.
