// @vitest-environment jsdom
/**
 * App Builder projects pane renderer: the snapshot polling state lives in
 * the inject hooks compartment; this suite exercises the four
 * state branches that drive the renderer through props alone (the polling
 * effect in apply() is out of scope: it owns the HostObservable write
 * side; the renderer only reads).
 *
 * Branches covered for the per-file 100% gate:
 *   - empty snapshot with empty snapshot URL (snapshotUnconfigured banner)
 *   - empty snapshot with valid snapshot URL (noProjectsTitle + hint)
 *   - non-empty snapshot renders one row per project
 *   - error banner shows state.error when set
 *   - status colors fire on ready / starting / failed / idle
 *   - session-count badge renders for count > 0
 *   - session-count badge omits for count === 0 or undefined
 *   - Intl.PluralRules arms: count === 1 (one) and count > 1 (other)
 *   - selected row toggles aria-pressed and data-selected
 *   - row onClick fires the inject selectProject callback with the row id
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { ProjectsList } from '../src/client/ProjectsList.tsx'
import type { AppBuilderProjectsComponentProps } from '../src/client/contract/slots.ts'
import { EMPTY_SNAPSHOT, type AppBuilderSnapshot } from '../src/client/snapshot.ts'
import { en, type AppBuilderProjectsKey } from '../src/client/locales.ts'
import { createAppBuilderProjectsSnapshotStore, type AppBuilderProjectsState } from '../src/client/stores.ts'

// The LocaleNamespaceMap declaration lives in src/client/index.ts (the apply
// module) and is only merged into PropsLocale when that file is part of the
// program. Re-declare it here so the typed AppBuilderProjectsComponentProps
// resolves to { t: TranslateNS<'app-builder-projects'> } instead of {}.
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'app-builder-projects': AppBuilderProjectsKey
  }
}

afterEach(cleanup)

function t(key: AppBuilderProjectsKey): string {
  return en[key]
}

function emptyState(): AppBuilderProjectsState {
  return { snapshot: EMPTY_SNAPSHOT, error: null, lastSuccessAt: 0, loading: false }
}

function makeStore(initial: AppBuilderProjectsState = emptyState()): ReturnType<typeof createAppBuilderProjectsSnapshotStore> {
  return createSnapshotStore<AppBuilderProjectsState>(initial)
}

interface PropsBuilder {
  readonly store: ReturnType<typeof createAppBuilderProjectsSnapshotStore>
  readonly selectProject: ReturnType<typeof vi.fn>
  readonly build: (overrides?: Partial<AppBuilderProjectsComponentProps>) => AppBuilderProjectsComponentProps
}

function makePropsBuilder(): PropsBuilder {
  const store = makeStore()
  const selectProject = vi.fn()
  const build: PropsBuilder['build'] = (overrides: Partial<AppBuilderProjectsComponentProps> = {}): AppBuilderProjectsComponentProps => {
    const useSnapshot: AppBuilderProjectsComponentProps['useSnapshot'] = selector =>
      selector(store.getSnapshot())
    const base = {
      useSnapshot,
      t: t as AppBuilderProjectsComponentProps['t'],
      selectProject: (overrides.selectProject ?? selectProject) as unknown as AppBuilderProjectsComponentProps['selectProject'],
      snapshotUrl: '/__dsh/app-builder/snapshot.json',
    }
    return { ...base, ...overrides } as unknown as AppBuilderProjectsComponentProps
  }
  return { store, selectProject, build }
}

const PROJECT_A = {
  id: 'p-a',
  title: 'alpha',
  rootPath: '/tmp/alpha',
  template: 'nextjs-app',
  createdAt: 1700000000000,
} as const
const PROJECT_B = {
  id: 'p-b',
  title: 'beta',
  rootPath: '/tmp/beta',
  createdAt: 1700000001000,
} as const

describe('App Builder projects pane renderer', () => {
  it('shows the snapshotUnconfigured banner when the polling state carries snapshot_unconfigured', () => {
    const { store, build } = makePropsBuilder()
    // apply() writes the 'snapshot_unconfigured' sentinel when its config
    // snapshotUrl is empty. The renderer treats that as the errorBanner
    // trigger and surfaces the snapshotUnconfigured copy.
    store.set({ snapshot: EMPTY_SNAPSHOT, error: 'snapshot_unconfigured', lastSuccessAt: 0, loading: false })
    const view = render(<ProjectsList {...build()} />)
    const banner = view.container.querySelector('[role="status"]')
    expect(banner).not.toBeNull()
    expect(banner?.textContent).toBe('Snapshot URL not configured.')
    expect(view.container.textContent).toContain('Projects')
  })

  it('shows the noProjectsTitle + noProjectsHint when the snapshot has no projects but a valid url', () => {
    const { build } = makePropsBuilder()
    const view = render(<ProjectsList {...build()} />)
    expect(view.container.textContent).toContain('No projects yet')
    expect(view.container.textContent).toContain('Ask the agent to scaffold one with app_builder_scaffold.')
    expect(view.container.querySelector('[role="status"]')).toBeNull()
  })

  it('renders one row per project with its title and rootPath and the statusLabel', () => {
    const { store, build } = makePropsBuilder()
    const snapshot: AppBuilderSnapshot = {
      ts: 1,
      projects: [PROJECT_A, PROJECT_B],
      devServers: {
        [PROJECT_A.id]: { port: 3000, status: 'ready', updatedAt: 1 },
        [PROJECT_B.id]: { port: 5173, status: 'starting', updatedAt: 1, message: 'framework: vite' },
      },
      sessionCounts: {},
    }
    store.set({ snapshot, error: null, lastSuccessAt: 0, loading: false })
    const view = render(<ProjectsList {...build()} />)
    const rows = view.container.querySelectorAll('button[data-project-id]')
    expect(rows.length).toBe(2)
    expect(rows[0]?.getAttribute('data-project-id')).toBe(PROJECT_A.id)
    expect(rows[1]?.getAttribute('data-project-id')).toBe(PROJECT_B.id)
    expect(view.container.textContent).toContain('alpha')
    expect(view.container.textContent).toContain('/tmp/alpha')
    expect(view.container.textContent).toContain('beta')
    expect(view.container.textContent).toContain('Preview ready')
    expect(view.container.textContent).toContain('Preview starting…')
  })

  it('surfaces the snapshotUnavailable banner when the snapshot polling state carries an error', () => {
    const { store, build } = makePropsBuilder()
    store.set({ snapshot: EMPTY_SNAPSHOT, error: 'snapshot fetch failed: 503 Service Unavailable', lastSuccessAt: 0, loading: false })
    const view = render(<ProjectsList {...build()} />)
    const banner = view.container.querySelector('[role="status"]')
    expect(banner).not.toBeNull()
    expect(banner?.textContent).toBe('Snapshot endpoint unreachable.')
  })

  it('renders the failed-status dot and label when a project dev server is in failed state', () => {
    const { store, build } = makePropsBuilder()
    const snapshot: AppBuilderSnapshot = {
      ts: 1,
      projects: [PROJECT_A],
      devServers: { [PROJECT_A.id]: { port: -1, status: 'failed', updatedAt: 1, message: 'spawn failed' } },
      sessionCounts: {},
    }
    store.set({ snapshot, error: null, lastSuccessAt: 0, loading: false })
    const view = render(<ProjectsList {...build()} />)
    expect(view.container.textContent).toContain('Preview failed')
  })

  it('renders the idle status label when a project has no devServer entry', () => {
    const { store, build } = makePropsBuilder()
    const snapshot: AppBuilderSnapshot = {
      ts: 1,
      projects: [PROJECT_A],
      devServers: {},
      sessionCounts: {},
    }
    store.set({ snapshot, error: null, lastSuccessAt: 0, loading: false })
    const view = render(<ProjectsList {...build()} />)
    expect(view.container.textContent).toContain('No preview')
  })

  it('renders the count badge using the one arm of Intl.PluralRules when the project owns exactly one session', () => {
    const { store, build } = makePropsBuilder()
    const snapshot: AppBuilderSnapshot = {
      ts: 1,
      projects: [PROJECT_A],
      devServers: {},
      sessionCounts: { [PROJECT_A.id]: 1 },
    }
    store.set({ snapshot, error: null, lastSuccessAt: 0, loading: false })
    const view = render(<ProjectsList {...build()} />)
    const badge = view.container.querySelector('span[data-session-count]')
    expect(badge).not.toBeNull()
    expect(badge?.getAttribute('data-session-count')).toBe('1')
    expect(badge?.textContent).toBe('1 session')
    expect(badge?.getAttribute('aria-label')).toBe('1 session')
  })

  it('renders the count badge using the other arm of Intl.PluralRules when the project owns multiple sessions', () => {
    const { store, build } = makePropsBuilder()
    const snapshot: AppBuilderSnapshot = {
      ts: 1,
      projects: [PROJECT_A],
      devServers: {},
      sessionCounts: { [PROJECT_A.id]: 3 },
    }
    store.set({ snapshot, error: null, lastSuccessAt: 0, loading: false })
    const view = render(<ProjectsList {...build()} />)
    const badge = view.container.querySelector('span[data-session-count]')
    expect(badge).not.toBeNull()
    expect(badge?.getAttribute('data-session-count')).toBe('3')
    expect(badge?.textContent).toBe('3 sessions')
    expect(badge?.getAttribute('aria-label')).toBe('3 sessions')
  })

  it('omits the count badge when the published count is zero', () => {
    const { store, build } = makePropsBuilder()
    const snapshot: AppBuilderSnapshot = {
      ts: 1,
      projects: [PROJECT_A],
      devServers: {},
      sessionCounts: { [PROJECT_A.id]: 0 },
    }
    store.set({ snapshot, error: null, lastSuccessAt: 0, loading: false })
    const view = render(<ProjectsList {...build()} />)
    expect(view.container.querySelector('span[data-session-count]')).toBeNull()
  })

  it('omits the count badge when the published map has no key for this project', () => {
    const { store, build } = makePropsBuilder()
    const snapshot: AppBuilderSnapshot = {
      ts: 1,
      projects: [PROJECT_A],
      devServers: {},
      sessionCounts: { 'other-project': 5 },
    }
    store.set({ snapshot, error: null, lastSuccessAt: 0, loading: false })
    const view = render(<ProjectsList {...build()} />)
    expect(view.container.querySelector('span[data-session-count]')).toBeNull()
  })

  it('omits the count badge when the snapshot was published by a host without the sessionCounts field (forward-compat)', () => {
    const { store, build } = makePropsBuilder()
    // Pre-Phase-2.4 hosts lack the sessionCounts key entirely. The
    // normalizeSnapshot function in index.ts coerces the missing key to {},
    // so the renderer sees the same shape as the empty-record case.
    const snapshot: AppBuilderSnapshot = { ...EMPTY_SNAPSHOT, ts: 1, projects: [PROJECT_A] }
    store.set({ snapshot, error: null, lastSuccessAt: 0, loading: false })
    const view = render(<ProjectsList {...build()} />)
    expect(view.container.querySelector('span[data-session-count]')).toBeNull()
  })

  it('renders different badges per project when the count map covers multiple rows', () => {
    const { store, build } = makePropsBuilder()
    const snapshot: AppBuilderSnapshot = {
      ts: 1,
      projects: [PROJECT_A, PROJECT_B],
      devServers: {},
      sessionCounts: { [PROJECT_A.id]: 1, [PROJECT_B.id]: 7 },
    }
    store.set({ snapshot, error: null, lastSuccessAt: 0, loading: false })
    const view = render(<ProjectsList {...build()} />)
    const badges = view.container.querySelectorAll('span[data-session-count]')
    expect(badges.length).toBe(2)
    expect(badges[0]?.textContent).toBe('1 session')
    expect(badges[1]?.textContent).toBe('7 sessions')
  })

  it('mirrors the shell selection: selected row toggles aria-pressed and the data-selected attribute', () => {
    const { store, build } = makePropsBuilder()
    const snapshot: AppBuilderSnapshot = {
      ts: 1,
      projects: [PROJECT_A, PROJECT_B],
      devServers: {},
      sessionCounts: {},
    }
    store.set({ snapshot, error: null, lastSuccessAt: 0, loading: false })
    const view = render(<ProjectsList {...build({ selectedProjectId: PROJECT_B.id })} />)
    const rows = view.container.querySelectorAll('button[data-project-id]')
    const a = rows[0] as HTMLButtonElement | undefined
    const b = rows[1] as HTMLButtonElement | undefined
    expect(a?.getAttribute('aria-pressed')).toBe('false')
    expect(a?.getAttribute('data-selected')).toBe('false')
    expect(b?.getAttribute('aria-pressed')).toBe('true')
    expect(b?.getAttribute('data-selected')).toBe('true')
  })

  it('routes the row click through the inject selectProject callback with the project id', () => {
    const { store, build } = makePropsBuilder()
    const snapshot: AppBuilderSnapshot = {
      ts: 1,
      projects: [PROJECT_A, PROJECT_B],
      devServers: {},
      sessionCounts: {},
    }
    store.set({ snapshot, error: null, lastSuccessAt: 0, loading: false })
    const selectProject = vi.fn()
    const view = render(<ProjectsList {...build({ selectProject: selectProject as unknown as AppBuilderProjectsComponentProps['selectProject'] })} />)
    const a = view.container.querySelector('button[data-project-id="' + PROJECT_A.id + '"]') as HTMLButtonElement | null
    expect(a).not.toBeNull()
    fireEvent.click(a!)
    expect(selectProject).toHaveBeenCalledWith(PROJECT_A.id)
  })

  it('exports the snapshot store factory used by apply() (sanity check: the same factory shape the suite imports)', () => {
    const store = createAppBuilderProjectsSnapshotStore()
    expect(store).toBeDefined()
    expect(typeof store.getSnapshot).toBe('function')
    expect(typeof store.subscribe).toBe('function')
  })
})
