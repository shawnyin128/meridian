// @vitest-environment jsdom
import { act, createRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectDetail } from '../../../shared/contract.js'
import { MessagesProvider } from '../../messages/useMessages.js'
import { TodayContext } from '../../shell/AppShell.js'
import { LANGUAGE_STORAGE_KEY } from '../../shell/language.js'
import { ProjectTimeline } from './ProjectTimeline.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

// jsdom has no ResizeObserver; the board constructs one on mount.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
(globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver ??= ResizeObserverStub

const TODAY = '2026-09-16'
const PROJECT = {
  id: 'proj-1', name: '推测解码', status: '进行中', tasks: [],
  milestones: [{ id: 'm1', title: '中期评审', date: TODAY, done: false }],
} as unknown as ProjectDetail

describe('项目页时间线上的里程碑', () => {
  let root: Root | null = null
  let host: HTMLDivElement
  const calls = {
    onNewMilestone: vi.fn(),
    onCreateMilestone: vi.fn(() => Promise.resolve(true)),
    onRenameMilestone: vi.fn(() => Promise.resolve(true)),
    onDeleteMilestone: vi.fn(),
  }

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    document.body.innerHTML = ''
    for (const call of Object.values(calls)) call.mockClear()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root!.render(
      <MessagesProvider>
        <TodayContext.Provider value={TODAY}>
          <ProjectTimeline
            project={PROJECT} hoverMilestone={null} onHoverMilestone={vi.fn()} onLocateTask={vi.fn()}
            onMoveTask={vi.fn()} onMoveTaskWindow={vi.fn()} onMoveMilestone={vi.fn()} onReorderTasks={vi.fn()}
            onNewTask={vi.fn()} newActionRef={createRef()}
            {...calls}
          />
        </TodayContext.Provider>
      </MessagesProvider>,
    ))
  })

  afterEach(() => {
    if (root !== null) act(() => root!.unmount())
    root = null
  })

  const heading = () => document.querySelector('.ctxmenu .rh')?.textContent
  const input = () => document.querySelector<HTMLInputElement>('.ctxmenu input')!
  const typeAndEnter = async (value: string) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(input(), value)
      input().dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => { input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
  }

  it('在里程碑行用键盘按下，在今天打开新建里程碑的小窗；按 Esc 关掉后焦点回到这一行', async () => {
    const lane = host.querySelector<HTMLButtonElement>('.msrow .glane-new')!
    await act(async () => { lane.focus() })
    await act(async () => { lane.click() })
    expect(heading()).toBe('新建里程碑 · 9月16日')
    expect(document.activeElement).toBe(input())
    await act(async () => { input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })) })
    // Radix returns focus on the task after the popover unmounts.
    await act(async () => { await new Promise((done) => setTimeout(done, 0)) })
    expect(heading()).toBeUndefined()
    expect(document.activeElement).toBe(lane)
    expect(calls.onCreateMilestone).not.toHaveBeenCalled()
  })

  it('点里程碑行的空白处,和总览一样在点到的地方打开新建里程碑的小窗', async () => {
    await act(async () => { host.querySelector<HTMLElement>('.msrow')!.click() })
    expect(heading()).toEqual(expect.stringMatching(/^新建里程碑 · /))
    await typeAndEnter('上线评测')
    expect(calls.onCreateMilestone).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), '上线评测')
    expect(calls.onNewMilestone).not.toHaveBeenCalled()
  })

  it('点菱形,和总览一样在菱形处打开这个里程碑的改名小窗', async () => {
    const diamond = host.querySelector<HTMLElement>('.gddl[data-milestone="proj-1/m1"]')!
    await act(async () => {
      diamond.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 10 }))
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 10 }))
    })
    expect(heading()).toBe('里程碑 · 9月16日')
    expect(input().value).toBe('中期评审')
    await typeAndEnter('中期评审 v2')
    expect(calls.onRenameMilestone).toHaveBeenCalledExactlyOnceWith('m1', '中期评审 v2')
  })
})
