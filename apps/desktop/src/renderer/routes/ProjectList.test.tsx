// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const SHELVED = {
  id: 'draft', name: 'draft 效率', status: '搁置', priority: 'p1', topic: '推理', focus: '等算力',
  conclusions: { verified: 0, pending: 0, conflicting: 0 }, paperCount: 0, milestones: [], recentEvents: [],
}

vi.mock('../ipc.js', () => ({
  project: { list: () => Promise.resolve([SHELVED]), reorder: vi.fn() },
  feed: { append: vi.fn() },
}))

vi.mock('../shell/AppShell.js', () => ({
  useBanner: () => vi.fn(),
  useToast: () => vi.fn(),
  useCrumbTail: () => {},
  useJump: () => ({ jump: null, open: vi.fn(), returnTo: vi.fn() }),
  useScreenEntry: () => 0,
  useToday: () => '2026-10-18',
  useVaultRevision: () => ({ revision: 0, bump: vi.fn() }),
}))

vi.mock('../hooks/useVaultWrite.js', () => ({ useVaultWrite: () => async (op: Promise<unknown>) => { await op; return true } }))
vi.mock('./ProjectDetail.js', () => ({ ProjectDetail: ({ projectId }: { projectId: string }) => <p data-open={projectId} /> }))

const { Projects } = await import('./Projects.js')

describe('Project list', () => {
  let root: Root | null = null
  let host: HTMLDivElement

  beforeEach(async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => {
      root!.render(<MessagesProvider><Projects /></MessagesProvider>)
      await Promise.resolve()
    })
  })

  afterEach(() => {
    if (root !== null) act(() => root!.unmount())
    root = null
    host.remove()
  })

  it('opens a shelved project from the button that holds its name', () => {
    const open = host.querySelector<HTMLElement>('.prow[data-proj="draft"]')!.firstElementChild as HTMLElement
    expect(open.tagName).toBe('BUTTON')
    expect(open.textContent).toContain('draft 效率')
    act(() => open.click())
    expect(host.querySelector('[data-open="draft"]')).not.toBeNull()
  })
})
