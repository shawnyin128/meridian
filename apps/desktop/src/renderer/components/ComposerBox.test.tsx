// @vitest-environment jsdom
import { act, createRef } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { ComposerBox } from './ComposerBox.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

describe('ComposerBox', () => {
  it('一个框里上面是输入的字，下面一行是选择器、一道细竖线和功能胶囊，发送钮在这一行的末尾；按键和 ref 落在框上', () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const ref = createRef<HTMLDivElement>()
    const keyed = vi.fn()
    act(() => root.render(
      <ComposerBox
        ref={ref} onKeyDown={keyed}
        field={<div className="field" />} chips={<><button className="pick">a</button><button className="pick">b</button></>}
        functions={<button className="act">c</button>}
        send={<button className="send" />}
      />,
    ))
    const box = host.firstElementChild as HTMLElement
    expect(box).toBe(ref.current)
    expect([box.className, ...[...box.children].map((part) => part.className)]).toEqual(['cbox', 'field', 'cbox-foot'])
    expect([...box.querySelector('.cbox-foot')!.children].map((part) => part.className)).toEqual(['pick', 'pick', 'cbox-divider', 'act', 'cbox-send'])
    expect(box.querySelector('.cbox-send')!.firstElementChild!.className).toBe('send')
    act(() => { box.querySelector('.field')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(keyed).toHaveBeenCalledOnce()
    act(() => root.unmount())
  })
})
