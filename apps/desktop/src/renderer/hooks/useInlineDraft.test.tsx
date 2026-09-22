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
 * A placeholder probe: an input box and a button in `row`, an entry button (counted as triggers) and an unrelated button outside `row`.
 * When `detached` is true, `row` is not attached to any element; `onDraft` receives the hook return value each time it is rendered.
 */
function Probe({ onSubmit, onCancel, detached = false, onDraft }: {
  onSubmit: () => boolean | Promise<boolean>
  onCancel: () => void
  detached?: boolean
  onDraft?: (draft: Draft) => void
}) {
  const row = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const triggers = useMemo(() => [trigger], [])
  const draft = useInlineDraft({ row, triggers, onSubmit, onCancel })
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

/** Hang the probe into a real container and return the elements inside and outside the placeholder. */
function mount(
  onSubmit: () => boolean | Promise<boolean>,
  onCancel: () => void,
  options: { detached?: boolean; onDraft?: (draft: Draft) => void } = {},
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

/** Imitate a floating layer that is portaled to the body by Radix and return a button inside it. */
function portalLayer(): HTMLButtonElement {
  const wrapper = document.createElement('div')
  wrapper.setAttribute('data-radix-popper-content-wrapper', '')
  const button = document.createElement('button')
  wrapper.appendChild(button)
  document.body.appendChild(wrapper)
  return button
}

/** Dispatch a keystroke on the input box and finish this round of microtasks. */
async function press(input: HTMLInputElement, key: string): Promise<void> {
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

/** Pressing the left mouse button on `on` sends pointerdown. */
async function pressMouse(on: Element): Promise<void> {
  await act(async () => {
    on.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
  })
}

/** Move the focus to `to`: jsdom's focus() gives the previous focus point focusout, relatedTarget is `to`. */
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

  it('鼠标按在占位外撤掉占位;按在占位里、入口按钮上、Radix 浮层里都不撤', async () => {
    const onCancel = vi.fn()
    const { inner, trigger, outside } = mount(() => true, onCancel)
    const layer = portalLayer()

    await pressMouse(inner)
    await pressMouse(trigger)
    await pressMouse(layer)
    expect(onCancel).not.toHaveBeenCalled()

    await pressMouse(outside)
    expect(onCancel).toHaveBeenCalledTimes(1)
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

  it('焦点移到占位外的元素上,撤掉占位且不提交', async () => {
    const onSubmit = vi.fn(() => true)
    const onCancel = vi.fn()
    const { input, outside } = mount(onSubmit, onCancel)
    await moveFocus(input)

    await moveFocus(outside)
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onSubmit).not.toHaveBeenCalled()
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

    // When the input box is attached, use autoFocus; first make it out of focus and have no elements to take over, then the focus will start from outside the placeholder.
    await act(async () => { input.blur() })
    await moveFocus(outside)
    await moveFocus(elsewhere)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('占位元素还没挂上时,按下与焦点移动都不取消', async () => {
    const onCancel = vi.fn()
    const { trigger, outside } = mount(() => true, onCancel, { detached: true })

    // Move out from the entrance button: the entrance button is included in the placeholder, only the row is not blocked.
    await moveFocus(trigger)
    await moveFocus(outside)
    expect(onCancel).not.toHaveBeenCalled()
    await pressMouse(outside)
    expect(onCancel).not.toHaveBeenCalled()
  })
})
