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
vi.mock('../ipc.js', () => ({ chat: { cancel } }))

const { useCoreGenerations } = await import('./useGenerations.js')

/** A jobs status in which Core is generating replies in `generating`. */
const reported = (...generating: string[]): JobsStatus => ({
  writes: 0, uploads: [], downloads: [], fetch: { state: 'idle', checkedAt: null, reason: null }, generating,
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
  })

  it('Core 报告哪条对话在生成，就只有那一条在生成；还没有报告时一条也不算', () => {
    const { latest, report } = mount(null)
    expect(latest().running('chat-1')).toBe(false)
    report(reported('chat-1'))
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
    const { latest } = mount(reported('chat-1'), refresh)
    act(() => latest().stop('chat-1'))
    expect(cancel).toHaveBeenCalledExactlyOnceWith('chat-1')
    expect(refresh).toHaveBeenCalledOnce()
    expect(cancel.mock.invocationCallOrder[0]).toBeLessThan(refresh.mock.invocationCallOrder[0]!)
  })
})
