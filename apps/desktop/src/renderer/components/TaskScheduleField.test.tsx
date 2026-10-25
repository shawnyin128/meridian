// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '../../shared/contract.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'
import { TaskScheduleEditor, TaskScheduleField } from './TaskScheduleField.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const task: Task = {
  id: 'task-1', title: '校准', start: '2026-09-16', end: '2026-09-16',
  priority: 'p1', state: 'act', window: { start: '08:00', end: '10:00' },
}

describe('TaskScheduleEditor', () => {
  beforeEach(() => { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh') })

  it('date mode exposes only date controls', () => {
    const html = renderToStaticMarkup(
      <MessagesProvider>
        <TaskScheduleEditor mode="date" task={task} saving={false} onSave={() => {}} onCancel={() => {}} />
      </MessagesProvider>,
    )
    expect(html.match(/type="date"/g)).toHaveLength(2)
    expect(html).not.toContain('开始时段')
    expect(html.match(/class="form-control form-input form-control-field/g)).toHaveLength(2)
  })

  it('time mode exposes only time controls', () => {
    const html = renderToStaticMarkup(
      <MessagesProvider>
        <TaskScheduleEditor mode="time" task={task} saving={false} onSave={() => {}} onCancel={() => {}} />
      </MessagesProvider>,
    )
    expect(html).not.toContain('type="date"')
    expect(html).toContain('开始时段')
    expect(html).toContain('结束时段')
  })
})

describe('TaskScheduleField', () => {
  beforeEach(() => { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh') })

  it('opens its editor on the menu surface of a form', () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    document.body.innerHTML = ''
    const host = document.body.appendChild(document.createElement('div'))
    const root = createRoot(host)
    act(() => root.render(<MessagesProvider><TaskScheduleField mode="date" task={task} onSave={async () => true} /></MessagesProvider>))
    act(() => host.querySelector<HTMLButtonElement>('.schedule-trigger')!.click())
    expect(document.querySelector('[role="dialog"]')!.className).toBe('ctxmenu ctxmenu--form schedule-pop')
    act(() => root.unmount())
    vi.unstubAllGlobals()
  })
})
