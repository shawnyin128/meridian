// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Button, DONE_MS } from './Button.js'
import { IconPlus } from './icons.js'
import { Toolbar } from './Toolbar.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const classOf = (html: string) => /class="([^"]*)"/.exec(html)![1]

describe('Button', () => {
  let root: Root
  let host: HTMLDivElement

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.useRealTimers()
  })

  const button = () => host.querySelector('button')!

  it('四种样子、两种尺寸都落在同一套按钮类上，默认是普通的按钮而不是提交，另给的类只放在后面', () => {
    expect([
      renderToStaticMarkup(<Button size="regular">保存</Button>),
      classOf(renderToStaticMarkup(<Button size="regular" variant="primary">保存</Button>)),
      classOf(renderToStaticMarkup(<Button size="compact" variant="ghost">保存</Button>)),
      classOf(renderToStaticMarkup(<Button size="regular" tone="danger">清空</Button>)),
      classOf(renderToStaticMarkup(<Button size="regular" variant="primary" tone="danger">确认清空</Button>)),
      classOf(renderToStaticMarkup(<Button size="compact" variant="ghost" tone="danger" className="decline">拒绝</Button>)),
    ]).toEqual([
      '<button type="button" class="btn">保存</button>', 'btn pri', 'btn ghost sm', 'btn danger', 'btn pri danger', 'btn ghost danger sm decline',
    ])
  })

  it('图标排在字前面；开关按钮报出自己按没按下，不是开关就不报', () => {
    expect(renderToStaticMarkup(<Button size="compact" icon={<IconPlus />}>任务</Button>))
      .toBe(`<button type="button" class="btn sm">${renderToStaticMarkup(<IconPlus />)}任务</button>`)
    expect(renderToStaticMarkup(<Button size="compact" pressed>历史</Button>)).toContain('aria-pressed="true"')
    expect(renderToStaticMarkup(<Button size="compact" pressed={false}>历史</Button>)).toContain('aria-pressed="false"')
    expect(renderToStaticMarkup(<Button size="compact">历史</Button>)).not.toContain('aria-pressed')
  })

  /** The button rendered `busy`, as the parts a user and a screen reader get from it. */
  const busy = (isBusy: boolean) => {
    const onClick = vi.fn()
    act(() => root.render(
      <Button size="regular" tone="danger" busy={isBusy} busyLabel="正在重置…" onClick={onClick}>重置</Button>,
    ))
    button().click()
    return {
      name: button().getAttribute('aria-label'),
      ariaBusy: button().getAttribute('aria-busy'),
      disabled: button().disabled,
      pressed: onClick.mock.calls.length,
      label: button().querySelector('.btn-label')?.textContent ?? null,
      text: button().textContent,
      ring: button().querySelector('svg.ring.spin') !== null,
    }
  }

  it('空闲时只显示自己的字，可以按，没有转圈，也没有另给的名字', () => {
    expect(busy(false)).toEqual({
      name: null, ariaBusy: null, disabled: false, pressed: 1, label: null, text: '重置', ring: false,
    })
  })

  it('忙着时按不了、标为 aria-busy，字留在原处只是看不见，原处转着那一个转圈；忙时的说法只是它的名字，不上屏', () => {
    expect(busy(true)).toEqual({
      name: '正在重置…', ariaBusy: 'true', disabled: true, pressed: 0, label: '重置', text: '重置', ring: true,
    })
  })

  /** The parts of a done-capable Save button a user and a screen reader get from it. */
  const look = () => ({
    name: button().getAttribute('aria-label'),
    label: button().querySelector('.btn-label')?.textContent ?? null,
    check: button().querySelector('svg.cki') !== null,
  })

  it('做完时字留在原处看不见，原处短暂显示那一个对勾，名字是做完的说法；过一会儿字回来', () => {
    vi.useFakeTimers()
    const show = (done: boolean) => act(() => root.render(
      <Button size="regular" variant="primary" done={done} doneLabel="已保存">保存</Button>,
    ))
    show(false)
    const before = look()
    show(true)
    const after = look()
    act(() => { vi.advanceTimersByTime(DONE_MS - 1) })
    const almost = look()
    act(() => { vi.advanceTimersByTime(1) })
    expect([before, after, almost, look()]).toEqual([
      { name: null, label: null, check: false },
      { name: '已保存', label: '保存', check: true },
      { name: '已保存', label: '保存', check: true },
      { name: null, label: null, check: false },
    ])
  })

  it('又做完一次时对勾再亮一次', () => {
    vi.useFakeTimers()
    const show = (done: boolean) => act(() => root.render(
      <Button size="regular" variant="primary" done={done} doneLabel="已保存">保存</Button>,
    ))
    show(true)
    act(() => { vi.advanceTimersByTime(DONE_MS) })
    show(false)
    show(true)
    expect(look()).toEqual({ name: '已保存', label: '保存', check: true })
  })

  it('在工具栏里是工具栏的一个控件，不另占一个 Tab 停靠点', () => {
    act(() => root.render(
      <Toolbar label="对话"><div className="composer-row"><Button size="compact" variant="ghost">@项目</Button></div></Toolbar>,
    ))
    const stops = [...host.querySelectorAll<HTMLElement>('*')].filter((element) => element.tabIndex >= 0)
    expect(stops).toEqual([host.querySelector('.composer-row')])
  })
})
