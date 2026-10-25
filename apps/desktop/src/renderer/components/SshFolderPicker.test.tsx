// @vitest-environment jsdom
import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SshFolders, SshFoldersParams } from '../../shared/contract.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const api = vi.hoisted(() => ({
  listings: [] as Array<{ params: SshFoldersParams; answer: (folders: SshFolders) => void }>,
}))

vi.mock('../ipc.js', () => ({
  ssh: {
    hosts: vi.fn(async () => []),
    folders: vi.fn((params: SshFoldersParams) => new Promise<SshFolders>((resolve) => {
      api.listings.push({ params, answer: resolve })
    })),
  },
}))

const { SshFolderBrowser, useSshFolders } = await import('./SshFolderPicker.js')

/** A folder holding `names`, as Core lists it. */
const folder = (path: string, names: string[]): SshFolders => ({
  state: 'ready', path, parent: path === '/' ? null : path.slice(0, path.lastIndexOf('/')) || '/',
  folders: names.map((name) => ({ name, path: `${path === '/' ? '' : path}/${name}` })),
})

/** Connects to `gpu-lab` on mounting and shows the browser once its home is listed. */
function Probe() {
  const remote = useSshFolders()
  useEffect(() => { remote.connect({ host: 'gpu-lab' }) }, [remote.connect])
  return (
    <>
      {remote.folder === null ? null : <SshFolderBrowser choice={remote} />}
      <output>{remote.edited ? 'edited' : 'shown'}</output>
    </>
  )
}

let root: Root | null = null

async function mount(): Promise<void> {
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(<MessagesProvider><Probe /></MessagesProvider>))
}

const answer = async (index: number, folders: SshFolders) => {
  await act(async () => { api.listings[index]!.answer(folders) })
}
const field = () => document.querySelector<HTMLInputElement>('input.ssh-folders-path')!
const path = () => field().value
/** Whether the path field holds the folder shown or a path typed and not yet gone to. */
const edited = () => document.querySelector('output')!.textContent

function type(value: string): void {
  act(() => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(field(), value)
    field().dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/** Presses `key` in the path field and returns whether its default was prevented. */
async function press(key: string): Promise<boolean> {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  await act(async () => { field().dispatchEvent(event) })
  return event.defaultPrevented
}
const names = () => [...document.querySelectorAll('.ssh-folder-row')].map((row) => row.textContent)
const row = (name: string) => [...document.querySelectorAll<HTMLButtonElement>('.ssh-folder-row')].find((b) => b.textContent === name)!
const up = () => document.querySelector<HTMLButtonElement>('.ssh-folders-head button')!

describe('SSH 文件夹浏览', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
    api.listings.length = 0
    document.body.innerHTML = ''
  })

  afterEach(() => {
    if (root !== null) act(() => root!.unmount())
    root = null
  })

  it('先后打开两个文件夹时只显示后打开的那个，先打开的晚到也不会盖掉它', async () => {
    await mount()
    await answer(0, folder('/home/researcher', ['datasets', 'projects']))
    await act(async () => { row('datasets').click() })
    expect(document.querySelector('.ssh-folders .loading-placeholder')).not.toBeNull()
    await act(async () => { up().click() })
    await answer(2, folder('/home', ['researcher']))
    await answer(1, folder('/home/researcher/datasets', ['gsm8k']))
    expect([path(), names()]).toEqual(['/home', ['researcher']])
  })

  it('文件夹打不开时原因写在列表下面，仍显示原来的文件夹；根目录没有上层文件夹，空文件夹显示没有文件夹', async () => {
    await mount()
    await answer(0, folder('/home/researcher', ['private']))
    await act(async () => { row('private').click() })
    await answer(1, { state: 'failed', issue: 'cd: /home/researcher/private: Permission denied' })
    expect([path(), names(), document.querySelector('.ssh-folders [role="alert"]')?.textContent])
      .toEqual(['/home/researcher', ['private'], 'cd: /home/researcher/private: Permission denied'])

    await act(async () => { up().click() })
    await answer(2, folder('/', []))
    expect([path(), up().disabled, document.querySelector('.ssh-folders .empty-state')?.textContent]).toEqual(['/', true, '没有文件夹'])
    expect(document.querySelector('.ssh-folders [role="alert"]')).toBeNull()
  })

  it('路径框里输入一个目录回车就去那里，也能去 ~ 下的隐藏文件夹；回车不提交表单，焦点留在路径框里', async () => {
    await mount()
    await answer(0, folder('/home/researcher', ['projects']))
    act(() => field().focus())
    type('~/.cache')
    expect(edited()).toBe('edited')
    expect(await press('Enter')).toBe(true)
    expect(api.listings.at(-1)!.params).toEqual({ host: 'gpu-lab', path: '~/.cache' })
    await answer(1, folder('/home/researcher/.cache', ['pip']))
    expect([path(), names(), edited(), document.activeElement]).toEqual(['/home/researcher/.cache', ['pip'], 'shown', field()])
  })

  it('输入的目录不存在时原因写在列表下面，列表不动，输入的字留着；Esc 换回显示的文件夹，开着时 Esc 不关对话框', async () => {
    await mount()
    await answer(0, folder('/home/researcher', ['projects']))
    type('/home/researcher/missing')
    expect(field().hasAttribute('data-inline-draft')).toBe(true)
    await press('Enter')
    await answer(1, { state: 'failed', issue: 'cd: /home/researcher/missing: No such file or directory' })
    expect([path(), names(), edited(), document.querySelector('.ssh-folders [role="alert"]')?.textContent])
      .toEqual(['/home/researcher/missing', ['projects'], 'edited', 'cd: /home/researcher/missing: No such file or directory'])

    await press('Escape')
    expect([path(), edited(), field().hasAttribute('data-inline-draft')]).toEqual(['/home/researcher', 'shown', false])
  })

  it('用键盘打开文件夹后焦点落在新文件夹的第一个子文件夹上，没有子文件夹时落在上层文件夹上', async () => {
    await mount()
    await answer(0, folder('/home/researcher', ['projects']))
    act(() => row('projects').focus())
    await act(async () => { row('projects').click() })
    await answer(1, folder('/home/researcher/projects', ['spec-decoding', 'kv-cache']))
    expect(document.activeElement).toBe(row('spec-decoding'))

    await act(async () => { row('kv-cache').focus(); row('kv-cache').click() })
    await answer(2, folder('/home/researcher/projects/kv-cache', []))
    expect(document.activeElement).toBe(up())
  })
})
