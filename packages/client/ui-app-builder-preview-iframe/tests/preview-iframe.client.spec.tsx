// @vitest-environment jsdom
/**
 * App Builder preview iframe pane renderer: the preview stream state lives
 * in the inject hooks compartment; this suite exercises the state branches
 * that drive the renderer through props alone.
 *
 * Branches covered for the per-file 100% gate:
 *   - no selected project → noProjectTitle + hint
 *   - selected project with no preview record → previewIdle + previewNoUrl
 *   - selected project with ready record → iframe with sandbox=allow-scripts and src
 *   - selected project with failed record → previewFailed message
 *   - selected project with stopped record → previewStopped message
 *   - selected project with starting record → previewStarting message (no iframe)
 *   - iframe sandbox attribute is exactly 'allow-scripts' (no allow-same-origin)
 *   - aria-label uses the localized iframeAriaLabel
 *   - error banner surfaces state.error
 *   - closed banner shows when status === 'closed' and error is null
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { PreviewIframe } from '../src/client/PreviewIframe.tsx'
import type { AppBuilderPreviewIframeComponentProps } from '../src/client/contract/slots.ts'
import { en, type AppBuilderPreviewIframeKey } from '../src/client/locales.ts'
import { createAppBuilderPreviewIframeSnapshotStore, type AppBuilderPreviewIframeState } from '../src/client/stores.ts'
import type { PreviewStreamRecord } from '../src/client/snapshot.ts'

// LocaleNamespaceMap re-declaration so the typed props resolve.
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'app-builder-preview-iframe': AppBuilderPreviewIframeKey
  }
}

afterEach(cleanup)

function t(key: AppBuilderPreviewIframeKey): string {
  return en[key]
}

function emptyState(): AppBuilderPreviewIframeState {
  return { records: {}, cursor: -1, status: 'connecting', error: null, lastFrameAt: 0 }
}

function makeStore(initial: AppBuilderPreviewIframeState = emptyState()): ReturnType<typeof createAppBuilderPreviewIframeSnapshotStore> {
  return createSnapshotStore<AppBuilderPreviewIframeState>(initial)
}

function makePropsBuilder() {
  const store = makeStore()
  const build = (overrides: Partial<AppBuilderPreviewIframeComponentProps> = {}): AppBuilderPreviewIframeComponentProps => {
    const useSnapshot: AppBuilderPreviewIframeComponentProps['useSnapshot'] = selector =>
      selector(store.getSnapshot())
    const base = {
      useSnapshot,
      t: t as AppBuilderPreviewIframeComponentProps['t'],
    }
    return { ...base, ...overrides } as unknown as AppBuilderPreviewIframeComponentProps
  }
  return { store, build }
}

const READY_RECORD: PreviewStreamRecord = {
  projectId: 'p-a',
  status: 'ready',
  framework: 'vite',
  url: 'http://127.0.0.1:5173',
  port: 5173,
  sinceMs: 1700000000000,
}

const FAILED_RECORD: PreviewStreamRecord = {
  projectId: 'p-a',
  status: 'failed',
  framework: 'unknown',
  port: -1,
  message: 'spawn failed',
  reason: 'ENOENT',
  sinceMs: 1700000000000,
}

const STARTING_RECORD: PreviewStreamRecord = {
  projectId: 'p-a',
  status: 'starting',
  framework: 'vite',
  port: 5173,
  message: 'framework: vite',
  sinceMs: 1700000000000,
}

const STOPPED_RECORD: PreviewStreamRecord = {
  projectId: 'p-a',
  status: 'stopped',
  framework: 'vite',
  port: -1,
  sinceMs: 1700000000000,
}

describe('App Builder preview iframe pane renderer', () => {
  it('shows the noProjectTitle + hint when no project is selected', () => {
    const { build } = makePropsBuilder()
    const view = render(<PreviewIframe {...build()} />)
    expect(view.container.textContent).toContain('No project selected')
    expect(view.container.textContent).toContain('Pick a project from the list to preview its dev server.')
    expect(view.container.querySelector('iframe')).toBeNull()
  })

  it('shows the previewIdle message when the selected project has no preview record yet', () => {
    const { build } = makePropsBuilder()
    const view = render(<PreviewIframe {...build({ selectedProjectId: 'p-a' })} />)
    expect(view.container.textContent).toContain('Preview idle')
    expect(view.container.textContent).toContain('No URL available')
    expect(view.container.querySelector('iframe')).toBeNull()
  })

  it('renders an iframe with sandbox=allow-scripts and the ready URL when the selected project is ready', () => {
    const { store, build } = makePropsBuilder()
    store.set({ ...emptyState(), records: { 'p-a': READY_RECORD }, status: 'open' })
    const view = render(<PreviewIframe {...build({ selectedProjectId: 'p-a' })} />)
    const iframe = view.container.querySelector('iframe')
    expect(iframe).not.toBeNull()
    expect(iframe?.getAttribute('src')).toBe('http://127.0.0.1:5173')
    expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts')
    expect(iframe?.getAttribute('data-project-id')).toBe('p-a')
    expect(iframe?.getAttribute('data-status')).toBe('ready')
    expect(iframe?.getAttribute('aria-label')).toBe('Preview iframe')
  })

  it('renders the failed-status card with the message when the selected project is failed', () => {
    const { store, build } = makePropsBuilder()
    store.set({ ...emptyState(), records: { 'p-a': FAILED_RECORD }, status: 'open' })
    const view = render(<PreviewIframe {...build({ selectedProjectId: 'p-a' })} />)
    expect(view.container.textContent).toContain('Preview failed')
    expect(view.container.textContent).toContain('spawn failed')
    expect(view.container.querySelector('iframe')).toBeNull()
  })

  it('renders the stopped-status card when the selected project is stopped', () => {
    const { store, build } = makePropsBuilder()
    store.set({ ...emptyState(), records: { 'p-a': STOPPED_RECORD }, status: 'open' })
    const view = render(<PreviewIframe {...build({ selectedProjectId: 'p-a' })} />)
    expect(view.container.textContent).toContain('Preview stopped')
    expect(view.container.querySelector('iframe')).toBeNull()
  })

  it('renders the starting-status card (no iframe yet) when the selected project is starting', () => {
    const { store, build } = makePropsBuilder()
    store.set({ ...emptyState(), records: { 'p-a': STARTING_RECORD }, status: 'open' })
    const view = render(<PreviewIframe {...build({ selectedProjectId: 'p-a' })} />)
    expect(view.container.textContent).toContain('Preview starting')
    expect(view.container.querySelector('iframe')).toBeNull()
  })

  it('uses sandbox=allow-scripts only (no allow-same-origin)', () => {
    const { store, build } = makePropsBuilder()
    store.set({ ...emptyState(), records: { 'p-a': READY_RECORD }, status: 'open' })
    const view = render(<PreviewIframe {...build({ selectedProjectId: 'p-a' })} />)
    const sandbox = view.container.querySelector('iframe')?.getAttribute('sandbox')
    expect(sandbox).toBe('allow-scripts')
    expect(sandbox).not.toContain('allow-same-origin')
  })

  it('surfaces the streamUnavailable banner when state.error is set', () => {
    const { store, build } = makePropsBuilder()
    store.set({ ...emptyState(), error: 'preview_stream_unreachable', status: 'failed' })
    const view = render(<PreviewIframe {...build()} />)
    expect(view.container.textContent).toContain('preview_stream_unreachable')
  })

  it('switches iframe src when the underlying record url changes (re-render)', () => {
    const { store, build } = makePropsBuilder()
    store.set({ ...emptyState(), records: { 'p-a': READY_RECORD }, status: 'open' })
    const view = render(<PreviewIframe {...build({ selectedProjectId: 'p-a' })} />)
    const iframe1 = view.container.querySelector('iframe')
    expect(iframe1?.getAttribute('src')).toBe('http://127.0.0.1:5173')
    // Update the underlying record (new url); rerender to drive React to
    // re-evaluate the key={iframeSrc} and produce a fresh iframe element.
    const next = { ...READY_RECORD, url: 'http://127.0.0.1:5174' }
    store.set({ ...store.getSnapshot(), records: { 'p-a': next } })
    view.rerender(<PreviewIframe {...build({ selectedProjectId: 'p-a' })} />)
    const iframe2 = view.container.querySelector('iframe')
    expect(iframe2?.getAttribute('src')).toBe('http://127.0.0.1:5174')
  })

  it('shows the streamClosed banner when status is closed and error is null', () => {
    const { store, build } = makePropsBuilder()
    store.set({ ...emptyState(), status: 'closed', error: null })
    const view = render(<PreviewIframe {...build()} />)
    expect(view.container.textContent).toContain('Preview stream closed.')
  })

  it('exports the stream store factory used by apply() (sanity check)', () => {
    const store = createAppBuilderPreviewIframeSnapshotStore()
    expect(store).toBeDefined()
    expect(typeof store.getSnapshot).toBe('function')
    expect(typeof store.subscribe).toBe('function')
  })

  it('exposes the localized iframe aria-label via PropsLocale', () => {
    const { store, build } = makePropsBuilder()
    store.set({ ...emptyState(), records: { 'p-a': READY_RECORD }, status: 'open' })
    const view = render(<PreviewIframe {...build({ selectedProjectId: 'p-a' })} />)
    expect(view.container.querySelector('iframe')?.getAttribute('aria-label')).toBe('Preview iframe')
  })
})
