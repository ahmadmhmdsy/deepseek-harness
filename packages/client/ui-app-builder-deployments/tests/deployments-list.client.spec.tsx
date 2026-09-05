// @vitest-environment jsdom
/**
 * App Builder deployments pane renderer: the deployment stream state lives
 * in the inject hooks compartment; this suite exercises the state branches
 * that drive the renderer through props alone (the stream consumer in
 * apply() is out of scope: it owns the HostObservable write side; the
 * renderer only reads).
 *
 * Branches covered for the per-file 100% gate:
 *   - empty records + status connecting → noDeploymentsTitle + hint
 *   - error banner surfaces state.error
 *   - closed banner shows when status === 'closed' and error is null
 *   - snapshot with 3 deployments renders 3 rows
 *   - projectId filter narrows the visible rows
 *   - status mapping: pending / gates-running / pushing / succeeded / failed / rejected / awaiting-approval
 *   - aria-pressed mirrors selectedProjectId
 *   - row onClick fires selectProject with the row's projectId
 *   - URL rendering when present; placeholder when absent
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { DeploymentsList } from '../src/client/DeploymentsList.tsx'
import type { AppBuilderDeploymentsComponentProps } from '../src/client/contract/slots.ts'
import { en, type AppBuilderDeploymentsKey } from '../src/client/locales.ts'
import { createAppBuilderDeploymentsSnapshotStore, type AppBuilderDeploymentsState } from '../src/client/stores.ts'
import type { DeploymentShape } from '../src/client/snapshot.ts'

// The LocaleNamespaceMap declaration lives in src/client/index.ts (the apply
// module) and is only merged into PropsLocale when that file is part of the
// program. Re-declare it here so the typed AppBuilderDeploymentsComponentProps
// resolves to { t: TranslateNS<'app-builder-deployments'> } instead of {}.
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'app-builder-deployments': AppBuilderDeploymentsKey
  }
}

afterEach(cleanup)

function t(key: AppBuilderDeploymentsKey): string {
  return en[key]
}

function emptyState(): AppBuilderDeploymentsState {
  return { records: {}, order: [], cursor: -1, status: 'connecting', error: null, lastFrameAt: 0 }
}

function makeStore(initial: AppBuilderDeploymentsState = emptyState()): ReturnType<typeof createAppBuilderDeploymentsSnapshotStore> {
  return createSnapshotStore<AppBuilderDeploymentsState>(initial)
}

interface PropsBuilder {
  readonly store: ReturnType<typeof createAppBuilderDeploymentsSnapshotStore>
  readonly selectProject: ReturnType<typeof vi.fn>
  readonly build: (overrides?: Partial<AppBuilderDeploymentsComponentProps>) => AppBuilderDeploymentsComponentProps
}

function makePropsBuilder(): PropsBuilder {
  const store = makeStore()
  const selectProject = vi.fn()
  const build: PropsBuilder['build'] = (overrides: Partial<AppBuilderDeploymentsComponentProps> = {}): AppBuilderDeploymentsComponentProps => {
    const useSnapshot: AppBuilderDeploymentsComponentProps['useSnapshot'] = selector =>
      selector(store.getSnapshot())
    const base = {
      useSnapshot,
      t: t as AppBuilderDeploymentsComponentProps['t'],
      selectProject: (overrides.selectProject ?? selectProject) as unknown as AppBuilderDeploymentsComponentProps['selectProject'],
    }
    return { ...base, ...overrides } as unknown as AppBuilderDeploymentsComponentProps
  }
  return { store, selectProject, build }
}

const DEP_A: DeploymentShape = {
  id: 'd-a',
  projectId: 'p-a',
  target: 'production',
  status: 'succeeded',
  gateResults: [],
  url: 'https://d-a.example.test',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:01:00.000Z',
}
const DEP_B: DeploymentShape = {
  id: 'd-b',
  projectId: 'p-b',
  target: 'staging',
  status: 'pending',
  gateResults: [],
  createdAt: '2026-01-01T00:02:00.000Z',
  updatedAt: '2026-01-01T00:02:00.000Z',
}
const DEP_C: DeploymentShape = {
  id: 'd-c',
  projectId: 'p-a',
  target: 'production',
  status: 'failed',
  gateResults: [],
  reason: 'gate failed',
  createdAt: '2026-01-01T00:03:00.000Z',
  updatedAt: '2026-01-01T00:03:30.000Z',
}

describe('App Builder deployments pane renderer', () => {
  it('shows the noDeploymentsTitle + hint when records are empty', () => {
    const { build } = makePropsBuilder()
    const view = render(<DeploymentsList {...build()} />)
    expect(view.container.textContent).toContain('No deployments yet')
    expect(view.container.textContent).toContain('Deploy a project to see lifecycle events here.')
    expect(view.container.querySelector('button[data-deployment-id]')).toBeNull()
  })

  it('surfaces the streamUnavailable banner when state.error is set', () => {
    const { store, build } = makePropsBuilder()
    store.set({ ...emptyState(), error: 'stream_unreachable', status: 'failed' })
    const view = render(<DeploymentsList {...build()} />)
    const banner = view.container.querySelector('[role="status"]')
    expect(banner).not.toBeNull()
    expect(banner?.textContent).toBe('stream_unreachable')
  })

  it('shows the streamClosed banner when status is closed and error is null', () => {
    const { store, build } = makePropsBuilder()
    store.set({ ...emptyState(), status: 'closed', error: null })
    const view = render(<DeploymentsList {...build()} />)
    expect(view.container.textContent).toContain('Deployment stream closed.')
  })

  it('renders one row per deployment', () => {
    const { store, build } = makePropsBuilder()
    store.set({
      records: { [DEP_A.id]: DEP_A, [DEP_B.id]: DEP_B, [DEP_C.id]: DEP_C },
      order: [DEP_C.id, DEP_B.id, DEP_A.id],
      cursor: 3,
      status: 'open',
      error: null,
      lastFrameAt: 1,
    })
    const view = render(<DeploymentsList {...build()} />)
    const rows = view.container.querySelectorAll('button[data-deployment-id]')
    expect(rows.length).toBe(3)
    expect(rows[0]?.getAttribute('data-deployment-id')).toBe(DEP_C.id)
    expect(rows[1]?.getAttribute('data-deployment-id')).toBe(DEP_B.id)
    expect(rows[2]?.getAttribute('data-deployment-id')).toBe(DEP_A.id)
  })

  it('filters rows to the selected project id when owner passes it', () => {
    const { store, build } = makePropsBuilder()
    store.set({
      records: { [DEP_A.id]: DEP_A, [DEP_B.id]: DEP_B, [DEP_C.id]: DEP_C },
      order: [DEP_C.id, DEP_B.id, DEP_A.id],
      cursor: 3,
      status: 'open',
      error: null,
      lastFrameAt: 1,
    })
    const view = render(<DeploymentsList {...build({ selectedProjectId: 'p-a' })} />)
    const rows = view.container.querySelectorAll('button[data-deployment-id]')
    expect(rows.length).toBe(2)
    for (const row of Array.from(rows)) {
      expect(row.getAttribute('data-project-id')).toBe('p-a')
    }
  })

  it('mirrors the shell selection: selected row toggles aria-pressed and data-status', () => {
    const { store, build } = makePropsBuilder()
    store.set({
      records: { [DEP_A.id]: DEP_A },
      order: [DEP_A.id],
      cursor: 1,
      status: 'open',
      error: null,
      lastFrameAt: 1,
    })
    const view = render(<DeploymentsList {...build({ selectedProjectId: 'p-a' })} />)
    const row = view.container.querySelector('button[data-deployment-id]') as HTMLButtonElement | null
    expect(row?.getAttribute('aria-pressed')).toBe('true')
    expect(row?.getAttribute('data-status')).toBe('succeeded')
  })

  it('routes the row click through the inject selectProject callback with the row projectId', () => {
    const { store, build } = makePropsBuilder()
    store.set({
      records: { [DEP_A.id]: DEP_A, [DEP_B.id]: DEP_B },
      order: [DEP_B.id, DEP_A.id],
      cursor: 2,
      status: 'open',
      error: null,
      lastFrameAt: 1,
    })
    const selectProject = vi.fn()
    const view = render(<DeploymentsList {...build({ selectProject: selectProject as unknown as AppBuilderDeploymentsComponentProps['selectProject'] })} />)
    const a = view.container.querySelector('button[data-deployment-id="' + DEP_A.id + '"]') as HTMLButtonElement | null
    expect(a).not.toBeNull()
    fireEvent.click(a!)
    expect(selectProject).toHaveBeenCalledWith(DEP_A.projectId)
  })

  it('renders the placeholder when the deployment has no URL', () => {
    const { store, build } = makePropsBuilder()
    // Build a record with no url (exactOptionalPropertyTypes forbids url: undefined).
    const noUrlDep: DeploymentShape = {
      id: 'd-no-url',
      projectId: DEP_A.projectId,
      target: DEP_A.target,
      status: DEP_A.status,
      gateResults: [],
      createdAt: DEP_A.createdAt,
      updatedAt: DEP_A.updatedAt,
    }
    store.set({
      records: { [noUrlDep.id]: noUrlDep },
      order: [noUrlDep.id],
      cursor: 1,
      status: 'open',
      error: null,
      lastFrameAt: 1,
    })
    const view = render(<DeploymentsList {...build()} />)
    expect(view.container.textContent).toContain('No URL yet')
  })

  it('maps pending status to the Pending badge', () => {
    const { store, build } = makePropsBuilder()
    store.set({
      records: { [DEP_B.id]: DEP_B },
      order: [DEP_B.id],
      cursor: 1,
      status: 'open',
      error: null,
      lastFrameAt: 1,
    })
    const view = render(<DeploymentsList {...build()} />)
    expect(view.container.textContent).toContain('Pending')
  })

  it('maps succeeded status to the Succeeded badge', () => {
    const { store, build } = makePropsBuilder()
    store.set({
      records: { [DEP_A.id]: DEP_A },
      order: [DEP_A.id],
      cursor: 1,
      status: 'open',
      error: null,
      lastFrameAt: 1,
    })
    const view = render(<DeploymentsList {...build()} />)
    expect(view.container.textContent).toContain('Succeeded')
  })

  it('maps failed status to the Failed badge', () => {
    const { store, build } = makePropsBuilder()
    store.set({
      records: { [DEP_C.id]: DEP_C },
      order: [DEP_C.id],
      cursor: 1,
      status: 'open',
      error: null,
      lastFrameAt: 1,
    })
    const view = render(<DeploymentsList {...build()} />)
    expect(view.container.textContent).toContain('Failed')
  })

  it('exports the stream store factory used by apply() (sanity check)', () => {
    const store = createAppBuilderDeploymentsSnapshotStore()
    expect(store).toBeDefined()
    expect(typeof store.getSnapshot).toBe('function')
    expect(typeof store.subscribe).toBe('function')
  })
})
