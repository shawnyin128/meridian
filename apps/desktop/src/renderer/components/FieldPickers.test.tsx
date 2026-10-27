// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessagesProvider } from '../messages/useMessages.js'
import { TodayContext } from '../shell/AppShell.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'
import { MenuItem } from './ActionMenu.js'
import { CapsuleToggle, ChoicePicker, DateButton, DateRangeField, DotsMenu } from './FieldPickers.js'
import { RowActions } from './Item.js'
import { TOOLTIP_DELAY } from './Tooltip.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

/** Rests the pointer on `target` until the shared tooltip delay has passed; returns the tooltip's text. */
function hoverTip(target: Element): string | null {
  vi.useFakeTimers()
  act(() => { target.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' })) })
  act(() => { vi.advanceTimersByTime(TOOLTIP_DELAY) })
  vi.useRealTimers()
  return document.querySelector('[role="tooltip"]')?.textContent ?? null
}

describe('DotsMenu', () => {
  beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }) })
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    document.body.innerHTML = ''
  })

  it('shows the name of the object it manages as its tooltip, not a native 更多', () => {
    const html = renderToStaticMarkup(
      <MessagesProvider><DotsMenu label="管理想法：蒸馏预算"><span>归档</span></DotsMenu></MessagesProvider>,
    )
    expect(html).not.toContain('title=')
    expect(html).toContain('aria-label="管理想法：蒸馏预算"')
    expect(html).toContain('class="icbtn sm dots"')

    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => root.render(<MessagesProvider><DotsMenu label="管理想法：蒸馏预算"><span>归档</span></DotsMenu></MessagesProvider>))
    expect(hoverTip(host.querySelector('.dots')!)).toBe('管理想法：蒸馏预算')
    act(() => root.unmount())
  })
})

describe('DotsMenu on its row', () => {
  let root: Root
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    document.body.innerHTML = ''
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    window.getSelection()?.removeAllRanges()
  })

  /** A row that hosts a … menu named `name` with one item, a title and a field; `children` go inside it. */
  function Row({ name, onItem = () => {}, children }: { name: string; onItem?: () => void; children?: React.ReactNode }) {
    return (
      <div data-row-actions="" id={name}>
        <span className="title">{name}</span>
        <input aria-label={`${name} 名称`} />
        {children}
        <RowActions><DotsMenu label={`管理 ${name}`}><MenuItem onSelect={onItem}>{`${name} 归档`}</MenuItem></DotsMenu></RowActions>
      </div>
    )
  }
  const render = async (node: React.ReactNode) => { await act(async () => { root.render(<MessagesProvider>{node}</MessagesProvider>) }) }
  /** Right-clicks `target` at (300, 200); returns whether the page took the click from the system's menu. */
  const rightClick = async (target: Element) => {
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 300, clientY: 200 })
    await act(async () => { target.dispatchEvent(event) })
    return event.defaultPrevented
  }
  const menus = () => [...document.querySelectorAll('[role="menu"]')].map((menu) => menu.textContent)

  it('右键行的任意处打开它 … 按钮的同一个菜单,从指针处展开;选一项和从 … 打开时一样', async () => {
    const archived = vi.fn()
    await render(<Row name="想法" onItem={archived} />)
    expect(await rightClick(document.querySelector('#想法 .title')!)).toBe(true)
    expect(menus()).toEqual(['想法 归档'])
    expect(document.querySelector('[aria-label="管理 想法"]')!.getAttribute('aria-expanded')).toBe('true')
    expect(document.querySelector('[role="menu"]')!.getAttribute('data-align')).toBe('start')
    await act(async () => { document.querySelector<HTMLElement>('[role="menuitem"]')!.click() })
    expect(archived).toHaveBeenCalledTimes(1)
    expect(menus()).toEqual([])
  })

  it('在行里的文本框上、或在选中的文字上右键,留给系统的编辑菜单', async () => {
    await render(<Row name="想法" />)
    expect(await rightClick(document.querySelector('[aria-label="想法 名称"]')!)).toBe(false)
    const title = document.querySelector('#想法 .title')!
    const range = document.createRange()
    range.selectNodeContents(title)
    window.getSelection()!.addRange(range)
    expect(await rightClick(title)).toBe(false)
    expect(menus()).toEqual([])
  })

  it('行里套着的行右键只打开里面那一行自己的菜单', async () => {
    await render(<Row name="项目"><Row name="任务" /></Row>)
    expect(await rightClick(document.querySelector('#任务 .title')!)).toBe(true)
    expect(menus()).toEqual(['任务 归档'])
  })

  it('焦点在行里时 ContextMenu 键和 Shift+F10 打开同一个菜单,从 … 按钮下展开', async () => {
    for (const init of [{ key: 'ContextMenu' }, { key: 'F10', shiftKey: true }]) {
      await render(<Row name="想法" />)
      const dots = document.querySelector<HTMLElement>('[aria-label="管理 想法"]')!
      dots.focus()
      await act(async () => { dots.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })) })
      expect(menus()).toEqual(['想法 归档'])
      expect(document.querySelector('[role="menu"]')!.getAttribute('data-align')).toBe('end')
      await act(async () => { document.querySelector('[role="menu"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
      expect(menus()).toEqual([])
    }
  })

  it('能改名的菜单第一项是重命名,不带省略号;选它先合上菜单,焦点不回 … 按钮,再交给 onRename 就地打开名字', async () => {
    const menuAtRename: (string | null)[] = []
    const onRename = vi.fn(() => { menuAtRename.push(document.querySelector('[role="menu"]')?.textContent ?? null) })
    await render(
      <div data-row-actions="" id="task">
        <RowActions><DotsMenu label="管理 任务" onRename={onRename}><MenuItem>删除</MenuItem></DotsMenu></RowActions>
      </div>,
    )
    const dots = document.querySelector<HTMLElement>('[aria-label="管理 任务"]')!
    await act(async () => { dots.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })) })
    expect(menus()).toEqual(['重命名删除'])
    await act(async () => { document.querySelector<HTMLElement>('[role="menuitem"]')!.click() })
    await vi.waitFor(() => expect(onRename).toHaveBeenCalledTimes(1))
    expect([menuAtRename, menus(), document.activeElement === dots]).toEqual([[null], [], false])
    expect(await rightClick(document.querySelector('#task')!)).toBe(true)
    expect([...document.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent)).toEqual(['重命名', '删除'])
  })

  it('自己管着开合的菜单从 onOpenChange 听到右键', async () => {
    const changes: boolean[] = []
    function Held() {
      const [open, setOpen] = useState(false)
      return (
        <div data-row-actions="" id="held">
          <RowActions>
            <DotsMenu open={open} onOpenChange={(next) => { changes.push(next); setOpen(next) }}><MenuItem>改名</MenuItem></DotsMenu>
          </RowActions>
        </div>
      )
    }
    await render(<Held />)
    await rightClick(document.querySelector('#held')!)
    expect([changes, menus()]).toEqual([[true], ['改名']])
  })
})

