// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatSendResult } from '../../shared/contract.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

/** Every call made, in order: the chat calls to Core, the vault revision bumps and the writes that finished. */
const calls = vi.hoisted(() => [] as string[])
const turns = vi.hoisted(() => ({ settle: (() => {}) as (result: ChatSendResult) => void }))
const pending = () => new Promise<ChatSendResult>((resolve) => { turns.settle = resolve })

vi.mock('../ipc.js', () => ({
  chat: {
    send: (id: string, _runs: unknown, mode: string | null) => { calls.push(`send ${id}${mode === null ? '' : ` ${mode}`}`); return pending() },
    retry: (id: string, mode: string | null) => { calls.push(`retry ${id}${mode === null ? '' : ` ${mode}`}`); return pending() },
  },
}))
vi.mock('../shell/AppShell.js', () => ({ useVaultRevision: () => ({ revision: 0, bump: () => { calls.push('bump') } }) }))
vi.mock('./useVaultWrite.js', () => ({
  useVaultWrite: () => async (op: Promise<unknown>) => { await op; calls.push('written'); return true },
}))
vi.mock('./useGenerations.js', () => ({ useGenerations: () => ({ run: async (work: Promise<unknown>) => { await work } }) }))

const { useChatTurn } = await import('./useChatTurn.js')

/** Mounts the hook with a pass-through `track` and returns what it gives. */
function mount(): ReturnType<typeof useChatTurn> {
  let turn: ReturnType<typeof useChatTurn> | undefined
  function Probe() {
    turn = useChatTurn((sent) => sent)
    return null
  }
  act(() => { createRoot(document.createElement('div')).render(<Probe />) })
  return turn!
}

describe('useChatTurn', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    calls.length = 0
  })

  it('发出的问题马上显示:发出之后、回答回来之前就让各屏重新读一遍,回答回来后再读一遍', async () => {
    const turn = mount()
    const sent = turn.send('chat-1', [{ kind: 'text', text: '问' }], null)
    expect(calls).toEqual(['send chat-1', 'bump'])
    await act(async () => {
      turns.settle({ id: 'chat-1', state: 'complete' })
      await sent
    })
    expect(calls).toEqual(['send chat-1', 'bump', 'written'])
  })

  it('重试不写新的问题,不提前重读,回答回来后像别的写入一样结束', async () => {
    const turn = mount()
    const retried = turn.retry('chat-1', null)
    expect(calls).toEqual(['retry chat-1'])
    await act(async () => {
      turns.settle({ id: 'chat-1', state: 'complete' })
      await retried
    })
    expect(calls).toEqual(['retry chat-1', 'written'])
  })

  it('发出和重试都按自己的模式问 Core：设计轮次和整理想法轮次', async () => {
    const turn = mount()
    const sent = turn.send('chat-1', [{ kind: 'text', text: '设计实验' }], 'design')
    await act(async () => {
      turns.settle({ id: 'chat-1', state: 'complete' })
      await sent
    })
    const retried = turn.retry('chat-1', 'idea')
    await act(async () => {
      turns.settle({ id: 'chat-1', state: 'complete' })
      await retried
    })
    expect(calls).toEqual(['send chat-1 design', 'bump', 'written', 'retry chat-1 idea', 'written'])
  })
})
