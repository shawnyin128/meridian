import { useEffect, useRef, useState } from 'react'
import type { ChatMessage } from '../../shared/contract.js'
import { chat as chatApi } from '../ipc.js'

/** How often a chat screen asks Core for the answer being written. */
const POLL_MS = 150

/**
 * The answer the model is writing in chat `chat`, as an answer message, asked of Core every POLL_MS
 * while `running`; null while none is written or once `messages`, the chat's messages as last read,
 * end with an answer. When the turn stops, the text stays until the messages are read again: the shell
 * learns that the chat stopped before the screen reads the answer the turn kept.
 */
export function useAnswerSoFar(
  chat: string | null, running: boolean, messages: readonly ChatMessage[] | null,
): ChatMessage | null {
  const [text, setText] = useState<string | null>(null)
  const runningNow = useRef(running)
  runningNow.current = running
  useEffect(() => {
    if (chat === null || !running) return
    setText(null)
    let live = true
    const read = () => {
      void chatApi.writing(chat).then((written) => {
        if (live && written !== null) setText(written)
      })
    }
    read()
    const timer = window.setInterval(read, POLL_MS)
    return () => {
      live = false
      window.clearInterval(timer)
    }
  }, [chat, running])
  useEffect(() => {
    if (!runningNow.current) setText(null)
  }, [messages])
  if (text === null || messages === null || messages.at(-1)?.role === 'ai') return null
  return { id: 'answer-so-far', role: 'ai', runs: [{ kind: 'text', text }], actions: [] }
}
