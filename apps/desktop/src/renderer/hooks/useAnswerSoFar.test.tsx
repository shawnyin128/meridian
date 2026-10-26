// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage, ChatWriting } from '../../shared/contract.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const writing = vi.hoisted(() => vi.fn<(id: string) => Promise<ChatWriting | null>>())
vi.mock('../ipc.js', () => ({ chat: { writing } }))

const { useAnswerSoFar } = await import('./useAnswerSoFar.js')
type AnswerSoFar = import('./useAnswerSoFar.js').AnswerSoFar

const message = (id: string, role: ChatMessage['role'], text: string): ChatMessage =>
  ({ id, role, runs: [{ kind: 'text', text }], actions: [] })
const asked = [message('m1', 'you', 'EAGLE 快多少')]
const MODEL = { route: 'subscription', cli: 'claude', id: 'claude-opus-5-5[1m]' } as const
const SINCE = '2026-10-25T12:00:00.000Z'
/** Core's report of an answer written as far as `text`, in a turn that began at SINCE. */
const so = (text: string): ChatWriting => ({ text, model: MODEL, since: SINCE })

type Props = { chat: string | null; running: boolean; messages: ChatMessage[] | null }

/** Mounts a probe of the hook and returns the answer it rendered last and a way to render it anew. */
function mount(props: Props) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root: Root = createRoot(host)
  let latest: AnswerSoFar | null = null
  function Probe(current: Props) {
    latest = useAnswerSoFar(current.chat, current.running, current.messages)
    return null
  }
  const render = (next: Props) => act(() => { root.render(<Probe {...next} />) })
  render(props)
  return { latest: () => latest, render, unmount: () => act(() => root.unmount()) }
}

/** Lets the hook ask Core once more and hear back. */
const poll = () => act(async () => { await vi.advanceTimersByTimeAsync(200) })

describe('useAnswerSoFar', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers()
    writing.mockReset()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the answer as Core reports it written while the chat generates, as an answer message', async () => {
    writing.mockResolvedValue(so('EAGLE reaches'))
    const probe = mount({ chat: 'chat-1', running: true, messages: asked })
    await poll()
    expect(probe.latest()).toEqual({ message: { ...message('answer-so-far', 'ai', 'EAGLE reaches'), model: MODEL }, since: SINCE })
    expect(writing).toHaveBeenCalledWith('chat-1')

    writing.mockResolvedValue(so('EAGLE reaches 3.76x'))
    await poll()
    expect(probe.latest()?.message.runs).toEqual([{ kind: 'text', text: 'EAGLE reaches 3.76x' }])
    probe.unmount()
  })

  it('keeps the text once the turn stops until the messages are read again, then gives way to them', async () => {
    writing.mockResolvedValue(so('EAGLE reaches 3.76x'))
    const probe = mount({ chat: 'chat-1', running: true, messages: asked })
    await poll()

    probe.render({ chat: 'chat-1', running: false, messages: asked })
    expect(probe.latest()?.message.runs).toEqual([{ kind: 'text', text: 'EAGLE reaches 3.76x' }])
    const calls = writing.mock.calls.length
    await poll()
    expect(writing.mock.calls.length).toBe(calls)

    probe.render({ chat: 'chat-1', running: false, messages: [...asked] })
    expect(probe.latest()).toBeNull()
    probe.unmount()
  })

  it('shows an answer with no text while Core reports nothing written yet, nothing before Core reports, nor once the messages end with the kept answer', async () => {
    writing.mockResolvedValue(null)
    const probe = mount({ chat: 'chat-1', running: true, messages: asked })
    await poll()
    expect(probe.latest()).toBeNull()
    writing.mockResolvedValue(so(''))
    await poll()
    expect(probe.latest()?.message).toEqual({ id: 'answer-so-far', role: 'ai', runs: [], actions: [], model: MODEL })

    writing.mockResolvedValue(so('EAGLE reaches 3.76x'))
    await poll()
    probe.render({ chat: 'chat-1', running: true, messages: [...asked, message('m2', 'ai', 'EAGLE reaches 3.76x [p. 6].')] })
    expect(probe.latest()).toBeNull()
    probe.unmount()
  })

  it('starts each turn from nothing written and asks nothing while no turn runs', async () => {
    writing.mockResolvedValue(so('the first turn'))
    const probe = mount({ chat: 'chat-1', running: true, messages: asked })
    await poll()
    probe.render({ chat: 'chat-1', running: false, messages: [...asked, message('m2', 'ai', 'the first turn')] })
    writing.mockClear()
    await poll()
    expect(writing).not.toHaveBeenCalled()

    writing.mockReturnValue(new Promise(() => {}))
    probe.render({ chat: 'chat-1', running: true, messages: [...asked, message('m2', 'ai', 'the first turn'), message('m3', 'you', '再问')] })
    expect(probe.latest()).toBeNull()
    probe.unmount()
  })
})
