// @vitest-environment jsdom
import { act, useMemo, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useInlineDraft } from './useInlineDraft.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

type Draft = ReturnType<typeof useInlineDraft>

/**
 * A draft probe: an input and a button inside `row`, plus an entry button (one of the triggers) and
 * an unrelated button outside `row`. With `detached`, `row` is attached to no element; `isEmpty` goes
 * to the hook as is; `onDraft` receives the hook's return value on every render.
 */
function Probe({ onSubmit, onCancel, detached = false, isEmpty, onDraft }: {
  onSubmit: () => boolean | Promise<boolean>
  onCancel: () => void
  detached?: boolean
  isEmpty?: () => boolean
  onDraft?: (draft: Draft) => void
}) {
  const row = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const triggers = useMemo(() => [trigger], [])
  const draft = useInlineDraft({ row, triggers, onSubmit, onCancel, ...(isEmpty === undefined ? {} : { isEmpty }) })
  onDraft?.(draft)
  return (
    <>
      <div ref={detached ? undefined : row}>
        <input {...draft.inputProps} />
        <button className="inner" />
      </div>
      <button className="trigger" ref={trigger} />
      <button className="outside" />
    </>
  )
}

/** Mount the probe into a real container and return the elements inside and outside the draft. */
function mount(
  onSubmit: () => boolean | Promise<boolean>,
  onCancel: () => void,
  options: { detached?: boolean; isEmpty?: () => boolean; onDraft?: (draft: Draft) => void } = {},
) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  act(() => { createRoot(host).render(<Probe onSubmit={onSubmit} onCancel={onCancel} {...options} />) })
  return {
    input: host.querySelector('input')!,
    inner: host.querySelector<HTMLButtonElement>('.inner')!,
    trigger: host.querySelector<HTMLButtonElement>('.trigger')!,
    outside: host.querySelector<HTMLButtonElement>('.outside')!,
  }
}

/** Imitate a popover that Radix portals to the body and return a button inside it. */
function portalLayer(): HTMLButtonElement {
  const wrapper = document.createElement('div')
  wrapper.setAttribute('data-radix-popper-content-wrapper', '')
  const button = document.createElement('button')
  wrapper.appendChild(button)
  document.body.appendChild(wrapper)
  return button
}

/** Dispatch a keystroke on the input box and finish this round of microtasks. */
async function press(input: HTMLInputElement, key: string, init: KeyboardEventInit = {}): Promise<void> {
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }))
  })
}

/** Pressing the left mouse button on `on` sends pointerdown. */
async function pressMouse(on: Element): Promise<void> {
  await act(async () => {
    on.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
  })
}

/** Move focus to `to`: jsdom's focus() fires focusout on the old focus with `to` as relatedTarget. */
async function moveFocus(to: HTMLElement): Promise<void> {
  await act(async () => { to.focus() })
}

