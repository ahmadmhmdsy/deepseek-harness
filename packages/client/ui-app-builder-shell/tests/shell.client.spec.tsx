// @vitest-environment jsdom
/**
 * App Builder shell renderer: a 4-pane CSS-Grid layout (projects | chat |
 * deployments | preview). The shell owns the selection store and threads
 * the current `selectedProjectId` into the projects, deployments, and
 * preview slot owner props on every renderSlot call. This suite exercises
 * the branches that drive the shell through props alone (the SlotRegistry
 * wiring in `apply()` is out of scope; the renderer only reads the four
 * prop shares).
 *
 * Branches covered for the per-file 100% gate:
 *   - shellTitle locale key surfaces in the header
 *   - projects slot receives the current selectedProjectId as owner prop
 *   - conversation slot receives an empty owner prop
 *   - deployments slot receives the current selectedProjectId as owner prop
 *   - preview slot is rendered with selectedProjectId when set
 *   - preview pane shows the noProjectSelected empty state when none
 *   - app-builder-enabled data attribute on the shell root
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { Shell } from '../src/client/Shell.tsx'
import type { AppBuilderShellComponentProps } from '../src/client/contract/slots.ts'
import { en, type AppBuilderShellKey } from '../src/client/locales.ts'

// The LocaleNamespaceMap declaration lives in src/client/index.ts (the apply
// module) and is only merged into PropsLocale when that file is part of the
// program. Re-declare it here so the typed AppBuilderShellComponentProps
// resolves to { t: TranslateNS<'app-builder-shell'> } instead of {}.
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'app-builder-shell': AppBuilderShellKey
  }
}

afterEach(cleanup)

function tShell(key: AppBuilderShellKey): string {
  return en[key]
}

type ShellSlot = 'app-builder.projects' | 'app-builder.deployments' | 'app-builder.preview' | 'app-builder.conversation'

interface RenderSlotCall {
  slot: ShellSlot
  owner: unknown
}

function makeStubUseStore(initialSelected: string | undefined) {
  const state = { selectedProjectId: initialSelected }
  return ((selector: (s: { selectedProjectId: string | undefined }) => unknown) =>
    selector(state)) as AppBuilderShellComponentProps['useStore']
}

function makeRenderSlotStub(): {
  renderSlot: AppBuilderShellComponentProps['renderSlot']
  calls: RenderSlotCall[]
  renders: Record<ShellSlot, number>
} {
  const calls: RenderSlotCall[] = []
  const renders: Record<ShellSlot, number> = {
    'app-builder.projects': 0,
    'app-builder.deployments': 0,
    'app-builder.preview': 0,
    'app-builder.conversation': 0,
  }
  const allowed: ReadonlySet<ShellSlot> = new Set([
    'app-builder.projects',
    'app-builder.deployments',
    'app-builder.preview',
    'app-builder.conversation',
  ])
  // The renderSlot type is a narrow union of (slot, owner) pairs; a single
  // implementation cannot satisfy the union without widening, so the cast
  // lives at the binding boundary, not at the call sites.
  const renderSlot = ((slot: ShellSlot, owner: unknown) => {
    if (!allowed.has(slot)) {
      throw new Error('unexpected slot: ' + String(slot))
    }
    const tag = slot
    calls.push({ slot: tag, owner })
    renders[tag] += 1
    return <div data-slot={tag}>stub:{tag}</div>
  }) as unknown as AppBuilderShellComponentProps['renderSlot']
  return { renderSlot, calls, renders }
}

interface PropsBuilder {
  readonly store: { readonly stub: { readonly selectProject: ReturnType<typeof vi.fn> } }
  readonly build: (overrides?: {
    selectedProjectId?: string | undefined
    t?: AppBuilderShellComponentProps['t']
    renderSlot?: AppBuilderShellComponentProps['renderSlot']
  }) => AppBuilderShellComponentProps
}

function makePropsBuilder(initialSelected?: string): PropsBuilder {
  const selectProject = vi.fn()
  const build: PropsBuilder['build'] = (overrides: Parameters<PropsBuilder['build']>[0] = {}): AppBuilderShellComponentProps => {
    const useStore = makeStubUseStore(overrides.selectedProjectId ?? initialSelected)
    const { renderSlot } = makeRenderSlotStub()
    const t = overrides.t ?? (tShell as unknown as AppBuilderShellComponentProps['t'])
    return {
      useStore,
      renderSlot: overrides.renderSlot ?? renderSlot,
      t,
      actions: { selectProject } as unknown as AppBuilderShellComponentProps['actions'],
    } as unknown as AppBuilderShellComponentProps
  }
  return { store: { stub: { selectProject } }, build }
}

describe('App Builder shell renderer', () => {
  it('renders the localized header title and the four pane slots', () => {
    const { build } = makePropsBuilder()
    const view = render(<Shell {...build()} />)
    expect(view.container.textContent).toContain('App Builder')
    const projects = view.container.querySelector('[data-pane="projects"]')
    const chat = view.container.querySelector('[data-pane="chat"]')
    const deployments = view.container.querySelector('[data-pane="deployments"]')
    const preview = view.container.querySelector('[data-pane="preview"]')
    expect(projects).not.toBeNull()
    expect(chat).not.toBeNull()
    expect(deployments).not.toBeNull()
    expect(preview).not.toBeNull()
  })

  it('threads the current selectedProjectId into the projects slot owner prop', () => {
    const { build } = makePropsBuilder('p-a')
    const { renderSlot, calls } = makeRenderSlotStub()
    const view = render(<Shell {...build({ renderSlot, selectedProjectId: 'p-a' })} />)
    const projectsCall = calls.find(c => c.slot === 'app-builder.projects')
    expect(projectsCall).toBeDefined()
    expect(projectsCall?.owner).toEqual({ selectedProjectId: 'p-a' })
    expect(view.container.textContent).toContain('stub:app-builder.projects')
  })

  it('threads the current selectedProjectId into the deployments slot owner prop', () => {
    const { build } = makePropsBuilder('p-a')
    const { renderSlot, calls } = makeRenderSlotStub()
    const view = render(<Shell {...build({ renderSlot, selectedProjectId: 'p-a' })} />)
    const deploymentsCall = calls.find(c => c.slot === 'app-builder.deployments')
    expect(deploymentsCall).toBeDefined()
    expect(deploymentsCall?.owner).toEqual({ selectedProjectId: 'p-a' })
    expect(view.container.textContent).toContain('stub:app-builder.deployments')
  })

  it('renders an empty owner prop into the conversation slot', () => {
    const { build } = makePropsBuilder()
    const { renderSlot, calls } = makeRenderSlotStub()
    const view = render(<Shell {...build({ renderSlot })} />)
    const conversationCall = calls.find(c => c.slot === 'app-builder.conversation')
    expect(conversationCall).toBeDefined()
    expect(conversationCall?.owner).toEqual({})
    expect(view.container.textContent).toContain('stub:app-builder.conversation')
  })

  it('shows the localized empty-state when no project is selected', () => {
    const { build } = makePropsBuilder()
    const view = render(<Shell {...build()} />)
    const preview = view.container.querySelector('[data-pane="preview"]')
    expect(preview?.textContent).toContain('Select a project to preview its dev server.')
  })

  it('renders the preview slot with the selectedProjectId owner prop when a project is selected', () => {
    const { build } = makePropsBuilder('p-a')
    const { renderSlot, calls } = makeRenderSlotStub()
    const view = render(<Shell {...build({ renderSlot, selectedProjectId: 'p-a' })} />)
    const previewCall = calls.find(c => c.slot === 'app-builder.preview')
    expect(previewCall).toBeDefined()
    expect(previewCall?.owner).toEqual({ selectedProjectId: 'p-a' })
    const preview = view.container.querySelector('[data-pane="preview"]')
    expect(preview?.textContent).toContain('stub:app-builder.preview')
    expect(preview?.textContent).not.toContain('Select a project to preview its dev server.')
  })

  it('renders the app-builder-enabled data attribute on the shell root for the e2e boot check', () => {
    const { build } = makePropsBuilder()
    const view = render(<Shell {...build()} />)
    const root = view.container.querySelector('div[data-app-builder-enabled="true"]')
    expect(root).not.toBeNull()
  })
})
