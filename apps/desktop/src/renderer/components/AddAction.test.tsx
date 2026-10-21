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
  it('页面、分节和图标入口共享加号,只改变视觉权重', () => {
    const page = renderToStaticMarkup(<AddAction variant="page">导入 PDF</AddAction>)
    const section = renderToStaticMarkup(<AddAction>任务</AddAction>)
    const icon = renderToStaticMarkup(<AddAction variant="icon" label="新增列" />)
    const chip = renderToStaticMarkup(<AddAction variant="chip" className="tagchip tagadd" label="关联项目" />)

    expect(page).toContain('class="btn pri add-action add-action-page"')
    expect(section).toContain('class="btn sm add-action add-action-section"')
    expect(icon).toContain('class="icbtn sm"')
    expect(chip).toContain('class="add-action add-action-chip tagchip tagadd"')
    expect([page, section, icon, chip].every((markup) => markup.includes('<svg'))).toBe(true)
    expect(icon).toContain('aria-label="新增列"')
    expect(chip).toContain('aria-label="关联项目"')
  })

  it('分节的添加钮只露出短词，整句是它的名字，不再用 tooltip 重复一遍', () => {
    const html = renderToStaticMarkup(<AddAction variant="section" label="添加附件">附件</AddAction>)
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
    act(() => root.render(<AddAction variant="chip" className="tagchip tagadd" label="关联项目" />))
    const chip = host.querySelector('button')!
    act(() => { chip.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' })) })
    act(() => { vi.advanceTimersByTime(TOOLTIP_DELAY) })
    expect([chip.getAttribute('title'), document.querySelector('[role="tooltip"]')?.textContent]).toEqual([null, '关联项目'])
    act(() => root.unmount())
    vi.useRealTimers()
  })
})
