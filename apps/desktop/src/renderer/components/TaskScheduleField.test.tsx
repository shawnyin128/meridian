// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '../../shared/contract.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { TodayContext } from '../shell/AppShell.js'
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

  it('date mode exposes only date controls: a start and an end picked from the one calendar, no native date input', () => {
    const html = renderToStaticMarkup(
      <MessagesProvider>
        <TaskScheduleEditor mode="date" task={task} saving={false} onSave={() => {}} onCancel={() => {}} />
      </MessagesProvider>,
    )
    expect(html).not.toContain('type="date"')
    expect(html).not.toContain('开始时段')
    expect(html.match(/class="form-control form-button form-control-field choice-picker"[^>]*aria-haspopup="dialog"/g)).toHaveLength(2)
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

describe('TaskScheduleEditor 的时段', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    document.body.innerHTML = ''
  })

  /** Renders the editor for `scheduled` and returns what its save hands on, after `steps` run in it. */
  const edit = async (mode: 'date' | 'time', scheduled: Task, steps: (host: HTMLElement) => Promise<void>) => {
    const host = document.body.appendChild(document.createElement('div'))
    const root = createRoot(host)
    const onSave = vi.fn()
    act(() => root.render(
      <MessagesProvider>
        <TodayContext.Provider value="2026-09-16">
          <TaskScheduleEditor mode={mode} task={scheduled} saving={false} onSave={onSave} onCancel={() => {}} />
        </TodayContext.Provider>
      </MessagesProvider>,
    ))
    await steps(host)
    await act(async () => { host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    act(() => root.unmount())
    return onSave.mock.calls
  }
  /** Picks `option` from the time-slot picker named `name`. */
  const slot = (name: string, option: string) => async (host: HTMLElement) => {
    await act(async () => { host.querySelector(`[aria-label="${name}"]`)!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })) })
    const item = [...document.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitemradio"]')].find((held) => held.textContent === option)!
    await act(async () => { item.click() })
  }

  it('一天的任务,时段的开始挑到结束之后时结束跟着挪到它后面一格,结束挑到开始之前时开始跟着挪到它前面一格', async () => {
    expect(await edit('time', task, slot('开始时段', '12:00'))).toEqual([[{ window: { start: '12:00', end: '14:00' } }]])
    expect(await edit('time', task, slot('结束时段', '06:00'))).toEqual([[{ window: { start: '04:00', end: '06:00' } }]])
  })

  it('跨天的任务,时段的开始和结束分别落在第一天和最后一天,开始晚于结束也照样存下', async () => {
    const spanning = { ...task, end: '2026-09-18' }
    expect(await edit('time', spanning, slot('开始时段', '22:00'))).toEqual([[{ window: { start: '22:00', end: '10:00' } }]])
  })

  it('跨天的任务改成一天时,开始晚于结束的时段跟着挑的那一头挪开一格,存下的时段在一天里先开始再结束', async () => {
    const spanning = { ...task, start: '2026-09-16', end: '2026-09-18', window: { start: '22:00', end: '02:00' } } satisfies Task
    const day = (part: number, label: string) => async (host: HTMLElement) => {
      await act(async () => { host.querySelectorAll<HTMLButtonElement>('.form-button')[part]!.click() })
      const button = [...[...document.querySelectorAll('.calg')].at(-1)!.querySelectorAll<HTMLButtonElement>('button')]
        .find((held) => held.getAttribute('aria-label') === label)!
      await act(async () => { button.click() })
    }
    expect(await edit('date', spanning, day(1, '9月16日')))
      .toEqual([[{ start: '2026-09-16', end: '2026-09-16', window: { start: '00:00', end: '02:00' } }]])
    expect(await edit('date', spanning, day(0, '9月18日')))
      .toEqual([[{ start: '2026-09-18', end: '2026-09-18', window: { start: '22:00', end: '24:00' } }]])
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
