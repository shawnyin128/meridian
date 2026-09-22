// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { MessagesProvider } from '../../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../../shell/language.js'
import { ProjectBlockerView, ProjectNextActionView } from './ProjectControl.js'

describe('ProjectControl', () => {
  beforeEach(() => { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh') })

  it('同一个下一步按信息密度渲染，但保留同一来源与正文', () => {
    const action = {
      source: 'task' as const, text: '跑校准',
      task: {
        id: 't1', state: 'act' as const, priority: 'p0' as const,
        start: '2026-09-16', end: '2026-09-16', window: { start: '08:00' as const, end: '10:00' as const },
      },
    }
    const detail = renderToStaticMarkup(
      <MessagesProvider><ProjectNextActionView action={action} /></MessagesProvider>,
    )
    const summary = renderToStaticMarkup(
      <MessagesProvider><ProjectNextActionView action={action} variant="summary" /></MessagesProvider>,
    )
    const inline = renderToStaticMarkup(
      <MessagesProvider><ProjectNextActionView action={action} variant="inline" /></MessagesProvider>,
    )
    expect(detail).toContain('任务')
    expect(detail).toContain('9月16日')
    expect(summary).toContain('9月16日')
    expect(summary).not.toContain('project-control-source')
    expect(inline).toContain('跑校准')
    expect(inline).not.toContain('project-control-meta')
  })

  it('空阻塞只在详情占位，列表行不制造空内容', () => {
    expect(renderToStaticMarkup(
      <MessagesProvider><ProjectBlockerView blocker={undefined} /></MessagesProvider>,
    )).toContain('无阻塞')
    expect(renderToStaticMarkup(
      <MessagesProvider><ProjectBlockerView blocker={undefined} variant="inline" /></MessagesProvider>,
    )).toBe('')
  })
})
