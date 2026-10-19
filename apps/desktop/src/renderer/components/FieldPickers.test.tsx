// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'
import { ChoicePicker, DotsMenu } from './FieldPickers.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

describe('DotsMenu', () => {
  beforeEach(() => { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh') })

  it('always names itself 更多 and takes an extra accessible name', () => {
    const html = renderToStaticMarkup(
      <MessagesProvider><DotsMenu label="管理想法：蒸馏预算"><span>归档</span></DotsMenu></MessagesProvider>,
    )
    expect(html).toContain('title="更多"')
    expect(html).toContain('aria-label="管理想法：蒸馏预算"')
    expect(html).toContain('class="icbtn sm dots"')
  })
})

describe('ChoicePicker', () => {
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
})