describe('useInlineDraft', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    document.body.innerHTML = ''
  })

  it('一次提交没落地之前再回车,不发第二条', async () => {
    let settle = (consumed: boolean) => { void consumed }
    const onSubmit = vi.fn(() => new Promise<boolean>((ok) => { settle = ok }))
    const onCancel = vi.fn()
    const { input } = mount(onSubmit, onCancel)

    await press(input, 'Enter')
    await press(input, 'Enter')
    expect(onSubmit).toHaveBeenCalledTimes(1)

    await act(async () => { settle(true) })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('提交被拒时占位留着,而且还能再提交一次', async () => {
    const onSubmit = vi.fn(() => Promise.resolve(false))
    const onCancel = vi.fn()
    const { input } = mount(onSubmit, onCancel)

    await press(input, 'Enter')
    expect(onCancel).not.toHaveBeenCalled()

    await press(input, 'Enter')
    expect(onSubmit).toHaveBeenCalledTimes(2)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('提交把占位用掉时收一次,只收一次', async () => {
    const onCancel = vi.fn()
    const { input } = mount(() => true, onCancel)
    await press(input, 'Enter')
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('回车之外的提交入口与回车共用一道防重,用掉了一样收起', async () => {
    let settle = (consumed: boolean) => { void consumed }
    const onSubmit = vi.fn(() => new Promise<boolean>((ok) => { settle = ok }))
    const onCancel = vi.fn()
    const pick = vi.fn(() => true)
    let draft: Draft | undefined
    const { input } = mount(onSubmit, onCancel, { onDraft: (d) => { draft = d } })

    await press(input, 'Enter')
    await act(async () => { draft!.submit(pick) })
    expect(pick).not.toHaveBeenCalled()

    await act(async () => { settle(false) })
    await act(async () => { draft!.submit(pick) })
    expect(pick).toHaveBeenCalledTimes(1)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('submit 开始的提交在路上时,第二次 submit 与回车都不再发一次', async () => {
    let settle = (consumed: boolean) => { void consumed }
    const pick = vi.fn(() => new Promise<boolean>((ok) => { settle = ok }))
    const onSubmit = vi.fn(() => true)
    const onCancel = vi.fn()
    let draft: Draft | undefined
    const { input } = mount(onSubmit, onCancel, { onDraft: (d) => { draft = d } })

    await act(async () => { draft!.submit(pick) })
    await act(async () => { draft!.submit(pick) })
    await press(input, 'Enter')
    expect(pick).toHaveBeenCalledTimes(1)
    expect(onSubmit).not.toHaveBeenCalled()

    await act(async () => { settle(true) })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('submit 开始的提交在路上时点外不放弃;写成功后照常收掉', async () => {
    let settle = (consumed: boolean) => { void consumed }
    const pick = vi.fn(() => new Promise<boolean>((ok) => { settle = ok }))
    const onCancel = vi.fn()
    let draft: Draft | undefined
    const { outside } = mount(() => true, onCancel, { onDraft: (d) => { draft = d } })

    await act(async () => { draft!.submit(pick) })
    await pressMouse(outside)
    expect(onCancel).not.toHaveBeenCalled()

    await act(async () => { settle(true) })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('submit 开始的提交在路上时点外不放弃;写被拒后占位与字都留着', async () => {
    let settle = (consumed: boolean) => { void consumed }
    const pick = vi.fn(() => new Promise<boolean>((ok) => { settle = ok }))
    const onCancel = vi.fn()
    let draft: Draft | undefined
    const { outside } = mount(() => true, onCancel, { onDraft: (d) => { draft = d } })

    await act(async () => { draft!.submit(pick) })
    await pressMouse(outside)
    expect(onCancel).not.toHaveBeenCalled()

    await act(async () => { settle(false) })
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('submit 开始的提交在路上时焦点离开不放弃;写成功后照常收掉', async () => {
    let settle = (consumed: boolean) => { void consumed }
    const pick = vi.fn(() => new Promise<boolean>((ok) => { settle = ok }))
    const onCancel = vi.fn()
    let draft: Draft | undefined
    const { input, outside } = mount(() => true, onCancel, { onDraft: (d) => { draft = d } })
    await moveFocus(input)

    await act(async () => { draft!.submit(pick) })
    await moveFocus(outside)
    expect(onCancel).not.toHaveBeenCalled()

    await act(async () => { settle(true) })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('submit 开始的提交在路上时焦点离开不放弃;写被拒后占位与字都留着', async () => {
    let settle = (consumed: boolean) => { void consumed }
    const pick = vi.fn(() => new Promise<boolean>((ok) => { settle = ok }))
    const onCancel = vi.fn()
    let draft: Draft | undefined
    const { input, outside } = mount(() => true, onCancel, { onDraft: (d) => { draft = d } })
    await moveFocus(input)

    await act(async () => { draft!.submit(pick) })
    await moveFocus(outside)
    expect(onCancel).not.toHaveBeenCalled()

    await act(async () => { settle(false) })
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('提交在路上时点外不放弃;写成功后照常收掉', async () => {
    let settle = (consumed: boolean) => { void consumed }
    const onSubmit = vi.fn(() => new Promise<boolean>((ok) => { settle = ok }))
    const onCancel = vi.fn()
    const { input, outside } = mount(onSubmit, onCancel)

    await press(input, 'Enter')
    await pressMouse(outside)
    expect(onCancel).not.toHaveBeenCalled()

    await act(async () => { settle(true) })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('提交在路上时点外不放弃;写被拒后占位与字都留着', async () => {
    let settle = (consumed: boolean) => { void consumed }
    const onSubmit = vi.fn(() => new Promise<boolean>((ok) => { settle = ok }))
    const onCancel = vi.fn()
    const { input, outside } = mount(onSubmit, onCancel)

    await press(input, 'Enter')
    await pressMouse(outside)
    expect(onCancel).not.toHaveBeenCalled()

    await act(async () => { settle(false) })
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('提交在路上时焦点离开不放弃;写成功后照常收掉', async () => {
    let settle = (consumed: boolean) => { void consumed }
    const onSubmit = vi.fn(() => new Promise<boolean>((ok) => { settle = ok }))
    const onCancel = vi.fn()
    const { input, outside } = mount(onSubmit, onCancel)
    await moveFocus(input)

    await press(input, 'Enter')
    await moveFocus(outside)
    expect(onCancel).not.toHaveBeenCalled()

    await act(async () => { settle(true) })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('提交在路上时焦点离开不放弃;写被拒后占位与字都留着', async () => {
    let settle = (consumed: boolean) => { void consumed }
    const onSubmit = vi.fn(() => new Promise<boolean>((ok) => { settle = ok }))
    const onCancel = vi.fn()
    const { input, outside } = mount(onSubmit, onCancel)
    await moveFocus(input)

    await press(input, 'Enter')
    await moveFocus(outside)
    expect(onCancel).not.toHaveBeenCalled()

    await act(async () => { settle(false) })
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('Esc 撤掉占位并且不往上冒', async () => {
    const onCancel = vi.fn()
    const onSubmit = vi.fn(() => true)
    const { input } = mount(onSubmit, onCancel)
    const bubbled = vi.fn()
    document.addEventListener('keydown', bubbled)

    await press(input, 'Escape')
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onSubmit).not.toHaveBeenCalled()
    expect(bubbled).not.toHaveBeenCalled()

    document.removeEventListener('keydown', bubbled)
  })

  it('输入法组字时的回车与 Esc 归输入法:不提交也不撤掉,Esc 也不往上冒;组完字后照常', async () => {
    const onSubmit = vi.fn(() => false)
    const onCancel = vi.fn()
    const { input } = mount(onSubmit, onCancel)
    const bubbled: string[] = []
    const listen = (event: KeyboardEvent) => { bubbled.push(event.key) }
    document.addEventListener('keydown', listen)

    await press(input, 'Enter', { isComposing: true })
    await press(input, 'Escape', { isComposing: true })
    expect(onSubmit).not.toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
    expect(bubbled).toEqual(['Enter'])

    await press(input, 'Enter')
    expect(onSubmit).toHaveBeenCalledTimes(1)
    await press(input, 'Escape')
    expect(onCancel).toHaveBeenCalledTimes(1)

    document.removeEventListener('keydown', listen)
  })

  it('鼠标按在占位外像回车一样提交;按在占位里、入口按钮上、Radix 浮层里都不提交', async () => {
    const onSubmit = vi.fn(() => true)
    const onCancel = vi.fn()
    const { inner, trigger, outside } = mount(onSubmit, onCancel)
    const layer = portalLayer()

    await pressMouse(inner)
    await pressMouse(trigger)
    await pressMouse(layer)
    expect(onSubmit).not.toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()

    await pressMouse(outside)
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('离开空占位只收起,不提交', async () => {
    const onSubmit = vi.fn(() => true)
    const onCancel = vi.fn()
    const { input, outside } = mount(onSubmit, onCancel, { isEmpty: () => true })

    await pressMouse(outside)
    expect(onCancel).toHaveBeenCalledTimes(1)
    await moveFocus(input)
    await moveFocus(outside)
    expect(onCancel).toHaveBeenCalledTimes(2)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('离开时提交被拒:占位与字留着并标红,不改字再离开不重发,改了字才重发;回车被拒不标红', async () => {
    const onSubmit = vi.fn(() => false)
    const onCancel = vi.fn()
    const { input, outside } = mount(onSubmit, onCancel)

    await press(input, 'Enter')
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(input.getAttribute('aria-invalid')).toBeNull()

    await pressMouse(outside)
    expect(onSubmit).toHaveBeenCalledTimes(2)
    expect(onCancel).not.toHaveBeenCalled()
    expect(input.getAttribute('aria-invalid')).toBe('true')

    await moveFocus(input)
    await moveFocus(outside)
    await pressMouse(outside)
    expect(onSubmit).toHaveBeenCalledTimes(2)
    expect(input.getAttribute('aria-invalid')).toBe('true')

    await act(async () => { input.dispatchEvent(new Event('input', { bubbles: true })) })
    expect(input.getAttribute('aria-invalid')).toBeNull()
    await pressMouse(outside)
    expect(onSubmit).toHaveBeenCalledTimes(3)
    expect(input.getAttribute('aria-invalid')).toBe('true')
  })

  it('标红后 Esc 照样撤掉占位,红也一起清掉', async () => {
    const onCancel = vi.fn()
    const { input, outside } = mount(() => false, onCancel)

    await pressMouse(outside)
    expect(input.getAttribute('aria-invalid')).toBe('true')
    await press(input, 'Escape')
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(input.getAttribute('aria-invalid')).toBeNull()
  })

  it('切到别的应用不算放弃:失焦时没有接手的元素,占位留着', async () => {
    const onSubmit = vi.fn(() => true)
    const onCancel = vi.fn()
    const { input } = mount(onSubmit, onCancel)
    await moveFocus(input)

    // When the window is out of focus, the browser sends focusout without relatedTarget, and jsdom's blur() sends exactly this one
    await act(async () => { input.blur() })
    expect(onSubmit).not.toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('焦点移到占位外的元素上,像回车一样提交', async () => {
    const onSubmit = vi.fn(() => true)
    const onCancel = vi.fn()
    const { input, outside } = mount(onSubmit, onCancel)
    await moveFocus(input)

    await moveFocus(outside)
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('焦点在占位里挪动、落到入口按钮上都不算离开', async () => {
    const onCancel = vi.fn()
    const { input, inner, trigger } = mount(() => true, onCancel)

    await moveFocus(input)
    await moveFocus(inner)
    await moveFocus(trigger)
    await moveFocus(input)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('焦点移进 portal 出去的 Radix 浮层不算离开,再从浮层移到占位外才算', async () => {
    const onCancel = vi.fn()
    const { input, outside } = mount(() => true, onCancel)
    const layer = portalLayer()

    await moveFocus(input)
    await moveFocus(layer)
    expect(onCancel).not.toHaveBeenCalled()

    await moveFocus(outside)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('焦点从占位里别的元素、或从入口按钮移到占位外,一样算离开', async () => {
    const onCancel = vi.fn()
    const { inner, trigger, outside } = mount(() => true, onCancel)

    await moveFocus(inner)
    await moveFocus(outside)
    expect(onCancel).toHaveBeenCalledTimes(1)

    await moveFocus(trigger)
    await moveFocus(outside)
    expect(onCancel).toHaveBeenCalledTimes(2)
  })

  it('焦点在占位外的两个元素之间挪动,不算离开', async () => {
    const onCancel = vi.fn()
    const { input, outside } = mount(() => true, onCancel)
    const elsewhere = document.createElement('button')
    document.body.appendChild(elsewhere)

    // The input autofocuses on mount; blur it first with no element taking focus, so focus starts
    // outside the draft.
    await act(async () => { input.blur() })
    await moveFocus(outside)
    await moveFocus(elsewhere)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('占位元素还没挂上时,按下与焦点移动都不取消', async () => {
    const onCancel = vi.fn()
    const { trigger, outside } = mount(() => true, onCancel, { detached: true })

    // Focus leaves from the entry button, which counts as inside the draft; only `row` is not
    // mounted.
    await moveFocus(trigger)
    await moveFocus(outside)
    expect(onCancel).not.toHaveBeenCalled()
    await pressMouse(outside)
    expect(onCancel).not.toHaveBeenCalled()
  })
})
