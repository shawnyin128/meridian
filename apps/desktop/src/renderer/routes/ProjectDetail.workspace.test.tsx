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
  idea: { list: vi.fn(async () => []), files: vi.fn(async () => []) },
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

/** The folder picker stacked on the workspace dialog, or null while it is closed. */
const picker = () => document.querySelector<HTMLElement>('.ssh-folder-picker')

/** The SSH form's host, port and path fields. */
const sshFields = (dialog: HTMLElement) => [...dialog.querySelectorAll<HTMLInputElement>('#workspaceSsh input')]

/** The folder button of the SSH form's path row. */
const folderButton = (dialog: HTMLElement) => dialog.querySelector<HTMLButtonElement>('#workspaceSsh .directory-field-action')!

/** Leaves `field`, the way a press elsewhere does. */
async function leave(field: HTMLInputElement): Promise<void> {
  await act(async () => { field.dispatchEvent(new FocusEvent('focusout', { bubbles: true })) })
}

/** Types `host`, and `port` when given, into the SSH form, leaves the host field and answers its check with the remote home. */
async function reachHost(dialog: HTMLElement, host: string, port?: string): Promise<void> {
  const [hostField, portField] = sshFields(dialog)
  act(() => setValue(hostField!, host))
  if (port !== undefined) act(() => setValue(portField!, port))
  await leave(hostField!)
  await answer(folder('/home/researcher', ['projects']))
}

/**
 * What the path row's field cell of the SSH form holds: the path field, usable or held, the busy ring,
 * or the failure with its text; `no row` when the form has no such row.
 */
const slot = (dialog: HTMLElement) => {
  const cell = [...dialog.querySelectorAll('#workspaceSsh .field-row')]
    .find((row) => row.querySelector('.field-row-label')?.textContent === '项目路径')?.querySelector('.field-row-field')
  if (cell === undefined || cell === null) return ['no row']
  const field = cell.querySelector<HTMLInputElement>('.directory-field input')
  if (field !== null) return [field.disabled ? 'held' : 'path']
  if (cell.querySelector('.loading-placeholder') !== null) return ['checking']
  const alert = cell.querySelector('[role="alert"]')
  return alert === null ? ['empty'] : ['failed', alert.textContent]
}

/** Opens the folder picker from the SSH form's folder button, which holds focus the way a click leaves it. */
async function openPicker(dialog: HTMLElement): Promise<void> {
  await act(async () => {
    folderButton(dialog).focus()
    folderButton(dialog).click()
  })
}

/** The picker's foot button named `name`. */
const pickerButton = (name: string) =>
  [...picker()!.querySelectorAll<HTMLButtonElement>('.modal-actions button')].find((button) => button.textContent === name)!

/** The path the picker shows and the names of the subfolders it lists. */
const browsed = () => [
  picker()?.querySelector<HTMLInputElement>('input.ssh-folders-path')?.value,
  [...picker()!.querySelectorAll('.ssh-folder-row')].map((row) => row.textContent),
]

/** The subfolder row named `name` in the picker. */
const row = (name: string) =>
  [...picker()!.querySelectorAll<HTMLButtonElement>('.ssh-folder-row')].find((button) => button.textContent === name)!

