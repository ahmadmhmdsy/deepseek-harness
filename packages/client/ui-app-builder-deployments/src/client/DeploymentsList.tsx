/**
 * App Builder deployments pane renderer: a vertical list of deployment
 * rows with the lifecycle status, target, and last-updated time. The
 * deployment stream lives in `apply()`; the snapshot store arrives through
 * the inject `hooks` compartment, and this component reads via the
 * standard `useSnapshot` selector hook.
 *
 * The component is a pure function of its four prop shares; no ctx access,
 * no subscription machinery. The optional owner `selectedProjectId` filters
 * the list to deployments of that project; absent means show every
 * deployment.
 */
import clsx from 'clsx'
import type { JSX } from 'react'
import type { AppBuilderDeploymentsComponentProps } from './contract/slots.ts'
import type { DeploymentShape, DeploymentStatusValue } from './snapshot.ts'
import styles from './DeploymentsList.module.css'

/** Owner-prop view of the current selection (the shell passes it on renderSlot). */
type OwnerSelection = { readonly selectedProjectId?: string }

/** Status → label key + CSS variant mapping. */
type StatusLabelKey = 'statusPending' | 'statusRunning' | 'statusSucceeded' | 'statusFailed' | 'statusRejected'
type StatusVariant = 'pending' | 'running' | 'succeeded' | 'failed' | 'rejected'

function statusPresentation(status: DeploymentStatusValue): { labelKey: StatusLabelKey; variant: StatusVariant } {
  switch (status) {
    case 'pending': return { labelKey: 'statusPending', variant: 'pending' }
    case 'gates-running':
    case 'pushing':
      return { labelKey: 'statusRunning', variant: 'running' }
    case 'awaiting-approval':
      return { labelKey: 'statusRunning', variant: 'running' }
    case 'succeeded': return { labelKey: 'statusSucceeded', variant: 'succeeded' }
    case 'failed':
    case 'gates-failed':
      return { labelKey: 'statusFailed', variant: 'failed' }
    case 'rejected': return { labelKey: 'statusRejected', variant: 'rejected' }
  }
}

/**
 * 4-pane App Builder deployments pane renderer.
 * @param props - composed slot props (runtime + locale + inject face).
 * @returns the deployments pane element.
 */
export function DeploymentsList(props: AppBuilderDeploymentsComponentProps): JSX.Element {
  const { useSnapshot, t, selectProject } = props
  const ownerSelection = (props as unknown as OwnerSelection).selectedProjectId
  const state = useSnapshot(s => ({
    records: s.records,
    order: s.order,
    status: s.status,
    error: s.error,
  }))
  const filtered = filterByProject(state.order, state.records, ownerSelection)
  const tMap: Record<StatusLabelKey, string> = {
    statusPending: t('statusPending'),
    statusRunning: t('statusRunning'),
    statusSucceeded: t('statusSucceeded'),
    statusFailed: t('statusFailed'),
    statusRejected: t('statusCancelled'),
  }
  return (
    <div className={styles.pane} data-pane='deployments-list'>
      <header className={styles.header}>
        <span className={styles.title}>{t('paneTitle')}</span>
        <span className={styles.subtitle}>{t('paneSubtitle')}</span>
      </header>
      {state.error !== null && (
        <div className={styles.errorBanner} role='status'>{state.error}</div>
      )}
      {state.status === 'closed' && state.error === null && (
        <div className={styles.closedBanner} role='status'>{t('streamClosed')}</div>
      )}
      {filtered.length === 0
        ? (
          <div className={styles.empty}>
            <span className={styles.emptyTitle}>{t('noDeploymentsTitle')}</span>
            <span className={styles.emptyHint}>{t('noDeploymentsHint')}</span>
          </div>
        )
        : (
          <div className={styles.list}>
            {filtered.map((id) => {
              const dep = state.records[id]
              if (dep === undefined) return null
              return (
                <DeploymentRow
                  key={dep.id}
                  deployment={dep}
                  selectedProjectId={ownerSelection}
                  onSelect={selectProject}
                  tMap={tMap}
                  deploymentTarget={t('deploymentTarget')}
                  deploymentNoUrl={t('deploymentNoUrl')}
                />
              )
            })}
          </div>
        )}
    </div>
  )
}

/** Filter the ordered id list by the optional selected project id. */
function filterByProject(
  order: readonly string[],
  records: Readonly<Record<string, DeploymentShape>>,
  projectId: string | undefined,
): readonly string[] {
  if (projectId === undefined) return order
  const out: string[] = []
  for (const id of order) {
    const r = records[id]
    if (r !== undefined && r.projectId === projectId) out.push(id)
  }
  return out
}

function DeploymentRow(props: {
  deployment: DeploymentShape
  selectedProjectId: string | undefined
  onSelect: (id: string) => void
  tMap: Record<StatusLabelKey, string>
  deploymentTarget: string
  deploymentNoUrl: string
}): JSX.Element {
  const { deployment, selectedProjectId, onSelect, tMap, deploymentTarget, deploymentNoUrl } = props
  const pres = statusPresentation(deployment.status)
  const label = tMap[pres.labelKey]
  const isSelected = selectedProjectId === deployment.projectId
  return (
    <button
      type='button'
      className={clsx(styles.row, isSelected && styles.rowSelected)}
      data-deployment-id={deployment.id}
      data-project-id={deployment.projectId}
      data-status={deployment.status}
      aria-pressed={isSelected}
      onClick={() => { onSelect(deployment.projectId) }}
    >
      <span className={styles.rowBody}>
        <span className={styles.rowTitle}>{deployment.id}</span>
        <span className={styles.rowMeta}>{deploymentTarget}: {deployment.target}</span>
        {deployment.url !== undefined
          ? <span className={styles.rowUrl}>{deployment.url}</span>
          : <span className={styles.rowUrlPlaceholder}>{deploymentNoUrl}</span>}
      </span>
      <span className={clsx(styles.statusBadge, styles['status_' + pres.variant])}>{label}</span>
    </button>
  )
}
