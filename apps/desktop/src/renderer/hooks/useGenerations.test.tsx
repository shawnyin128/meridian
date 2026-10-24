// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { JobsStatus } from '../../shared/contract.js'
import type { Generations } from './useGenerations.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const cancel = vi.hoisted(() => vi.fn(() => Promise.resolve({ id: 'chat-1', cancelled: true })))
const cancelWiki = vi.hoisted(() => vi.fn(() => Promise.resolve({ paperId: 'paper-1', cancelled: true })))
const dismissWiki = vi.hoisted(() => vi.fn(() => Promise.resolve(null)))
vi.mock('../ipc.js', () => ({ chat: { cancel }, harness: { cancel: cancelWiki, dismissFailure: dismissWiki } }))

const { useCoreGenerations } = await import('./useGenerations.js')

/** A jobs status in which Core is generating replies in `generating` and the Wiki proposals of `generatingWiki`, and the last Wiki runs of `wikiFailures` failed. */
const reported = (
  generating: string[] = [], generatingWiki: string[] = [], wikiFailures: JobsStatus['wikiFailures'] = {},
): JobsStatus => ({
  writes: 0, uploads: [], downloads: [], fetch: { state: 'idle', checkedAt: null, reason: null },
  generating, generatingWiki, wikiFailures,
})

/** Renders nothing; only hands the generations of the latest render to the test. */
function Probe({ status, refresh, onRender }: {
  status: JobsStatus | null
  refresh: () => void
  onRender: (generations: Generations) => void
}) {
  onRender(useCoreGenerations(status, refresh))
  return null
}

/** Mounts the probe on `status` and returns a reader of the generations it rendered last and a way to report anew. */
function mount(status: JobsStatus | null, refresh = vi.fn()): { latest: () => Generations; report: (next: JobsStatus) => void } {
  const host = document.createElement('div')
  document.body.appendChild(host)
  let latest: Generations | undefined
  const root: Root = createRoot(host)
  const render = (next: JobsStatus | null) => act(() => {
    root.render(<Probe status={next} refresh={refresh} onRender={(generations) => { latest = generations }} />)
  })
  render(status)
  return { latest: () => latest!, report: render }
}

describe('useCoreGenerations', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    document.body.innerHTML = ''
    cancel.mockClear()
    cancelWiki.mockClear()
    dismissWiki.mockClear()
  })

  it('Core 报告哪条对话在生成，就只有那一条在生成；还没有报告时一条也不算', () => {
    const { latest, report } = mount(null)
    expect(latest().running('chat-1')).toBe(false)
    report(reported(['chat-1']))
    expect([latest().running('chat-1'), latest().running('chat-2')]).toEqual([true, false])
    report(reported())
    expect(latest().running('chat-1')).toBe(false)
  })

  it('一次发送开始时马上向 Core 要新报告，发送结束时再要一次', async () => {
    const refresh = vi.fn()
    const { latest } = mount(reported(), refresh)
    let settle = () => {}
    const work = new Promise<void>((done) => { settle = done })
    let ran: Promise<void> = Promise.resolve()
    act(() => { ran = latest().run(work) })
    expect(refresh).toHaveBeenCalledOnce()
    await act(async () => { settle(); await ran })
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('停止请 Core 停下这条对话的回答，再马上要新报告', () => {
    const refresh = vi.fn()
    const { latest } = mount(reported(['chat-1']), refresh)
    act(() => latest().stop('chat-1'))
    expect(cancel).toHaveBeenCalledExactlyOnceWith('chat-1')
    expect(refresh).toHaveBeenCalledOnce()
    expect(cancel.mock.invocationCallOrder[0]).toBeLessThan(refresh.mock.invocationCallOrder[0]!)
  })

  it('Core 报告哪篇论文的 Wiki 提案在生成，就只有那一篇在生成，与同名的对话互不相干', () => {
    const { latest, report } = mount(reported(['paper-1']))
    expect(latest().wikiRunning('paper-1')).toBe(false)
    report(reported([], ['paper-1']))
    expect([latest().wikiRunning('paper-1'), latest().wikiRunning('paper-2'), latest().running('paper-1')])
      .toEqual([true, false, false])
    report(reported())
    expect(latest().wikiRunning('paper-1')).toBe(false)
  })

  it('Core 报告哪篇论文上一次 Wiki 生成为什么失败，就给那一篇那个原因；放下它请 Core 忘掉，再马上要新报告', async () => {
    const refresh = vi.fn()
    const { latest, report } = mount(reported([], [], { 'paper-1': 'model' }), refresh)
    expect([latest().wikiFailure('paper-1'), latest().wikiFailure('paper-2')]).toEqual(['model', undefined])
    await act(async () => { await latest().dismissWiki('paper-1') })
    expect(dismissWiki).toHaveBeenCalledExactlyOnceWith('paper-1')
    expect(refresh).toHaveBeenCalledOnce()
    expect(dismissWiki.mock.invocationCallOrder[0]).toBeLessThan(refresh.mock.invocationCallOrder[0]!)
    report(reported())
    expect(latest().wikiFailure('paper-1')).toBeUndefined()
  })

  it('停止 Wiki 提案请 Core 停下这篇论文的那一次生成，再马上要新报告', async () => {
    const refresh = vi.fn()
    const { latest } = mount(reported([], ['paper-1']), refresh)
    await act(async () => { await latest().stopWiki('paper-1') })
    expect(cancelWiki).toHaveBeenCalledExactlyOnceWith('paper-1')
    expect(cancel).not.toHaveBeenCalled()
    expect(refresh).toHaveBeenCalledOnce()
    expect(cancelWiki.mock.invocationCallOrder[0]).toBeLessThan(refresh.mock.invocationCallOrder[0]!)
  })
})
