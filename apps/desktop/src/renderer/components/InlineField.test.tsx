// @vitest-environment jsdom
import { act, useRef, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DraftsProvider } from '../hooks/useDrafts.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'
import { InlineField, InlineMetadataField } from './InlineField.js'

vi.mock('../ipc.js', () => ({ library: { location: () => Promise.resolve({ root: '/vaults/a' }) } }))

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const withMessages = (node: ReactNode) => <MessagesProvider>{node}</MessagesProvider>

function setValue(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = input instanceof window.HTMLTextAreaElement
    ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')!.set!
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('InlineMetadataField', () => {
  let root: Root | null = null
  let host: HTMLDivElement

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    document.body.innerHTML = ''
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    if (root !== null) act(() => root!.unmount())
    root = null
  })

  it('静息时是整格 hover 按钮，点击后在原位编辑并以回车保存', async () => {
    const save = vi.fn(() => Promise.resolve(true))
    act(() => root!.render(withMessages(<InlineMetadataField label="标题" value="旧标题" onSave={save} />)))
    const field = host.querySelector('.metadata-field')
    const value = host.querySelector<HTMLButtonElement>('.metadata-editable')!
    expect(value.textContent).toBe('旧标题')

    act(() => value.click())
    expect(host.querySelector('.metadata-field')).toBe(field)
    const input = host.querySelector<HTMLTextAreaElement>('[aria-label="编辑标题"]')!
    expect(input.tagName).toBe('TEXTAREA')
    expect(input.classList).toContain('form-control-inline')
    expect(input.selectionStart).toBe(input.selectionEnd)
    act(() => setValue(input, '新标题'))
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      await Promise.resolve()
    })
    expect(save).toHaveBeenCalledWith('新标题')
    expect(host.querySelector('.metadata-input')).toBeNull()
  })

  it('写入拒绝时保留原位编辑器，Esc 取消且不再次保存', async () => {
    const save = vi.fn(() => Promise.resolve(false))
    act(() => root!.render(withMessages(<InlineMetadataField label="年份" value="2026" onSave={save} />)))
    act(() => host.querySelector<HTMLButtonElement>('.metadata-editable')!.click())
    const input = host.querySelector<HTMLInputElement>('[aria-label="编辑年份"]')!
    act(() => setValue(input, '2027'))
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      await Promise.resolve()
    })
    expect(host.querySelector('.metadata-input')).not.toBeNull()

    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(host.querySelector('.metadata-input')).toBeNull()
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('改了值点到别处，像回车一样保存并收起；没改就离开只收起，不写', async () => {
    const save = vi.fn(() => Promise.resolve(true))
    act(() => root!.render(withMessages(<InlineMetadataField label="标题" value="旧标题" onSave={save} />)))
    act(() => host.querySelector<HTMLButtonElement>('.metadata-editable')!.click())
    act(() => setValue(host.querySelector<HTMLTextAreaElement>('[aria-label="编辑标题"]')!, '新标题'))
    await act(async () => {
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
      await Promise.resolve()
    })
    expect(save).toHaveBeenCalledWith('新标题')
    expect(host.querySelector('.metadata-input')).toBeNull()

    act(() => host.querySelector<HTMLButtonElement>('.metadata-editable')!.click())
    await act(async () => {
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
      await Promise.resolve()
    })
    expect(save).toHaveBeenCalledTimes(1)
    expect(host.querySelector('.metadata-input')).toBeNull()
  })

  it('离开时写入被拒，编辑器带着新值留在原位并标红；Esc 收起后再打开不再标红', async () => {
    const save = vi.fn(() => Promise.resolve(false))
    act(() => root!.render(withMessages(<InlineMetadataField label="年份" value="2026" onSave={save} />)))
    act(() => host.querySelector<HTMLButtonElement>('.metadata-editable')!.click())
    const input = host.querySelector<HTMLInputElement>('[aria-label="编辑年份"]')!
    act(() => setValue(input, '2027'))
    await act(async () => {
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
      await Promise.resolve()
    })
    expect(save).toHaveBeenCalledWith('2027')
    expect(host.querySelector('[aria-label="编辑年份"]')).toBe(input)
    expect(input.value).toBe('2027')
    expect(input.getAttribute('aria-invalid')).toBe('true')

    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    act(() => host.querySelector<HTMLButtonElement>('.metadata-editable')!.click())
    expect(host.querySelector('[aria-label="编辑年份"]')!.getAttribute('aria-invalid')).toBeNull()
  })

  it('名称格和属性值是同一个就地编辑:静息是同一格 hover 按钮,编辑时是同一种就地输入框,按参数修剪和校验', async () => {
    const save = vi.fn(() => Promise.resolve(true))
    act(() => root!.render(withMessages(
      <InlineField
        label="任务名称" value="旧任务" className="plan-name-cell"
        normalize={(value) => value.trim()} validate={(value) => value !== ''} onSave={save}
      />,
    )))
    expect(host.firstElementChild!.className).toBe('metadata-field plan-name-cell')
    act(() => host.querySelector<HTMLButtonElement>('.metadata-editable')!.click())
    const input = host.querySelector<HTMLInputElement>('[aria-label="编辑任务名称"]')!
    expect([...input.classList]).toEqual(['form-control', 'form-input', 'form-control-inline', 'metadata-input'])
    act(() => setValue(input, '  新任务  '))
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      await Promise.resolve()
    })
    expect(save).toHaveBeenCalledWith('新任务')
  })

  it('校验不过的名字按回车不保存:编辑器留着那几个字、标成不合法,改了字就不再标', async () => {
    const save = vi.fn(() => Promise.resolve(true))
    act(() => root!.render(withMessages(
      <InlineField
        label="任务名称" value="旧任务" normalize={(value) => value.trim()} validate={(value) => value !== ''} onSave={save}
      />,
    )))
    act(() => host.querySelector<HTMLButtonElement>('.metadata-editable')!.click())
    const input = () => host.querySelector<HTMLInputElement>('[aria-label="编辑任务名称"]')!
    act(() => setValue(input(), '   '))
    await act(async () => {
      input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      await Promise.resolve()
    })
    expect([save.mock.calls.length, input().value, input().getAttribute('aria-invalid')]).toEqual([0, '   ', 'true'])
    act(() => setValue(input(), '新任务'))
    expect(input().hasAttribute('aria-invalid')).toBe(false)
  })

  it('表格格子里的就地编辑:一打开就是同一种就地输入框,点格子里不算离开,回车交给保存后收起;Esc 收起且不保存', async () => {
    window.localStorage.removeItem('meridian.drafts:/vaults/a')
    const save = vi.fn(() => Promise.resolve(true))
    const close = vi.fn()
    function Table() {
      const cell = useRef<HTMLTableCellElement>(null)
      return (
        <table><tbody><tr><td ref={cell} id="cell">
          <InlineField
            label="随笔" value="旧随笔" keep={{ scope: ['paper', 'p1'], target: 'cell:remark' }} onSave={save}
            cell={{ ref: cell, onClose: close }}
          />
        </td></tr></tbody></table>
      )
    }
    await act(async () => {
      root!.render(withMessages(<DraftsProvider><Table /></DraftsProvider>))
      await Promise.resolve()
    })
    const input = host.querySelector<HTMLInputElement>('[aria-label="编辑随笔"]')!
    expect([input.value, input.classList.contains('form-control-inline'), document.activeElement]).toEqual(['旧随笔', true, input])
    await act(async () => {
      host.querySelector('#cell')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
      await Promise.resolve()
    })
    expect([save.mock.calls.length, close.mock.calls.length]).toEqual([0, 0])
    act(() => setValue(input, '新随笔'))
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      await Promise.resolve()
    })
    expect([save.mock.calls, close.mock.calls.length]).toEqual([[['新随笔']], 1])
    act(() => setValue(input, '不要的字'))
    act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect([save.mock.calls.length, close.mock.calls.length]).toEqual([1, 2])
  })

  it('留着草稿的字段:改到一半关掉 App 再打开,字段仍开着、是打的字;Esc 收起后再打开 App 不再带回', async () => {
    window.localStorage.removeItem('meridian.drafts:/vaults/a')
    const start = () => act(async () => {
      root!.render(withMessages(
        <DraftsProvider>
          <InlineMetadataField label="标题" value="旧标题" onSave={vi.fn()} keep={{ scope: ['paper', 'p1'], target: 'field:title' }} />
        </DraftsProvider>,
      ))
      await Promise.resolve()
    })
    const restart = async () => {
      act(() => root!.unmount())
      root = createRoot(host)
      await start()
    }
    const input = () => host.querySelector<HTMLTextAreaElement>('[aria-label="编辑标题"]')
    await start()
    act(() => host.querySelector<HTMLButtonElement>('.metadata-editable')!.click())
    act(() => setValue(input()!, '没存的标题'))
    await restart()
    expect(input()?.value).toBe('没存的标题')
    act(() => { input()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(input()).toBeNull()
    await restart()
    expect([input(), host.querySelector('.metadata-editable')!.textContent]).toEqual([null, '旧标题'])
  })
})
