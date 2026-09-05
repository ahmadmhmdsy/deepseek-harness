/**
 * Dictionary namespace owned by the App Builder deployments pane. Phase 2.5
 * ships English + Chinese keys for the pane chrome (header text, empty/error
 * states, deployment row status labels).
 */

/** String-union of dictionary keys declared by the deployments pane. */
export type AppBuilderDeploymentsKey =
  | 'paneTitle'
  | 'paneSubtitle'
  | 'noDeploymentsTitle'
  | 'noDeploymentsHint'
  | 'streamUnavailable'
  | 'streamClosed'
  | 'streamReconnecting'
  | 'statusPending'
  | 'statusRunning'
  | 'statusSucceeded'
  | 'statusFailed'
  | 'statusCancelled'
  | 'statusRejected'
  | 'deploymentTarget'
  | 'deploymentAge'
  | 'deploymentNoUrl'

export const en: Record<AppBuilderDeploymentsKey, string> = {
  paneTitle: 'Deployments',
  paneSubtitle: 'Track deploy lifecycle across your projects.',
  noDeploymentsTitle: 'No deployments yet',
  noDeploymentsHint: 'Deploy a project to see lifecycle events here.',
  streamUnavailable: 'Deployment stream unreachable.',
  streamClosed: 'Deployment stream closed.',
  streamReconnecting: 'Reconnecting to deployment stream…',
  statusPending: 'Pending',
  statusRunning: 'Running',
  statusSucceeded: 'Succeeded',
  statusFailed: 'Failed',
  statusCancelled: 'Cancelled',
  statusRejected: 'Rejected',
  deploymentTarget: 'Target',
  deploymentAge: 'Updated {ago}',
  deploymentNoUrl: 'No URL yet',
}

export const zh: Record<AppBuilderDeploymentsKey, string> = {
  paneTitle: '部署',
  paneSubtitle: '跟踪各项目的部署生命周期。',
  noDeploymentsTitle: '暂无部署',
  noDeploymentsHint: '部署一个项目以在此查看生命周期事件。',
  streamUnavailable: '无法连接部署事件流。',
  streamClosed: '部署事件流已关闭。',
  streamReconnecting: '正在重新连接部署事件流…',
  statusPending: '等待中',
  statusRunning: '运行中',
  statusSucceeded: '成功',
  statusFailed: '失败',
  statusCancelled: '已取消',
  statusRejected: '已拒绝',
  deploymentTarget: '目标',
  deploymentAge: '{ago}前更新',
  deploymentNoUrl: '暂无 URL',
}
