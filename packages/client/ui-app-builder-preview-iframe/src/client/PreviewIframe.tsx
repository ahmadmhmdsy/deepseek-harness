/**
 * App Builder preview iframe pane renderer: shows the iframe for the
 * currently selected project's dev-server URL when the preview is ready;
 * otherwise renders a state-specific empty card. The preview stream lives in
 * `apply()`; the snapshot store arrives through the inject `hooks`
 * compartment, and this component reads via the standard `useSnapshot`
 * selector hook.
 *
 * Sandbox: `allow-scripts` only (no allow-same-origin) so a hostile dev
 * server cannot reach the parent origin. Reload happens implicitly when
 * the URL changes (React re-renders the iframe element with a new src).
 */
import clsx from 'clsx'
import type { JSX } from 'react'
import type { AppBuilderPreviewIframeComponentProps } from './contract/slots.ts'
import type { PreviewStreamRecord } from './snapshot.ts'
import styles from './PreviewIframe.module.css'

/** Owner-prop view of the current selection (the shell passes it on renderSlot). */
type OwnerSelection = { readonly selectedProjectId?: string }

/** Map preview status → label key + CSS variant. */
type StatusLabelKey = 'previewIdle' | 'previewStarting' | 'previewReady' | 'previewFailed' | 'previewStopped'
type StatusVariant = 'idle' | 'starting' | 'ready' | 'failed' | 'stopped'

function statusPresentation(status: PreviewStreamRecord['status']): {
  labelKey: StatusLabelKey
  variant: StatusVariant
} {
  switch (status) {
    case 'idle': return { labelKey: 'previewIdle', variant: 'idle' }
    case 'starting': return { labelKey: 'previewStarting', variant: 'starting' }
    case 'ready': return { labelKey: 'previewReady', variant: 'ready' }
    case 'failed': return { labelKey: 'previewFailed', variant: 'failed' }
    case 'stopped': return { labelKey: 'previewStopped', variant: 'stopped' }
  }
}

/**
 * 4-pane App Builder preview iframe pane renderer.
 * @param props - composed slot props (runtime + locale + inject face).
 * @returns the preview pane element.
 */
export function PreviewIframe(props: AppBuilderPreviewIframeComponentProps): JSX.Element {
  const { useSnapshot, t } = props
  const ownerSelection = (props as unknown as OwnerSelection).selectedProjectId
  const state = useSnapshot(s => ({
    records: s.records,
    status: s.status,
    error: s.error,
  }))
  const projectId = ownerSelection
  const record = projectId !== undefined ? state.records[projectId] : undefined
  return (
    <div className={styles.pane} data-pane='preview-iframe'>
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
      {projectId === undefined
        ? renderEmpty(t('noProjectTitle'), t('noProjectHint'), styles)
        : record === undefined
          ? renderEmpty(t('previewIdle'), t('previewNoUrl'), styles)
          : renderRecord(record, t, styles)}
    </div>
  )
}

function renderEmpty(title: string, hint: string, styles: Record<string, string>): JSX.Element {
  return (
    <div className={styles.empty}>
      <span className={styles.emptyTitle}>{title}</span>
      <span className={styles.emptyHint}>{hint}</span>
    </div>
  )
}

function renderRecord(
  record: PreviewStreamRecord,
  t: AppBuilderPreviewIframeComponentProps['t'],
  styles: Record<string, string>,
): JSX.Element {
  const pres = statusPresentation(record.status)
  const label = t(pres.labelKey)
  const url = record.url
  const iframeSrc = pres.variant === 'ready' && url !== undefined ? url : undefined
  return (
    <>
      <div className={styles.iframeWrap}>
        {iframeSrc !== undefined
          ? (
            <iframe
              key={iframeSrc}
              className={styles.iframe}
              src={iframeSrc}
              sandbox='allow-scripts'
              data-project-id={record.projectId}
              data-status={record.status}
              title={t('iframeAriaLabel')}
              aria-label={t('iframeAriaLabel')}
            />
          )
          : (
            <div className={styles.empty}>
              <span className={styles.emptyTitle}>
                <span className={clsx(styles.statusDot, styles['statusDot_' + pres.variant])} aria-hidden='true' />
                {label}
              </span>
              <span className={styles.emptyHint}>{record.message ?? record.reason ?? ''}</span>
              {url !== undefined
                ? <span className={styles.urlBadge}>{t('previewUrlLabel')}: {url}</span>
                : <span className={styles.urlBadgePlaceholder}>{t('previewNoUrl')}</span>}
            </div>
          )}
      </div>
    </>
  )
}
