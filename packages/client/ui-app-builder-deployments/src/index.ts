/**
 * App Builder deployments pane, node half. Pure UI plugin: the empty apply exists
 * so the plugin appears in the host cordis.yml / Loader; the browser half
 * ships via `exports["./client"]`, discovered through the package.json
 * `dsh.client` declaration. Composition flows from
 * `planning/inspect/21-app-builder-web-shell.md`.
 */

/** Host plugin body — no host-side behavior; the deployments pane renders entirely in the browser. */
export function apply(): void {}
