/**
 * Dictionary namespace owned by the App Builder projects pane. Phase 1 ships
 * English + Chinese keys for the pane chrome (header text, empty/error states,
 * project row status labels); the shell chrome copy lives in the shell package.
 */

/** String-union of dictionary keys declared by the projects pane. */
export type AppBuilderProjectsKey =
  | 'paneTitle'
  | 'paneSubtitle'
  | 'noProjectsTitle'
  | 'noProjectsHint'
  | 'snapshotUnavailable'
  | 'snapshotUnconfigured'
  | 'snapshotPolling'
  | 'previewStarting'
  | 'previewReady'
  | 'previewIdle'
  | 'previewFailed'

export const en: Record<AppBuilderProjectsKey, string> = {
  paneTitle: 'Projects',
  paneSubtitle: 'Pick a project to preview its dev server.',
  noProjectsTitle: 'No projects yet',
  noProjectsHint: 'Ask the agent to scaffold one with app_builder_scaffold.',
  snapshotUnavailable: 'Snapshot endpoint unreachable.',
  snapshotUnconfigured: 'Snapshot URL not configured.',
  snapshotPolling: 'Polling snapshot…',
  previewStarting: 'Preview starting…',
  previewReady: 'Preview ready',
  previewIdle: 'No preview',
  previewFailed: 'Preview failed',
}

export const zh: Record<AppBuilderProjectsKey, string> = {
  paneTitle: '项目',
  paneSubtitle: '选择一个项目以预览其开发服务器。',
  noProjectsTitle: '暂无项目',
  noProjectsHint: '让智能体使用 app_builder_scaffold 脚手架一个新项目。',
  snapshotUnavailable: '无法连接快照端点。',
  snapshotUnconfigured: '快照 URL 未配置。',
  snapshotPolling: '正在轮询快照…',
  previewStarting: '预览启动中…',
  previewReady: '预览就绪',
  previewIdle: '暂无预览',
  previewFailed: '预览失败',
}