describe('ChoicePicker', () => {
  beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }) })
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    document.body.innerHTML = ''
  })

  it('marks the current value with the one check mark in the slot before the label, not with bold', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    await act(async () => root.render(
      <MessagesProvider><ChoicePicker value="进行中" options={['计划中', '进行中', '已完成']} onPick={() => {}} /></MessagesProvider>,
    ))
    await act(async () => {
      host.querySelector('button')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
    })

    const items = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')]
    expect(items.map((item) => item.querySelector('.ck svg') !== null)).toEqual([false, true, false])
    expect(items.map((item) => item.firstElementChild?.classList.contains('ck'))).toEqual([true, true, true])
    expect(items.filter((item) => item.classList.contains('on'))).toEqual([])
    act(() => root.unmount())
  })

  it('in a heading is the compact text button showing its children, and opens its menu', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    await act(async () => root.render(
      <MessagesProvider>
        <ChoicePicker appearance="button" value="" options={['n1', 'n2']} onPick={() => {}}>关联节点</ChoicePicker>
      </MessagesProvider>,
    ))
    const trigger = host.querySelector('button')!
    expect([trigger.className, trigger.textContent]).toEqual(['btn sm', '关联节点'])
    await act(async () => { trigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })) })
    expect([...document.querySelectorAll('[role="menuitemradio"]')].map((item) => item.textContent)).toEqual(['n1', 'n2'])
    act(() => root.unmount())
  })

  it('in a row is named by the value it shows, with no 点击修改 tooltip', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => root.render(
      <MessagesProvider><ChoicePicker value="进行中" options={['计划中', '进行中', '已完成']} onPick={() => {}} /></MessagesProvider>,
    ))
    const trigger = host.querySelector('button')!
    expect([trigger.getAttribute('title'), hoverTip(trigger)]).toEqual([null, null])
    act(() => root.unmount())
  })
})