/** A path row's label, whether its field is required, its placeholder's presence and its folder button's name. */
const pathRow = (field: Element) => [
  field.closest('.field-row')!.querySelector('.field-row-label')!.textContent,
  field.querySelector('input')!.required,
  field.querySelector('input')!.placeholder !== '',
  field.querySelector('button')!.getAttribute('aria-label'),
]

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

  it('SSH 表单一直是主机、端口和项目路径三行；没填主机时路径框按不动，连上后是一行跟本地目录一样的项目路径，填了路径添加才按得动', async () => {
    const dialog = await openWorkspaceDialog()
    const local = pathRow(dialog.querySelector('#workspaceLocal .directory-field')!)
    await chooseSsh(dialog)
    const labels = () => [...dialog.querySelectorAll('#workspaceSsh .field-row-label')].map((label) => label.textContent)
    expect([labels(), slot(dialog), submit(dialog).disabled]).toEqual([['主机', '端口', '项目路径'], ['held'], true])
    await reachHost(dialog, 'gpu-lab')
    expect(labels()).toEqual(['主机', '端口', '项目路径'])
    expect(pathRow(dialog.querySelector('#workspaceSsh .directory-field')!)).toEqual(local)
    expect([dialog.querySelector('.ssh-folders'), submit(dialog).textContent, submit(dialog).disabled]).toEqual([null, '添加', true])
    act(() => setValue(sshFields(dialog)[2]!, '/srv/shared'))
    expect(submit(dialog).disabled).toBe(false)
  })

  it('主机或端口停下 600ms 才检查连接；检查时项目路径那格转圈，连不上那格写出 Core 给的原因，改了主机又回到检查，连上后那格是路径框', async () => {
    const dialog = await openWorkspaceDialog()
    await chooseSsh(dialog)
    const [hostField, portField] = sshFields(dialog)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      act(() => setValue(hostField!, 'gpu'))
      expect([slot(dialog), api.listings]).toEqual([['checking'], []])
      act(() => { vi.advanceTimersByTime(300) })
      act(() => setValue(hostField!, 'nope'))
      act(() => { vi.advanceTimersByTime(599) })
      expect(api.listings).toEqual([])
      act(() => { vi.advanceTimersByTime(1) })
      expect(api.listings.map((listing) => listing.params)).toEqual([{ host: 'nope' }])
      await answer({ state: 'failed', issue: 'ssh: Could not resolve hostname nope: nodename nor servname provided, or not known' })
      expect([slot(dialog), submit(dialog).disabled])
        .toEqual([['failed', 'ssh: Could not resolve hostname nope: nodename nor servname provided, or not known'], true])

      act(() => setValue(hostField!, 'gpu-lab'))
      expect(slot(dialog)).toEqual(['checking'])
      act(() => setValue(portField!, '2222'))
      act(() => { vi.advanceTimersByTime(600) })
      expect(api.listings.slice(1).map((listing) => listing.params)).toEqual([{ host: 'gpu-lab', port: 2222 }])
      await answer(folder('/home/researcher', ['projects']))
      expect([slot(dialog), api.binds]).toEqual([['path'], []])

      act(() => setValue(hostField!, ''))
      act(() => { vi.advanceTimersByTime(600) })
      expect([slot(dialog), api.listings.length]).toEqual([['held'], 2])
    } finally {
      vi.useRealTimers()
    }
  })

  it('离开主机框就检查，同一个值不再查第二次；新的主机值让还在路上的旧检查作废，旧结果晚到也不算', async () => {
    const dialog = await openWorkspaceDialog()
    await chooseSsh(dialog)
    const [hostField] = sshFields(dialog)
    act(() => setValue(hostField!, 'cluster'))
    await leave(hostField!)
    await leave(hostField!)
    expect(api.listings.map((listing) => listing.params)).toEqual([{ host: 'cluster' }])
    act(() => setValue(hostField!, 'gpu-lab'))
    await leave(hostField!)
    expect(api.listings.map((listing) => listing.params)).toEqual([{ host: 'cluster' }, { host: 'gpu-lab' }])
    await act(async () => { api.listings[0]!.answer({ state: 'failed', issue: 'ssh: connect to host cluster port 22: Operation timed out' }) })
    expect(slot(dialog)).toEqual(['checking'])
    await act(async () => { api.listings[1]!.answer(folder('/home/researcher', ['projects'])) })
    expect(slot(dialog)).toEqual(['path'])
  })

  it('文件夹按钮在工作区对话框上叠开远端文件夹选择框：从主目录开始，点文件夹进入、上层文件夹返回，选择把路径填进项目路径、关掉选择框、焦点回到文件夹按钮，再按添加才存', async () => {
    const dialog = await openWorkspaceDialog()
    await chooseSsh(dialog)
    await reachHost(dialog, 'gpu-lab', '2222')
    const pathField = sshFields(dialog)[2]
    await openPicker(dialog)
    expect(api.listings.slice(1).map((listing) => listing.params)).toEqual([{ host: 'gpu-lab', port: 2222 }])
    expect([document.querySelectorAll('[role="dialog"]').length, pickerButton('选择').disabled]).toEqual([2, true])
    expect(picker()!.querySelector(':scope > .modal-title:not(.modal-title--hidden)')?.textContent).toBe('gpu-lab')
    expect([
      picker()!.querySelector('.ssh-folders .loading-placeholder') !== null,
      picker()!.querySelector<HTMLButtonElement>('.ssh-folders-head button')!.disabled,
    ]).toEqual([true, true])

    await answer(folder('/home/researcher', ['datasets', 'projects']))
    expect(browsed()).toEqual(['/home/researcher', ['datasets', 'projects']])
    await act(async () => { row('projects').click() })
    expect(api.listings.at(-1)!.params).toEqual({ host: 'gpu-lab', port: 2222, path: '/home/researcher/projects' })
    expect(pickerButton('选择').disabled).toBe(true)
    await answer(folder('/home/researcher/projects', ['spec-decoding']))
    expect(browsed()).toEqual(['/home/researcher/projects', ['spec-decoding']])

    await act(async () => { picker()!.querySelector<HTMLButtonElement>('.ssh-folders-head button')!.click() })
    expect(api.listings.at(-1)!.params).toEqual({ host: 'gpu-lab', port: 2222, path: '/home/researcher' })
    await answer(folder('/home/researcher', ['datasets', 'projects']))
    await act(async () => { row('projects').click() })
    await answer(folder('/home/researcher/projects', ['spec-decoding']))

    await act(async () => { pickerButton('选择').click() })
    expect([picker(), pathField!.value, document.activeElement, api.binds])
      .toEqual([null, '/home/researcher/projects', folderButton(dialog), []])
    expect(document.querySelector('.workspace-dialog')).not.toBeNull()

    await act(async () => { submit(dialog).click() })
    await act(async () => { submit(dialog).click() })
    expect(api.binds.map((bind) => bind.binding)).toEqual([
      { kind: 'ssh', host: 'gpu-lab', port: 2222, path: '/home/researcher/projects' },
    ])
    expect(busyState(submit(dialog))).toEqual(['正在添加…', '添加', true, true, 'true'])
    await act(async () => { api.binds[0]!.finish() })
    expect(document.querySelector('.workspace-dialog')).toBeNull()
  })

  it('取消或 Esc 只关掉选择框，项目路径还是原来手打的那个，工作区对话框还开着', async () => {
    const dialog = await openWorkspaceDialog()
    await chooseSsh(dialog)
    await reachHost(dialog, 'gpu-lab')
    const pathField = sshFields(dialog)[2]
    act(() => setValue(pathField!, '/srv/shared'))
    await openPicker(dialog)
    await answer(folder('/srv/shared', ['data']))
    await act(async () => { row('data').click() })
    await answer(folder('/srv/shared/data', []))
    await act(async () => { pickerButton('取消').click() })
    expect([picker(), pathField!.value, document.activeElement]).toEqual([null, '/srv/shared', folderButton(dialog)])

    await openPicker(dialog)
    await answer(folder('/srv/shared', ['data']))
    await act(async () => {
      document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    })
    expect([picker(), pathField!.value, document.activeElement]).toEqual([null, '/srv/shared', folderButton(dialog)])
    expect([document.querySelector('.workspace-dialog') !== null, api.binds]).toEqual([true, []])
  })

  it('项目路径里有主机能列出的文件夹时选择框从那里开始，列不出来就不报错、从远端主目录开始', async () => {
    const dialog = await openWorkspaceDialog()
    await chooseSsh(dialog)
    await reachHost(dialog, 'gpu-lab')
    const pathField = sshFields(dialog)[2]
    act(() => setValue(pathField!, ' /srv/shared '))
    await openPicker(dialog)
    expect(api.listings.slice(1).map((listing) => listing.params)).toEqual([{ host: 'gpu-lab', path: '/srv/shared' }])
    await answer(folder('/srv/shared', ['data']))
    expect(browsed()).toEqual(['/srv/shared', ['data']])
    await act(async () => { pickerButton('取消').click() })

    act(() => setValue(pathField!, '/srv/missing'))
    await openPicker(dialog)
    await answer({ state: 'failed', issue: 'cd: /srv/missing: No such file or directory' })
    expect(api.listings.slice(2).map((listing) => listing.params))
      .toEqual([{ host: 'gpu-lab', path: '/srv/missing' }, { host: 'gpu-lab' }])
    await answer(folder('/home/researcher', ['projects']))
    expect([browsed(), picker()!.querySelector('[role="alert"]')]).toEqual([['/home/researcher', ['projects']], null])
  })

  it('手打的远端路径不开选择框也能直接存成工作区', async () => {
    const dialog = await openWorkspaceDialog()
    await chooseSsh(dialog)
    await reachHost(dialog, 'gpu-lab')
    act(() => setValue(sshFields(dialog)[2]!, '/srv/shared'))
    await act(async () => { submit(dialog).click() })
    expect([api.binds.map((bind) => bind.binding), api.listings.length])
      .toEqual([[{ kind: 'ssh', host: 'gpu-lab', path: '/srv/shared' }], 1])
  })

  it('SSH 工作区还没存好时，添加按钮在原处转圈、按不动；切回本地目录也开不了第二次连接', async () => {
    const dialog = await openWorkspaceDialog()
    await chooseSsh(dialog)
    await reachHost(dialog, 'gpu-lab')
    act(() => setValue(sshFields(dialog)[2]!, '/home/researcher'))
    await act(async () => { submit(dialog).click() })
    await act(async () => { submit(dialog).click() })
    expect(api.binds.map((bind) => bind.binding)).toEqual([{ kind: 'ssh', host: 'gpu-lab', path: '/home/researcher' }])
    expect(busyState(submit(dialog))).toEqual(['正在添加…', '添加', true, true, 'true'])
    await act(async () => {
      [...dialog.querySelectorAll<HTMLButtonElement>('.workspace-kinds button')].find((b) => b.textContent === '本地目录')!.click()
    })
    act(() => setValue(dialog.querySelector<HTMLInputElement>('#workspaceLocal input')!, '/work/spec-decoding'))
    expect(submit(dialog).disabled).toBe(true)
    await act(async () => { submit(dialog).click() })
    expect(api.binds).toHaveLength(1)
  })

  it('选择框的路径框里改了目录还没回车时选择按不动，回车去了那里之后选择填的就是那个文件夹', async () => {
    const dialog = await openWorkspaceDialog()
    await chooseSsh(dialog)
    await reachHost(dialog, 'gpu-lab')
    await openPicker(dialog)
    await answer(folder('/home/researcher', ['projects']))
    const browserPath = picker()!.querySelector<HTMLInputElement>('input.ssh-folders-path')!
    act(() => setValue(browserPath, '/srv/shared'))
    expect(pickerButton('选择').disabled).toBe(true)
    await act(async () => {
      browserPath.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    })
    expect(api.listings.at(-1)!.params).toEqual({ host: 'gpu-lab', path: '/srv/shared' })
    await answer(folder('/srv/shared', []))
    expect(pickerButton('选择').disabled).toBe(false)
    await act(async () => { pickerButton('选择').click() })
    expect([picker(), sshFields(dialog)[2]!.value, api.binds]).toEqual([null, '/srv/shared', []])
  })

  it('主机框列出 SSH 配置里含所打字的别名，回车把高亮的别名填进框里而不提交，离开时查的是这个别名', async () => {
    const dialog = await openWorkspaceDialog()
    await chooseSsh(dialog)
    const [hostField] = sshFields(dialog)
    act(() => setValue(hostField!, 'GPU'))
    const candidates = () => [...document.querySelectorAll('.pickhits .rrow')].map((option) => option.textContent)
    expect(candidates()).toEqual(['gpu-lab'])
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    await act(async () => { hostField!.dispatchEvent(enter) })
    expect([hostField!.value, candidates(), enter.defaultPrevented, api.binds]).toEqual(['gpu-lab', [], true, []])
    await leave(hostField!)
    expect(api.listings.map((listing) => listing.params)).toEqual([{ host: 'gpu-lab' }])
  })
})
