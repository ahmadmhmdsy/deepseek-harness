# Agent Note: App Builder shell — chain take-over at root (per-area 1.5.x follow-up)

Status: implemented

English

## Problem
The App Builder shell never mounted. Its old apply() registered the shell
under a brand-new slot key:

    ctx.slots.inject('root', () => ctx.slots.register({ name: 'app-builder-shell', ... }, Shell))

No parent entry's children table declares `app-builder-shell` as a key, so
SlotCore.register() rejected it at load with
`slot "app-builder-shell" is not declared (a parent entry's children table
must declare it)`. The earlier process note that documented this outage
attributed it to two upstream BFF bugs; both were misdiagnoses — the
`!!js '/__dsh/app-builder/snapshot.json'` literal in
packages/bundle/web-app/cordis.patch.yml is a valid registered-tag
expression, and packages/app-builder/snapshot-bridge/src/index.ts declares
`inject = ['webServer', 'appBuilderProjects']` exactly as its use site
consumes it. The defect was the client slot graph, not the bridge. That
note's hot-fix (a transient `dsh web --patch` overlay disabling the
app-builder-shell, app-builder-projects, and app-builder-snapshot-bridge
rows) existed to unblock the classic boot while the chain-vs-single
decision was open; this note's decision resolves it and retires the
overlay. That note's named coverage gap survives this consolidation: no
static gate walks the runtime slot parent/child graph
(`verify-bundled-slot-graph` remains an open suggestion); today the seam
is covered by the root-election tests plus the assembled-browser smoke.

## Decision
Flip the built-in `root` slot from `kind: 'single'` to `kind: 'chain'`
(SlotCore constructor + ui-renderer SlotMap), reusing the
`conversation.composer` pattern: two plugins compose at the same hole, and
the renderer's root election consumes the entries.

- `RootOutlet` runs the chain election the child-slot chain branch already
  ran: selectors run in ledger order (priority ascending, the register
  sort); the first non-null election renders with its marker injected as
  `matched`; a crashing selector degrades to a decline; all-decline renders
  the crash face; zero registrations keeps the boot-order throw.
- `ui-app-builder-shell` registers at priority 0 with
  `select: () => ({ tag: 'app-builder' })` — consulted first.
- `ui-layout` registers the classic AppFrame at priority 1 with
  `select: () => ({ tag: 'classic' })` — the always-electing fallback.

Enablement is apply-time: `ui-app-builder-shell` apply() returns early when
`config.enabled === false`, so only the classic entry exists; the entry's
select does not re-check the config. The conversation pane is declared
`session-maybe` (the classic `conversation` slot's scope): a strict-session
slot crashes under the root's session-maybe binding when no session exists.

Changed: packages/client/ui-slots/src/index.ts (root spec),
packages/client/ui-renderer/src/client/scoped-slots.tsx (RootOutlet
election), packages/client/ui-renderer/src/client/registry.ts (SlotMap
root), packages/client/ui-layout/src/client/index.ts (classic fallback
entry), packages/client/ui-app-builder-shell/src/client/index.ts and
contract/slots.ts (take-over entry + session-maybe conversation), ~38 test
files (chain-kind root registers require `select`; four fake-host renderer
suites default one on root entries).

## Alternatives considered
- Single occupant with ui-layout flipping to a chain child of
  'app-builder-shell': wider blast radius, inverts root ownership.
- Higher-priority-wins election at root (the WIP's original assumption):
  contradicts the core's ascending-priority chain order and the composer
  take-over pattern; the conditional entry must be consulted first.
- Keep `entriesOfSlot('root')[0]` with no election: the `select` contract
  at root would be dead surface, `matched` never injected, all-decline
  silently rendering the first entry.
- Defer (classic UI only): leaves the shell dead; no per-area re-enable.

## Consequences
- The cordis.patch overlay's three disabled App Builder rows are retired;
  the plugins are enabled by default.
- Note #2's temporary fallback no longer applies.
- No package registers into `app-builder.conversation` yet (ui-conversation
  fills the classic `conversation` slot only); the pane renders naturally
  empty until that registration lands.

## Invariants
- Chain-kind root preserves the fail-loud contract: when every chain
  entry's select declines, the root outlet renders the crash face rather
  than a silent blank; zero registrations still throws the boot-order
  error.
- Chain-kind selectors are pure (ChainSelect contract in ui-slots).
- The shell is the priority-0 elected entry while its plugin is enabled; the
  classic AppFrame is the priority-1 fallback.

## Risks
- Test contract drift: any future test asserting a single-kind root needs
  the chain contract (root registers require `select`).
