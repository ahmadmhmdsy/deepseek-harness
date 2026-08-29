# ui-app-builder-shell

English | [中文](README.zh.md)

App Builder web shell plugin: a 3-pane CSS-Grid layout (projects | chat | preview) that occupies the root layout through the slot chain take-over mechanism when `appBuilder.enabled` is true. Composed under [planning/inspect/21-app-builder-web-shell.md](../../planning/inspect/21-app-builder-web-shell.md) on the `app-builder-web-reskin` branch.

## What ships in Phase 1

- Empty `apply()` host plugin (no Node-side behavior; pure browser UI).
- Browser `apply()` that registers `app-builder-shell` into the `root` slot through `ctx.slots.inject` (chain take-over) and declares three child slots: `app-builder.projects`, `app-builder.preview` (root scope), `app-builder.conversation` (session scope).
- `Shell` component rendering the 3-pane CSS-Grid layout, threading the selected project id from the slot-declared selection store into the preview pane through the owner share.
- `ctx.appBuilder` Cordis service exposing the shell's selection store as a typed service handle (a sibling package may write the selection through `ctx.appBuilder.selectProject(id)` without leaking the store handle across the package boundary).
- Locale dictionaries (English + Chinese) for the shell chrome.
- Invariant companion with a documented "No runtime invariant" reason.

## What does not ship yet

- The chain take-over of `root` requires the existing `ui-layout` `root` registration to declare `kind: chain` (currently `single`); this lands in a follow-up step together with the `appBuilder.enabled` config wiring in `apps/web/index.html`.
- The `ui-app-builder-projects` and `ui-app-builder-preview` packages do not exist yet; the shell renders empty placeholder regions until they are scaffolded. The `ui-app-builder-projects` package landed with `appBuilder` consuming the service; the preview package is the next consumer.
- The `ConversationRoot` registration is unchanged; the existing `@deepseek-ai/dsh-client-ui-conversation` entry fills the `app-builder.conversation` slot once `root` is restructured to chain.
- Server-state bridge (`/__dsh/app-builder/snapshot.json` polling) is a separate chunk.

## Known Limitations and Deferred Work

- **Chain take-over pending.** The shell declares its entry into `root` through `ctx.slots.inject`, but the existing `ui-layout` registration declares `root` as `single`. Without modifying `ui-layout` to declare `root` as `chain` (and adding a `select` that returns the `appBuilder.enabled` flag), the chain take-over is a load-time typecheck-only success that fails to actually replace the default layout. Resolved in a follow-up commit alongside the apps/web config wiring.
- **Three child slots are partially populated.** The `app-builder.projects` slot now has a consumer (`ui-app-builder-projects`); until `ui-app-builder-preview` ships the preview pane remains an empty `<section>`. The shell still typechecks and loads correctly.
- **No Pane-Resize dividers.** The 260px / 1fr / 1fr grid is fixed; drag-to-resize is deferred to Phase 2.
- **Selection propagates only through `ctx.appBuilder.selectProject`.** The shell exposes the selection store as a Cordis service so sibling panes can write selection without leaking the store handle. The shell itself reads selection via its own `useStore` share; preview and any future pane read selection the same way. Cross-package store sharing is forbidden by slot-system design — service handles are the sanctioned channel.
- **No multi-project preview.** One preview at a time; the projects list selection switches the URL. Multi-iframe live previews are Phase 2.
