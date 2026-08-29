/**
 * App Builder top-level shell: a 3-pane CSS Grid (projects | chat | preview).
 * Component is a pure function of its four prop shares; no ctx access, no
 * direct subscription machinery. The selection store is read through the
 * PropsStore useStore selector hook; the selected project id is threaded
 * into the preview pane through the owner share.
 */
import type { AppBuilderShellComponentProps } from './contract/slots.ts'
import styles from './Shell.module.css'

/**
 * 3-pane App Builder shell renderer.
 * @param props - composed slot props (runtime share + render-slot + store + locale).
 * @returns the shell element with three rendered child slots.
 */
export function Shell(props: AppBuilderShellComponentProps): JSX.Element {
  const { renderSlot, useStore, t } = props
  const selectedProjectId = useStore((state: { selectedProjectId: string | undefined }) => state.selectedProjectId) as string | undefined
  return (
    <div className={styles.shell} data-app-builder-enabled='true'>
      <header className={styles.header}>{t('shellTitle')}</header>
      <aside className={styles.projects} data-pane='projects'>
        {renderSlot('app-builder.projects', {})}
      </aside>
      <section className={styles.chat} data-pane='chat'>
        {renderSlot('app-builder.conversation', {})}
      </section>
      <section className={styles.preview} data-pane='preview'>
        {selectedProjectId !== undefined
          ? renderSlot('app-builder.preview', { selectedProjectId })
          : <div className={styles.previewEmpty}>{t('noProjectSelected')}</div>}
      </section>
    </div>
  )
}
