import type { ChatMessageFields, ChatSendResult } from '../../shared/contract.js'
import { CallError, callFailure } from '../call-error.js'
import type { VaultStore } from '../vault.js'
import type { ChatHarnessRunner } from './chat.js'
import type { HarnessModelConfig } from './model-config.js'

const textRun = (text: string) => [{ kind: 'text' as const, text }]
const userMessage = (text: string): ChatMessageFields => ({
  role: 'you', runs: textRun(text), actions: [],
})
const answerMessage = (text: string): ChatMessageFields => ({
  role: 'ai', runs: textRun(text), actions: [],
})
const statusMessage = (text: string): ChatMessageFields => ({
  role: 'status', runs: textRun(text), actions: [],
})

/** Core-owned chat transaction: persist the user turn, run once, then persist a validated result. */
export function createChatService(options: {
  store: VaultStore
  model: HarnessModelConfig
  runner: ChatHarnessRunner | null
}) {
  const running = new Map<string, AbortController>()

  return {
    async send(id: string, text: string): Promise<ChatSendResult> {
      if (running.has(id)) throw new CallError('busy', '这段对话仍在生成，请先停止或等待完成')
      options.store.chatSession(id)
      options.store.appendChatMessages(id, [userMessage(text)])
      if (!options.model.settings().configured || options.runner === null) {
        const message = 'AI 尚未接入，请先在设置中配置模型与 API Key。'
        options.store.appendChatMessages(id, [statusMessage(message)])
        return { id, state: 'failed', reason: 'no-model' }
      }

      const controller = new AbortController()
      running.set(id, controller)
      try {
        const answer = await options.runner.answer(id, text, controller.signal)
        options.store.appendChatMessages(id, [answerMessage(answer)])
        return { id, state: 'complete' }
      } catch (cause) {
        if (controller.signal.aborted) return { id, state: 'cancelled' }
        const message = cause instanceof Error ? cause.message : '模型服务调用失败'
        options.store.appendChatMessages(id, [statusMessage(`生成失败：${message}`)])
        const failure = callFailure(cause)
        return { id, state: 'failed', reason: failure === 'unknown' ? 'model' : failure }
      } finally {
        if (running.get(id) === controller) running.delete(id)
      }
    },
    cancel(id: string) {
      const controller = running.get(id)
      if (controller === undefined) return { id, cancelled: false }
      controller.abort()
      return { id, cancelled: true }
    },
  }
}

export type ChatService = ReturnType<typeof createChatService>
