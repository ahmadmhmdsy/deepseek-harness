# Agent Note: Gateway — idempotent contribution mount (Phase 2.5 double-mount fix)

Status: implemented

English

## Problem
The assembled App Builder browser failed to load plugins with
`failed to apply loader entry (@deepseek-ai/dsh-client-ui-app-builder-preview-iframe): client api: direct method appBuilder/createProject is already mounted`. Both
ui-app-builder-deployments and ui-app-builder-preview-iframe mount the same
`appBuilderApiRemote` in their apply closures (the documented Phase 2.5
"Option B bypass" for the TS2878/aggregator blocker), and the gateway threw
on the second mount of the same contribution package. The plan-time
`test:gui` tier cannot see it; only the assembled-browser run can.

## Decision
Re-`$mount` of the same contribution package shares one refcounted
installation: a shared hit bumps the refcount and the caller's release
decrements it; the last release disposes. A same-package remount with a
different method set still fails loud; a different contribution colliding on
an endpoint keeps the existing throw. Endpoint identity is the sorted set of
`invocation.kind + endpoint` per descriptor.

Changed: packages/api/gateway/src/client/index.ts,
tests/gateway.client.spec.ts (2 new tests: shared-mount refcount lifecycle;
same-package-different-methods rejection).

## Alternatives considered
- Aggregate both panes' remotes in packages/api/remotes
  (upstream-sanctioned cleanup): 10+-package blast radius; deferred with the
  typert emitter Option A.
- Single-pane-owner mounting: rejected — apply order is unconstrained
  (packages/client AGENTS.md), so ownership cannot be assigned.

## Consequences
- Both panes mount their remote independently; teardown of one does not
  dispose the other's live installation.

## Invariants
- Different-contribution endpoint collisions still throw (fail loud).
- Disposal semantics: last release disposes; a released caller's retained
  reference resolves the gateway's unmounted-method error.

## Risks
- A caller that never releases leaks one refcount; acceptable while mounts
  ride plugin fibers (unload releases).
