// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AddAction } from './AddAction.js'

describe('AddAction', () => {
  it('页面、分节和图标入口共享加号,只改变视觉权重', () => {
    const page = renderToStaticMarkup(<AddAction variant="page">导入 PDF</AddAction>)
    const section = renderToStaticMarkup(<AddAction>任务</AddAction>)
    const icon = renderToStaticMarkup(<AddAction variant="icon" title="关联项目" />)

    expect(page).toContain('class="btn pri add-action add-action-page"')
    expect(section).toContain('class="btn plain add-action add-action-section"')
    expect(icon).toContain('class="add-action add-action-icon"')
    expect([page, section, icon].every((markup) => markup.includes('<svg'))).toBe(true)
    expect(icon).toContain('aria-label="关联项目"')
  })

  it('keeps the visible label and the tooltip the same sentence', () => {
    const html = renderToStaticMarkup(<AddAction variant="section" title="添加附件">附件</AddAction>)
    expect(html).toContain('title="添加附件"')
    expect(html).toContain('<span>附件</span>')
  })
})
