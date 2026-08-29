/**
 * Dictionary namespace owned by the App Builder shell. Phase 1 ships English
 * + Chinese keys for the shell chrome (header title, pane labels, empty-
 * state text); per-pane copy lives with each pane package.
 */

/** String-union of dictionary keys declared by the shell. */
export type AppBuilderShellKey =
  | 'shellTitle'
  | 'projectsPaneTitle'
  | 'chatPaneTitle'
  | 'previewPaneTitle'
  | 'noProjectSelected'

export const en: Record<AppBuilderShellKey, string> = {
  shellTitle: 'App Builder',
  projectsPaneTitle: 'Projects',
  chatPaneTitle: 'Chat',
  previewPaneTitle: 'Preview',
  noProjectSelected: 'Select a project to preview its dev server.',
}

export const zh: Record<AppBuilderShellKey, string> = {
  shellTitle: '应用构建器',
  projectsPaneTitle: '项目',
  chatPaneTitle: '对话',
  previewPaneTitle: '预览',
  noProjectSelected: '选择一个项目以预览其开发服务器。',
}
