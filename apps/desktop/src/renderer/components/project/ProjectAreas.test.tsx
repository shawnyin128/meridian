// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessagesProvider } from '../../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../../shell/language.js'
import { ProjectAreasField } from './ProjectSections.js'

/** The projects project.list answers with: this one, `draft`, and two others whose areas overlap. */
const listed = vi.fn(async () => [
  { id: 'draft', topic: 'speculative decoding', topics: ['speculative decoding', '只在本项目'] },
  { id: 'kv', topic: 'KV cache', topics: ['KV cache', '量化'] },
  { id: 'moe', topic: '推理加速' },
  { id: 'new', topic: '未分主题' },
])
vi.mock('../../ipc.js', () => ({ project: { list: () => listed() } }))

function setValue(input: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

const key = (input: HTMLElement, name: string) => input.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }))

describe('项目属性栏的领域', () => {
  let host: HTMLDivElement
  let root: Root
  let onSave: ReturnType<typeof vi.fn<(areas: string[]) => Promise<boolean>>>
  let onRemove: ReturnType<typeof vi.fn<(areas: string[]) => Promise<boolean>>>

  const render = async (areas: string[]) => {
    await act(async () => {
      root.render(
        <MessagesProvider>
          <ProjectAreasField projectId="draft" areas={areas} onSave={onSave} onRemove={onRemove} onError={vi.fn()} />
        </MessagesProvider>,
      )
    })
  }
  const chips = () => [...host.querySelectorAll('.tagchip:not(.tagadd)')].map((chip) => chip.textContent)
  const candidates = () => [...document.querySelectorAll('.pickhits .rrow:not(.mk)')].map((row) => row.textContent)
  const input = () => host.querySelector<HTMLInputElement>('.tagin')!

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    onSave = vi.fn(async () => true)
    onRemove = vi.fn(async () => true)
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  })

  it('每个领域一个 chip,末尾一个 +;没有领域时只有 +', async () => {
    await render(['speculative decoding', 'KV cache'])
    expect(chips()).toEqual(['speculative decoding', 'KV cache'])
    expect(host.querySelector('.tagadd')?.getAttribute('aria-label')).toBe('添加领域')
    expect(host.querySelector('.tagchip .rx')?.getAttribute('aria-label')).toBe('移除领域「speculative decoding」')
    await render([])
    expect(chips()).toEqual([])
    expect(host.querySelectorAll('.tagadd')).toHaveLength(1)
  })

  it('点 + 在它的位置打开输入框,候选是别的项目用过、这个项目还没有的领域,不带默认值,按输入筛;点一个就加在末尾', async () => {
    await render(['speculative decoding', 'KV cache'])
    await act(async () => { host.querySelector<HTMLButtonElement>('.tagadd')!.click() })
    expect(host.querySelector('.tagadd')).toBeNull()
    expect(document.activeElement).toBe(input())
    expect(document.querySelector('.pickhits .rh')?.textContent).toBe('已有领域')
    expect(candidates()).toEqual(['量化', '推理加速'])
    await act(async () => { setValue(input(), '推理') })
    expect(candidates()).toEqual(['推理加速'])
    expect(document.querySelector('.pickhits .rrow.mk')?.textContent).toBe('推理')
    await act(async () => { document.querySelector<HTMLElement>('.pickhits .rrow')!.click() })
    expect(onSave).toHaveBeenLastCalledWith(['speculative decoding', 'KV cache', '推理加速'])
    expect(host.querySelector('.tagin')).toBeNull()
  })

  it('打一个没人用过的领域回车,也加在末尾', async () => {
    await render(['KV cache'])
    await act(async () => { host.querySelector<HTMLButtonElement>('.tagadd')!.click() })
    await act(async () => { setValue(input(), '低比特') })
    await act(async () => { key(input(), 'Enter') })
    expect(onSave).toHaveBeenLastCalledWith(['KV cache', '低比特'])
  })

  it('点一个领域就地改它:输入框里是它原来的字,改了回车写回同一个位置,别的领域不动', async () => {
    await render(['speculative decoding', 'KV cache', '推理加速'])
    await act(async () => { host.querySelectorAll<HTMLButtonElement>('.tagchip-open')[1]!.click() })
    expect(input().value).toBe('KV cache')
    expect(chips()).toEqual(['speculative decoding', '推理加速'])
    expect(host.querySelector('.tagin')!.compareDocumentPosition(host.querySelectorAll('.tagchip')[1]!))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    await act(async () => { setValue(input(), 'KV cache 压缩') })
    await act(async () => { key(input(), 'Enter') })
    expect(onSave).toHaveBeenLastCalledWith(['speculative decoding', 'KV cache 压缩', '推理加速'])
  })

  it('改的时候 Esc 放弃,领域照旧;原样回车不写', async () => {
    await render(['speculative decoding', 'KV cache'])
    await act(async () => { host.querySelectorAll<HTMLButtonElement>('.tagchip-open')[0]!.click() })
    await act(async () => { setValue(input(), '别的') })
    await act(async () => { key(input(), 'Escape') })
    expect(chips()).toEqual(['speculative decoding', 'KV cache'])
    await act(async () => { host.querySelectorAll<HTMLButtonElement>('.tagchip-open')[0]!.click() })
    expect(input().value).toBe('speculative decoding')
    await act(async () => { key(input(), 'Enter') })
    expect(onSave).not.toHaveBeenCalled()
    expect(host.querySelector('.tagin')).toBeNull()
  })

  it('改成这个项目已有的另一个领域,两个并成一个;× 去掉那一个,交给移除那一路', async () => {
    await render(['speculative decoding', 'KV cache'])
    await act(async () => { host.querySelectorAll<HTMLButtonElement>('.tagchip-open')[0]!.click() })
    await act(async () => { setValue(input(), 'KV cache') })
    await act(async () => { key(input(), 'Enter') })
    expect(onSave).toHaveBeenLastCalledWith(['KV cache'])
    await act(async () => { host.querySelector<HTMLButtonElement>('.tagchip .rx')!.click() })
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onRemove).toHaveBeenLastCalledWith(['KV cache'])
  })
})
