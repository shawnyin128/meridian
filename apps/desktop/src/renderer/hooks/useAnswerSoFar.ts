import { useEffect, useRef, useState } from 'react'
import type { ChatMessage, ChatWriting } from '../../shared/contract.js'
import { chat as chatApi } from '../ipc.js'

/** How often a chat screen asks Core for the answer being written. */
const POLL_MS = 150

/** The answer a chat's turn is writing, as an answer message, and when the turn began. */
export type AnswerSoFar = { message: ChatMessage; since: string }

/**
 * The answer being written in chat `chat`, as an answer message naming the model writing it, with no
 * text until the first text arrives, and when its turn began, asked of Core every POLL_MS while
 * `running`; null before Core names the model, or once `messages`, the chat's messages as last read,
 * end with an answer. When the turn stops, the answer stays until the messages are read again: the
 * shell learns that the chat stopped before the screen reads the answer the turn kept.
 */
export function useAnswerSoFar(
  chat: string | null, running: boolean, messages: readonly ChatMessage[] | null,
): AnswerSoFar | null {
  const [written, setWritten] = useState<ChatWriting | null>(null)
  const runningNow = useRef(running)
  runningNow.current = running
  useEffect(() => {
    if (chat === null || !running) return
    setWritten(null)
    let live = true
    const read = () => {
      void chatApi.writing(chat).then((next) => {
        if (live && next !== null) setWritten(next)
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
    if (!runningNow.current) setWritten(null)
  }, [messages])
  if (written === null || messages === null || messages.at(-1)?.role === 'ai') return null
  return {
    message: {
      id: 'answer-so-far', role: 'ai', runs: written.text === '' ? [] : [{ kind: 'text', text: written.text }], actions: [],
      model: written.model,
    },
    since: written.since,
  }
}
