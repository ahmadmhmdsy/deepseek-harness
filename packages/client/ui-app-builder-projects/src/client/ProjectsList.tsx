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
import type { JSX } from 'react'
import type { AppBuilderProjectsComponentProps } from './contract/slots.ts'
import type { AppBuilderProject, AppBuilderDevServer } from './snapshot.ts'
import styles from './ProjectsList.module.css'

/** Plural form returned by Intl.PluralRules for the active locale. The pane owns the formatter; the t() helper carries the strings. */
type SessionCountForm = 'one' | 'other'

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
              sessionCount={state.snapshot.sessionCounts[project.id]}
              selected={ownerSelection === project.id}
              onSelect={selectProject}
              tStarting={t('previewStarting')}
              tReady={t('previewReady')}
              tIdle={t('previewIdle')}
              tFailed={t('previewFailed')}
              tSessionCountOne={t('sessionCountOne')}
              tSessionCountOther={t('sessionCountOther')}
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
  sessionCount: number | undefined
  selected: boolean
  onSelect: (id: string) => void
  tStarting: string
  tReady: string
  tIdle: string
  tFailed: string
  tSessionCountOne: string
  tSessionCountOther: string
}): JSX.Element {
  const { project, devServer, sessionCount, selected, onSelect } = props
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
  // Render the session-count badge only when the host published a positive
  // count. Zero / undefined values render no badge so the row matches the
  // host's empty state and so the visual surface stays minimal for projects
  // with no live sessions yet. The badge carries the count text via the
  // locale-aware t() formatter and announces the count to assistive tech.
  const badge = sessionCount !== undefined && sessionCount > 0
    ? (
      <span
        className={styles.badge}
        data-session-count={sessionCount}
        aria-label={formatSessionCountLabel(sessionCount, props.tSessionCountOne, props.tSessionCountOther)}
      >
        {formatSessionCountLabel(sessionCount, props.tSessionCountOne, props.tSessionCountOther)}
      </span>
    )
    : null
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
      {badge}
    </button>
  )
}

/**
 * Render the session-count chip text. Uses Intl.PluralRules on the project
 * count to pick between the `one` and `other` dictionary entries; the
 * English count text includes the numeric value for visual scanability.
 */
function formatSessionCountLabel(count: number, oneText: string, otherText: string): string {
  const rules = new Intl.PluralRules('en').select(count)
  const form: SessionCountForm = rules === 'one' ? 'one' : 'other'
  const template = form === 'one' ? oneText : otherText
  return template.replace('{count}', String(count))
}
