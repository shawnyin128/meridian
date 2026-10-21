// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGenerations, type Generations } from './useGenerations.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

/** Renders nothing; only hands the generations of the latest render to the test. */
function Probe({ onRender }: { onRender: (generations: Generations) => void }) {
  onRender(useGenerations())
  return null
}

/** Mounts the probe and returns a reader of the generations it rendered last. */
function mount(): () => Generations {
  const host = document.createElement('div')
  document.body.appendChild(host)
  let latest: Generations | undefined
  act(() => { createRoot(host).render(<Probe onRender={(generations) => { latest = generations }} />) })
  return () => latest!
}

/** A piece of work that settles only when `settle` is called. */
function pending(): { work: Promise<void>; settle: () => Promise<void> } {
  let resolve = () => {}
  const work = new Promise<void>((done) => { resolve = done })
  return { work, settle: async () => { await act(async () => { resolve(); await work }) } }
}

describe('useGenerations', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    document.body.innerHTML = ''
  })

  it('一条对话生成时只有它在生成，生成结束后就不再算', async () => {
    const generations = mount()
    const reply = pending()
    act(() => { void generations().run('chat-1', reply.work) })
    expect([generations().running('chat-1'), generations().running('chat-2')]).toEqual([true, false])

    await reply.settle()
    expect(generations().running('chat-1')).toBe(false)
  })

  it('停止后在同一条对话里再发，先前那次结束时不会把这次也算作结束', async () => {
    const generations = mount()
    const stopped = pending()
    const next = pending()
    act(() => { void generations().run('chat-1', stopped.work) })
    act(() => generations().stop('chat-1'))
    expect(generations().running('chat-1')).toBe(false)

    act(() => { void generations().run('chat-1', next.work) })
    await stopped.settle()
    expect(generations().running('chat-1')).toBe(true)
    await next.settle()
    expect(generations().running('chat-1')).toBe(false)
  })
})
