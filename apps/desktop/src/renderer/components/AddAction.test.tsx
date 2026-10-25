// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AddAction } from './AddAction.js'
import { TOOLTIP_DELAY } from './Tooltip.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

describe('AddAction', () => {
  it('每种尺寸都是次要按钮的灰底配同一个加号：带字的是常规或紧凑的 Button，只有加号的是方块，标签串里是标签那么高的方块', () => {
    const regular = renderToStaticMarkup(<AddAction size="regular">导入 PDF</AddAction>)
    const compact = renderToStaticMarkup(<AddAction size="compact">任务</AddAction>)
    const icon = renderToStaticMarkup(<AddAction size="compact" label="新对话" />)
    const chip = renderToStaticMarkup(<AddAction size="chip" className="tagchip tagadd" label="关联项目" />)

    expect(regular).toContain('class="btn add-action"')
    expect(compact).toContain('class="btn sm add-action"')
    expect(icon).toContain('class="add-action add-action-icon"')
    expect(chip).toContain('class="add-action add-action-icon add-action-chip tagchip tagadd"')
    expect(new Set([regular, compact, icon, chip].map((markup) => /<svg[\s\S]*?<\/svg>/.exec(markup)?.[0])).size).toBe(1)
    expect(icon).toContain('aria-label="新对话"')
    expect(chip).toContain('aria-label="关联项目"')
  })

  it('分节的添加钮只露出短词，整句是它的名字，不再用 tooltip 重复一遍', () => {
    const html = renderToStaticMarkup(<AddAction size="compact" label="添加附件">附件</AddAction>)
    expect(html).toContain('aria-label="添加附件"')
    expect(html).toContain('<span>附件</span>')
    expect(html).not.toContain('title=')
  })

  it('只有加号的入口把名字放进共享 tooltip，而不是原生 title', () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers()
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => root.render(<AddAction size="chip" className="tagchip tagadd" label="关联项目" />))
    const chip = host.querySelector('button')!
    act(() => { chip.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' })) })
    act(() => { vi.advanceTimersByTime(TOOLTIP_DELAY) })
    expect([chip.getAttribute('title'), document.querySelector('[role="tooltip"]')?.textContent]).toEqual([null, '关联项目'])
    act(() => root.unmount())
    vi.useRealTimers()
  })
})
