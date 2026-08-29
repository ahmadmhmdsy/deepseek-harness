/**
 * App Builder projects pane renderer: a vertical list of project rows with
 * selection state mirrored from the shell's selection store through the
 * `selectedProjectId` owner prop (the shell passes it on every renderSlot),
 * and selection writes routed through the inject face's `selectProject`
 * callback (which closes over the host-published `ctx.appBuilder` service).
 *
 * The component is a pure function of its four prop shares; no ctx access, no
 * subscription machinery. Snapshot polling lives in `apply()`; the snapshot
 * store arrives through the inject `hooks` compartment, and this component
 * reads via the standard `useSnapshot` selector hook (no local mirror, no
 * manual subscribe wiring).
 */
import clsx from 'clsx'
import type { AppBuilderProjectsComponentProps } from './contract/slots.ts'
import type { AppBuilderProject, AppBuilderDevServer } from './snapshot.ts'
import styles from './ProjectsList.module.css'

/** Owner-prop view of the current selection (the shell passes it on renderSlot). */
type OwnerSelection = { selectedProjectId?: string | undefined }

/**
 * 3-pane App Builder projects pane renderer.
 * @param props - composed slot props (runtime + locale + inject face).
 * @returns the projects pane element.
 */
export function ProjectsList(props: AppBuilderProjectsComponentProps): JSX.Element {
  const { useSnapshot, t, selectProject, snapshotUrl } = props
  const ownerSelection = (props as unknown as OwnerSelection).selectedProjectId
  const state = useSnapshot(s => ({
    snapshot: s.snapshot,
    error: s.error,
    loading: s.loading,
  }))
  const projects = state.snapshot.projects
  const devServers = state.snapshot.devServers
  return (
    <div className={styles.pane} data-pane='projects-list'>
      <header className={styles.header}>
        <span className={styles.title}>{t('paneTitle')}</span>
        <span className={styles.subtitle}>{t('paneSubtitle')}</span>
      </header>
      {state.error !== null && (
        <div className={styles.errorBanner} role='status'>
          {state.error === 'snapshot_unconfigured' ? t('snapshotUnconfigured') : t('snapshotUnavailable')}
        </div>
      )}
      <div className={styles.list}>
        {projects.length === 0
          ? <EmptyState
            loading={state.loading}
            snapshotUrl={snapshotUrl}
            tError={t('snapshotUnavailable')}
            tTitle={t('noProjectsTitle')}
            tHint={t('noProjectsHint')}
          />
          : projects.map(project => (
            <ProjectRow
              key={project.id}
              project={project}
              devServer={devServers[project.id]}
              selected={ownerSelection === project.id}
              onSelect={selectProject}
              tStarting={t('previewStarting')}
              tReady={t('previewReady')}
              tIdle={t('previewIdle')}
              tFailed={t('previewFailed')}
            />
          ))}
      </div>
    </div>
  )
}

function EmptyState(props: {
  loading: boolean
  snapshotUrl: string
  tError: string
  tTitle: string
  tHint: string
}): JSX.Element {
  if (props.snapshotUrl === '') {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyTitle}>{props.tError}</span>
        <span className={styles.emptyHint}>{props.tError}</span>
      </div>
    )
  }
  return (
    <div className={styles.empty}>
      <span className={styles.emptyTitle}>{props.tTitle}</span>
      <span className={styles.emptyHint}>{props.tHint}</span>
    </div>
  )
}

function ProjectRow(props: {
  project: AppBuilderProject
  devServer: AppBuilderDevServer | undefined
  selected: boolean
  onSelect: (id: string) => void
  tStarting: string
  tReady: string
  tIdle: string
  tFailed: string
}): JSX.Element {
  const { project, devServer, selected, onSelect } = props
  const status = devServer?.status ?? 'idle'
  const statusLabel = status === 'ready' ? props.tReady
    : status === 'starting' ? props.tStarting
      : status === 'failed' ? props.tFailed
        : props.tIdle
  const dotClass = clsx(
    styles.dot,
    status === 'ready' && styles.dotReady,
    status === 'starting' && styles.dotStarting,
    status === 'failed' && styles.dotFailed,
  )
  return (
    <button
      type='button'
      className={clsx(styles.row, selected && styles.rowSelected)}
      data-project-id={project.id}
      data-selected={selected ? 'true' : 'false'}
      aria-pressed={selected}
      onClick={() => { onSelect(project.id) }}
    >
      <span className={dotClass} aria-hidden='true' />
      <span className={styles.rowBody}>
        <span className={styles.rowTitle}>{project.title}</span>
        <span className={styles.rowMeta}>{project.rootPath}</span>
      </span>
      <span className={styles.statusLabel}>{statusLabel}</span>
    </button>
  )
}
