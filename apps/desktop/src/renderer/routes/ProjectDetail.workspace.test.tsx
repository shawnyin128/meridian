// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ProjectDetail as Project, ProjectWorkspaceBinding, SshFolders, SshFoldersParams,
} from '../../shared/contract.js'
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
  listings: [] as Array<{ params: SshFoldersParams; answer: (folders: SshFolders) => void }>,
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
  ssh: {
    hosts: vi.fn(async () => ['gpu-lab', 'cluster']),
    // Each listing stays in flight until the test answers it, the way a round trip to the host takes time.
    folders: vi.fn((params: SshFoldersParams) => new Promise<SshFolders>((resolve) => {
      api.listings.push({ params, answer: resolve })
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
  useScreenShown: () => true,
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
        projectId="draft" onBack={vi.fn()} onReturn={vi.fn()} tab="task" onTab={vi.fn()} record="tl" onRecord={vi.fn()}
      />
    </MessagesProvider>,
  ))
  const connect = [...host.querySelectorAll<HTMLButtonElement>('button.pv.metadata-editable')]
    .find((button) => button.textContent === '连接')!
  await act(async () => { connect.click() })
  return document.querySelector<HTMLElement>('.workspace-dialog')!
}

const submit = (dialog: HTMLElement) => dialog.querySelector<HTMLButtonElement>('.modal-actions button[type="submit"]')!

/** A folder of the host `gpu-lab` holding `names`, as Core lists it. */
const folder = (path: string, names: string[]): SshFolders => ({
  state: 'ready', path, parent: path === '/' ? null : path.slice(0, path.lastIndexOf('/')) || '/',
  folders: names.map((name) => ({ name, path: `${path === '/' ? '' : path}/${name}` })),
})

/** Switches the open workspace dialog to SSH. */
async function chooseSsh(dialog: HTMLElement): Promise<void> {
  await act(async () => {
    [...dialog.querySelectorAll<HTMLButtonElement>('.workspace-kinds button')].find((b) => b.textContent === 'SSH')!.click()
  })
}

/** Answers the listing still in flight with `folders`. */
async function answer(folders: SshFolders): Promise<void> {
  await act(async () => { api.listings.at(-1)!.answer(folders) })
}

/** The path the SSH folder browser shows and the names of the subfolders it lists. */
const browsed = (dialog: HTMLElement) => [
  dialog.querySelector<HTMLInputElement>('input.ssh-folders-path')?.value,
  [...dialog.querySelectorAll('.ssh-folder-row')].map((row) => row.textContent),
]

/** The subfolder row named `name` in the SSH folder browser. */
const row = (dialog: HTMLElement, name: string) =>
  [...dialog.querySelectorAll<HTMLButtonElement>('.ssh-folder-row')].find((button) => button.textContent === name)!

/** A busy button's accessible name, its text, whether it shows the running ring, and whether it is disabled and aria-busy. */
const busyState = (button: HTMLButtonElement) => [
  button.getAttribute('aria-label'), button.textContent, button.querySelector('.ring.spin') !== null, button.disabled,
  button.getAttribute('aria-busy'),
]

let root: Root | null = null

describe('项目工作区对话框', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
    api.binds.length = 0
    api.listings.length = 0
    document.body.innerHTML = ''
  })

  afterEach(() => {
    if (root !== null) act(() => root!.unmount())
    root = null
  })

  it('添加本地目录还没完成时，按钮在原处转圈、按不动，名字是正在添加，再按也不会开第二次连接', async () => {
    const dialog = await openWorkspaceDialog()
    act(() => setValue(dialog.querySelector<HTMLInputElement>('#workspaceLocal input')!, '/work/spec-decoding'))
    await act(async () => { submit(dialog).click() })
    await act(async () => { submit(dialog).click() })
    expect(api.binds.map((bind) => bind.binding)).toEqual([{ kind: 'local', root: '/work/spec-decoding' }])
    expect(busyState(submit(dialog))).toEqual(['正在添加…', '添加', true, true, 'true'])
    await act(async () => { api.binds[0]!.finish() })
    expect(document.querySelector('.workspace-dialog')).toBeNull()
  })

  it('SSH 先连接再选文件夹：连接时按钮转圈，连上后从远端主目录开始，点文件夹进入、上层文件夹返回，选择把显示的文件夹存成工作区', async () => {
    const dialog = await openWorkspaceDialog()
    await chooseSsh(dialog)
    expect(dialog.querySelectorAll('#workspaceSsh input')).toHaveLength(2)
    const [hostField, portField] = dialog.querySelectorAll<HTMLInputElement>('#workspaceSsh input')
    act(() => setValue(hostField!, 'gpu-lab'))
    act(() => setValue(portField!, '2222'))
    await act(async () => { submit(dialog).click() })
    await act(async () => { submit(dialog).click() })
    expect(api.listings.map((listing) => listing.params)).toEqual([{ host: 'gpu-lab', port: 2222 }])
    expect(busyState(submit(dialog))).toEqual(['正在连接…', '连接', true, true, 'true'])
    expect(api.binds).toEqual([])

    await answer(folder('/home/researcher', ['datasets', 'projects']))
    expect(browsed(dialog)).toEqual(['/home/researcher', ['datasets', 'projects']])
    expect(submit(dialog).textContent).toBe('选择')

    await act(async () => { row(dialog, 'projects').click() })
    expect(api.listings.at(-1)!.params).toEqual({ host: 'gpu-lab', port: 2222, path: '/home/researcher/projects' })
    expect(submit(dialog).disabled).toBe(true)
    await answer(folder('/home/researcher/projects', ['spec-decoding']))
    expect(browsed(dialog)).toEqual(['/home/researcher/projects', ['spec-decoding']])

    await act(async () => { dialog.querySelector<HTMLButtonElement>('.ssh-folders-head button')!.click() })
    expect(api.listings.at(-1)!.params).toEqual({ host: 'gpu-lab', port: 2222, path: '/home/researcher' })
    await answer(folder('/home/researcher', ['datasets', 'projects']))
    await act(async () => { row(dialog, 'projects').click() })
    await answer(folder('/home/researcher/projects', ['spec-decoding']))

    await act(async () => { submit(dialog).click() })
    expect(api.binds.map((bind) => bind.binding)).toEqual([
      { kind: 'ssh', host: 'gpu-lab', port: 2222, path: '/home/researcher/projects' },
    ])
    await act(async () => { api.binds[0]!.finish() })
    expect(document.querySelector('.workspace-dialog')).toBeNull()
  })

  it('SSH 工作区还没存好时，选择按钮在原处转圈、按不动，名字是正在选择；切回本地目录也开不了第二次连接', async () => {
    const dialog = await openWorkspaceDialog()
    await chooseSsh(dialog)
    act(() => setValue(dialog.querySelector<HTMLInputElement>('#workspaceSsh input')!, 'gpu-lab'))
    await act(async () => { submit(dialog).click() })
    await answer(folder('/home/researcher', ['projects']))
    await act(async () => { submit(dialog).click() })
    await act(async () => { submit(dialog).click() })
    expect(api.binds.map((bind) => bind.binding)).toEqual([{ kind: 'ssh', host: 'gpu-lab', path: '/home/researcher' }])
    expect(busyState(submit(dialog))).toEqual(['正在选择…', '选择', true, true, 'true'])
    await act(async () => {
      [...dialog.querySelectorAll<HTMLButtonElement>('.workspace-kinds button')].find((b) => b.textContent === '本地目录')!.click()
    })
    act(() => setValue(dialog.querySelector<HTMLInputElement>('#workspaceLocal input')!, '/work/spec-decoding'))
    expect(submit(dialog).disabled).toBe(true)
    await act(async () => { submit(dialog).click() })
    expect(api.binds).toHaveLength(1)
  })

  it('路径框里改了目录还没回车时选择按不动，回车去了那里之后选择存的就是那个文件夹', async () => {
    const dialog = await openWorkspaceDialog()
    await chooseSsh(dialog)
    act(() => setValue(dialog.querySelector<HTMLInputElement>('#workspaceSsh input')!, 'gpu-lab'))
    await act(async () => { submit(dialog).click() })
    await answer(folder('/home/researcher', ['projects']))
    const pathField = dialog.querySelector<HTMLInputElement>('input.ssh-folders-path')!
    act(() => setValue(pathField, '/srv/shared'))
    expect(submit(dialog).disabled).toBe(true)
    await act(async () => {
      pathField.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    })
    expect(api.listings.at(-1)!.params).toEqual({ host: 'gpu-lab', path: '/srv/shared' })
    await answer(folder('/srv/shared', []))
    expect(submit(dialog).disabled).toBe(false)
    await act(async () => { submit(dialog).click() })
    expect(api.binds.map((bind) => bind.binding)).toEqual([{ kind: 'ssh', host: 'gpu-lab', path: '/srv/shared' }])
  })

  it('连不上时原因显示在主机下面，什么都不存，按钮回到连接；改了主机就断开已连上的主机', async () => {
    const dialog = await openWorkspaceDialog()
    await chooseSsh(dialog)
    const hostField = dialog.querySelector<HTMLInputElement>('#workspaceSsh input')!
    act(() => setValue(hostField, 'nope'))
    await act(async () => { submit(dialog).click() })
    await answer({ state: 'failed', issue: 'ssh: Could not resolve hostname nope: nodename nor servname provided, or not known' })
    expect(dialog.querySelector('#workspaceSsh [role="alert"]')?.textContent)
      .toBe('ssh: Could not resolve hostname nope: nodename nor servname provided, or not known')
    expect([submit(dialog).textContent, submit(dialog).disabled]).toEqual(['连接', false])
    expect(dialog.querySelector('.ssh-folders')).toBeNull()

    act(() => setValue(hostField, 'gpu-lab'))
    expect(dialog.querySelector('#workspaceSsh [role="alert"]')).toBeNull()
    await act(async () => { submit(dialog).click() })
    await answer(folder('/home/researcher', ['projects']))
    expect(browsed(dialog)).toEqual(['/home/researcher', ['projects']])
    act(() => setValue(hostField, 'gpu-lab2'))
    expect(dialog.querySelector('.ssh-folders')).toBeNull()
    expect(submit(dialog).textContent).toBe('连接')
    expect(api.binds).toEqual([])
  })

  it('主机框列出 SSH 配置里含所打字的别名，回车把高亮的别名填进框里而不连接，再回车才连接', async () => {
    const dialog = await openWorkspaceDialog()
    await chooseSsh(dialog)
    const hostField = dialog.querySelector<HTMLInputElement>('#workspaceSsh input')!
    act(() => setValue(hostField, 'GPU'))
    const candidates = () => [...document.querySelectorAll('.pickhits .rrow')].map((option) => option.textContent)
    expect(candidates()).toEqual(['gpu-lab'])
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    await act(async () => { hostField.dispatchEvent(enter) })
    expect([hostField.value, candidates(), enter.defaultPrevented, api.listings]).toEqual(['gpu-lab', [], true, []])
    await act(async () => { hostField.form!.requestSubmit() })
    expect(api.listings.map((listing) => listing.params)).toEqual([{ host: 'gpu-lab' }])
  })
})
