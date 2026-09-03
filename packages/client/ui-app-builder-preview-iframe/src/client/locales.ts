/**
 * Dictionary namespace owned by the App Builder preview iframe pane. Phase 2.5
 * ships English + Chinese keys for the iframe chrome.
 */

/** String-union of dictionary keys declared by the preview iframe pane. */
export type AppBuilderPreviewIframeKey =
  | 'paneTitle'
  | 'paneSubtitle'
  | 'noProjectTitle'
  | 'noProjectHint'
  | 'previewIdle'
  | 'previewStarting'
  | 'previewReady'
  | 'previewFailed'
  | 'previewStopped'
  | 'previewNoUrl'
  | 'previewUrlLabel'
  | 'streamUnavailable'
  | 'streamClosed'
  | 'iframeAriaLabel'

export const en: Record<AppBuilderPreviewIframeKey, string> = {
  paneTitle: 'Preview',
  paneSubtitle: 'Live dev server for the selected project.',
  noProjectTitle: 'No project selected',
  noProjectHint: 'Pick a project from the list to preview its dev server.',
  previewIdle: 'Preview idle',
  previewStarting: 'Preview starting…',
  previewReady: 'Preview ready',
  previewFailed: 'Preview failed',
  previewStopped: 'Preview stopped',
  previewNoUrl: 'No URL available',
  previewUrlLabel: 'Preview URL',
  streamUnavailable: 'Preview stream unreachable.',
  streamClosed: 'Preview stream closed.',
  iframeAriaLabel: 'Preview iframe',
}

export const zh: Record<AppBuilderPreviewIframeKey, string> = {
  paneTitle: '预览',
  paneSubtitle: '所选项目的实时开发服务器。',
  noProjectTitle: '未选择项目',
  noProjectHint: '从列表中选择一个项目以预览其开发服务器。',
  previewIdle: '预览空闲',
  previewStarting: '预览启动中…',
  previewReady: '预览就绪',
  previewFailed: '预览失败',
  previewStopped: '预览已停止',
  previewNoUrl: '暂无 URL',
  previewUrlLabel: '预览 URL',
  streamUnavailable: '无法连接预览事件流。',
  streamClosed: '预览事件流已关闭。',
  iframeAriaLabel: '预览 iframe',
}