describe('ChoicePicker', () => {
  beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }) })
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  const LABELS = { openai: 'OpenAI', anthropic: 'Anthropic' } as const

  function Provider({ initial, onPick }: { initial: '' | keyof typeof LABELS; onPick: (value: string) => void }) {
    const [value, setValue] = useState<string>(initial)
    return (
      <ChoicePicker
        appearance="field" aria-label="模型服务" placeholder="选择服务" value={value}
        options={['openai', 'anthropic']} label={(option) => LABELS[option as keyof typeof LABELS]}
        onPick={(next) => { onPick(next); setValue(next) }}
      />
    )
  }

  const trigger = () => host.querySelector<HTMLButtonElement>('button[aria-label="模型服务"]')!
  const open = async () => {
    await act(async () => { trigger().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })) })
  }
  const items = () => [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')]

  it('in a form is the boxed field showing the picked label, never a native select', () => {
    act(() => root.render(<MessagesProvider><Provider initial="anthropic" onPick={vi.fn()} /></MessagesProvider>))
    expect(host.querySelector('select')).toBeNull()
    expect(trigger().classList).toContain('form-control-field')
    expect(trigger().textContent).toBe('Anthropic')
  })

  it('shows the placeholder while nothing is picked, and picking from its menu reports the value', async () => {
    const onPick = vi.fn()
    act(() => root.render(<MessagesProvider><Provider initial="" onPick={onPick} /></MessagesProvider>))
    expect(trigger().textContent).toBe('选择服务')
    await open()
    expect(items().map((item) => [item.textContent, item.getAttribute('aria-checked')]))
      .toEqual([['OpenAI', 'false'], ['Anthropic', 'false']])
    await act(async () => {
      items()[0]!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      items()[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onPick).toHaveBeenCalledWith('openai')
    expect(trigger().textContent).toBe('OpenAI')
  })
})

describe('DateButton', () => {
  beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }) })
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it('日历的日子是一组：一个 Tab 停靠点，进来落在选中的那天，方向键换一天，每天按完整日期命名，今天报 aria-current="date"', async () => {
    const onPick = vi.fn()
    act(() => root.render(
      <MessagesProvider>
        <TodayContext.Provider value="2026-10-18">
          <DateButton iso="2026-10-16" className="date" onPick={onPick} />
        </TodayContext.Provider>
      </MessagesProvider>,
    ))
    await act(async () => { host.querySelector<HTMLButtonElement>('.date')!.click() })
    const days = document.querySelector<HTMLElement>('.calg')!
    const buttons = [...days.querySelectorAll<HTMLButtonElement>('button')]
    expect([days, ...buttons].filter((element) => element.tabIndex === 0)).toEqual([days])
    expect([buttons[15], buttons[17]].map((day) => [day!.getAttribute('aria-label'), day!.getAttribute('aria-current')]))
      .toEqual([['10月16日', null], ['10月18日', 'date']])
    await act(async () => { days.focus() })
    expect(document.activeElement).toBe(buttons[15])
    await act(async () => {
      document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))
      await new Promise((done) => setTimeout(done, 0))
    })
    expect(document.activeElement).toBe(buttons[16])
    await act(async () => { buttons[16]!.click() })
    expect(onPick).toHaveBeenCalledWith('2026-10-17')
  })
})

describe('DateRangeField', () => {
  beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }) })
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it('开始和结束都从同一个日历挑;结束的日历从开始那天起,开始挑到结束之后时结束跟着挪到开始那天', async () => {
    const onChange = vi.fn()
    function Range() {
      const [range, setRange] = useState({ start: '2026-10-10', end: '2026-10-12' })
      return (
        <DateRangeField
          {...range} className="date" onChange={(next) => { onChange(next); setRange(next) }}
        >{(start, end) => <><span id="start">{start}</span><span id="end">{end}</span></>}</DateRangeField>
      )
    }
    act(() => root.render(<MessagesProvider><TodayContext.Provider value="2026-10-18"><Range /></TodayContext.Provider></MessagesProvider>))
    const open = async (part: string) => {
      await act(async () => { host.querySelector<HTMLButtonElement>(`#${part} .date`)!.click() })
      return [...document.querySelectorAll('.calg')].at(-1)!.querySelectorAll<HTMLButtonElement>('button')
    }
    const endDays = [...await open('end')]
    expect(endDays.filter((day) => day.disabled).map((day) => day.textContent)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9'])
    await act(async () => { endDays[13]!.click() })
    // The closed calendar hands focus back to its trigger over a timer; the next one opens after that.
    await vi.waitFor(() => expect([document.activeElement, document.querySelector('.calg')])
      .toEqual([host.querySelector('#end .date'), null]))
    expect(onChange).toHaveBeenLastCalledWith({ start: '2026-10-10', end: '2026-10-14' })
    const startDays = [...await open('start')]
    expect(startDays.some((day) => day.disabled)).toBe(false)
    await act(async () => { startDays[19]!.click() })
    expect(onChange).toHaveBeenLastCalledWith({ start: '2026-10-20', end: '2026-10-20' })
  })
})

describe('CapsuleToggle', () => {
  beforeEach(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true })

  it('is the composer\'s capsule that turns on and off, pressed while on', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    function Toggling() {
      const [on, setOn] = useState(false)
      return <CapsuleToggle pressed={on} onToggle={() => setOn((held) => !held)}>实验设计</CapsuleToggle>
    }
    await act(async () => root.render(<Toggling />))
    const capsule = host.querySelector('button')!

    expect(capsule.className).toBe('choice-capsule')
    expect(capsule.textContent).toBe('实验设计')
    expect(capsule.getAttribute('aria-pressed')).toBe('false')
    await act(async () => capsule.click())
    expect(capsule.getAttribute('aria-pressed')).toBe('true')
    await act(async () => capsule.click())
    expect(capsule.getAttribute('aria-pressed')).toBe('false')
    act(() => root.unmount())
    host.remove()
  })
})
