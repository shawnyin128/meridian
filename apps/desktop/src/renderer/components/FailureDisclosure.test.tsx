// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FailureDisclosure } from './FailureDisclosure.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

describe('FailureDisclosure', () => {
  let root: Root
  let host: HTMLElement

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it('opens folded, unfolds into the rows the fold toggle names, each label with its code, and folds back', () => {
    act(() => root.render(
      <FailureDisclosure
        summary="生成失败" action={<span className="probe">重试</span>}
        rows={[{ label: '原因' }, { label: '运行订阅 CLI', code: 'failed · exit 1: Error: boom' }]}
      />,
    ))
    const toggle = host.querySelector<HTMLElement>('.fold-toggle')!
    expect(host.querySelector('.inline-message-text')!.textContent).toBe('生成失败')
    expect(host.querySelector('.inline-message-action .probe')).not.toBeNull()
    expect(host.querySelector('.failure-details')).toBeNull()

    act(() => toggle.click())
    const details = host.querySelector('.failure-details')!
    expect(toggle.getAttribute('aria-controls')).toBe(details.id)
    expect([...details.children].map((row) => [row.tagName, row.textContent, row.querySelector('code')?.textContent])).toEqual([
      ['LI', '原因', undefined],
      ['LI', '运行订阅 CLIfailed · exit 1: Error: boom', 'failed · exit 1: Error: boom'],
    ])

    act(() => toggle.click())
    expect(host.querySelector('.failure-details')).toBeNull()
  })
})
