/**
 * Cordis service contract the shell publishes for sibling packages to write
 * the shell's selection store. The shell is the implementation owner; this
 * file re-declares the SAME shape so the projects pane can type-check the
 * `ctx.appBuilder` access without importing from the shell package (cross-
 * package value imports are forbidden; service contracts are the sanctioned
 * cross-package channel). Both sides declare the same shape; TypeScript merges
 * them without conflict because the property types match.
 */
export interface AppBuilderShellService {
  /**
   * Write the selected project id into the shell's selection store. The shell
   * re-renders the preview pane through the same store's PropsStore share.
   * Calling with a previously-selected id is a no-op (the store actions are
   * idempotent on equal values).
   * @param id - the App Builder project id to select.
   */
  selectProject: (id: string) => void
}
