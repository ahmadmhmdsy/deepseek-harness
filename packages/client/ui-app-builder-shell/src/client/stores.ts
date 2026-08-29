/**
 * The App Builder shell's selection store: the selected project id, scoped
 * to the root entry (one shell instance, one selection). Module level exports
 * the factory only — a module-level handle would pin the store identity
 * across plugin reloads. `register()` receives the factory and the shell
 * derives its `PropsStore` share from the return type.
 *
 * The store does NOT persist: a fresh selection at shell mount time is the
 * right default; projects are server-state and resynced from the snapshot
 * endpoint on every mount.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'

/** Selection state owned by the shell. */
type AppBuilderShellState = {
  /** The currently selected project id, or undefined when none is selected. */
  selectedProjectId: string | undefined
}

/** Action twin (the export needs a declared return type for type inference). */
type AppBuilderShellActions = {
  /** Set or clear the selected project id. */
  selectProject: (draft: AppBuilderShellState, projectId: string | undefined) => void
}

/**
 * Create the shell selection store handle.
 * @returns the store handle (spec + type + identity + factory in one).
 */
export function createAppBuilderShellStore(): EngineStoreHandle<AppBuilderShellState, AppBuilderShellActions> {
  return defineStore({
    init: (): AppBuilderShellState => ({ selectedProjectId: undefined }),
    actions: {
      selectProject: (draft, projectId) => { draft.selectedProjectId = projectId },
    },
  })
}
