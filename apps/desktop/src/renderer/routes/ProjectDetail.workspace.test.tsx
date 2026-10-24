// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectDetail as Project, ProjectWorkspaceBinding } from '../../shared/contract.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const PROJECT: Project = {
  id: 'draft', name: 'draft 效率', status: '进行中', priority: 'p1', topic: 'speculative decoding', focus: '',
  start: '2026-06-02', due: '2026-09-15', memo: '', conclusions: { verified: 0, pending: 0, conflicting: 0 },
  conclusionList: [], paperCount: 0, papers: [], paperTitles: {}, tasks: [], milestones: [], events: [],
  relations: [], attachments: [], graph: { nodes: [], edges: [] }, agentSessions: [],
}

const api = vi.hoisted(() => ({
  binds: [] as Array<{ binding: ProjectWorkspaceBinding | null; finish: () => void }>,
}))

vi.mock('../ipc.js', () => ({
  appMenu: { chooseWorkspaceRoot: vi.fn(async () => null) },
  chat: { list: vi.fn(async () => []) },
  changelog: { undo: vi.fn() },
  files: {},
  idea: { list: vi.fn(async () => []) },
  papers: { list: vi.fn(async () => ({ rows: [], total: 0 })) },
  project: {
    get: vi.fn(async () => PROJECT),
    // Each bind stays in flight until the test finishes it, the way a slow folder or host keeps it.
    bindWorkspace: vi.fn((_id: string, binding: ProjectWorkspaceBinding | null) => new Promise<Project>((resolve) => {
      api.binds.push({ binding, finish: () => resolve(PROJECT) })
    })),
  },
  trash: { restore: vi.fn() },
  wiki: { cards: vi.fn(async () => []) },
}))

vi.mock('../shell/AppShell.js', () => ({
  useCrumbTail: () => {},
  useEscapeLayer: () => {},
  useJump: () => ({ jump: null, open: vi.fn(), returnTo: vi.fn(), enter: vi.fn() }),
  useNotice: () => ({ success: vi.fn(), refusal: vi.fn() }),
  useScreen: () => 'resproj',
  useToday: () => '2026-08-25',
  useVaultRevision: () => ({ revision: 0, bump: vi.fn() }),
}))

const { ProjectDetail } = await import('./ProjectDetail.js')

function setValue(input: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

/** The project page of a project with no workspace, with its workspace dialog opened. */
async function openWorkspaceDialog(): Promise<HTMLElement> {
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(
    <MessagesProvider>
      <ProjectDetail
        projectId="draft" onBack={vi.fn()} onReturn={vi.fn()} tab="task" onTab={vi.fn()} record="events" onRecord={vi.fn()}
      />
    </MessagesProvider>,
  ))
  const connect = [...host.querySelectorAll<HTMLButtonElement>('button.pv.metadata-editable')]
    .find((button) => button.textContent === '连接')!
  await act(async () => { connect.click() })
  return document.querySelector<HTMLElement>('.workspace-dialog')!
}

const submit = (dialog: HTMLElement) => dialog.querySelector<HTMLButtonElement>('.modal-actions button[type="submit"]')!

let root: Root | null = null

describe('项目工作区对话框', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
    api.binds.length = 0
    document.body.innerHTML = ''
  })

  afterEach(() => {
    if (root !== null) act(() => root!.unmount())
    root = null
  })

  it('添加本地目录还没完成时，按钮显示正在添加、按不动，再按也不会开第二次连接', async () => {
    const dialog = await openWorkspaceDialog()
    act(() => setValue(dialog.querySelector<HTMLInputElement>('#workspaceLocal input')!, '/work/spec-decoding'))
    await act(async () => { submit(dialog).click() })
    await act(async () => { submit(dialog).click() })
    expect(api.binds.map((bind) => bind.binding)).toEqual([{ kind: 'local', root: '/work/spec-decoding' }])
    expect([submit(dialog).textContent, submit(dialog).disabled, submit(dialog).getAttribute('aria-busy')])
      .toEqual(['正在添加…', true, 'true'])
    await act(async () => { api.binds[0]!.finish() })
    expect(document.querySelector('.workspace-dialog')).toBeNull()
  })

  it('SSH 连接还没完成时，按钮显示正在连接、按不动；切回本地目录也开不了第二次连接', async () => {
    const dialog = await openWorkspaceDialog()
    await act(async () => {
      [...dialog.querySelectorAll<HTMLButtonElement>('.workspace-kinds button')].find((b) => b.textContent === 'SSH')!.click()
    })
    const [hostField, pathField] = dialog.querySelectorAll<HTMLInputElement>('#workspaceSsh input')
    act(() => setValue(hostField!, 'gpu-lab'))
    act(() => setValue(pathField!, '/srv/project'))
    await act(async () => { submit(dialog).click() })
    await act(async () => { submit(dialog).click() })
    expect(api.binds.map((bind) => bind.binding)).toEqual([{ kind: 'ssh', host: 'gpu-lab', path: '/srv/project' }])
    expect([submit(dialog).textContent, submit(dialog).disabled, submit(dialog).getAttribute('aria-busy')])
      .toEqual(['正在连接…', true, 'true'])
    await act(async () => {
      [...dialog.querySelectorAll<HTMLButtonElement>('.workspace-kinds button')].find((b) => b.textContent === '本地目录')!.click()
    })
    act(() => setValue(dialog.querySelector<HTMLInputElement>('#workspaceLocal input')!, '/work/spec-decoding'))
    expect(submit(dialog).disabled).toBe(true)
    await act(async () => { submit(dialog).click() })
    expect(api.binds).toHaveLength(1)
  })
})
