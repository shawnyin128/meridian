import type {
  ChatAnswerModel, ChatMessage, ChatMessageFields, ChatRun, ChatSendResult, ChatWriting, TrashedEntry,
} from '../../shared/contract.js'
import { CallError, callFailure } from '../call-error.js'
import type { VaultStore } from '../vault.js'
import { trashedEntry } from '../write-receipts.js'
import { ChatFailure, type ChatHarnessRunner } from './chat.js'
import type { HarnessModelConfig } from './model-config.js'

const textRun = (text: string) => [{ kind: 'text' as const, text }]
/** `runs`, one or more, without the whitespace that starts or ends the turn and the text runs that leaves empty. */
function trimmed(runs: readonly ChatRun[]): ChatRun[] {
  const copied = runs.map((run) => ({ ...run }))
  const first = copied[0]!
  const last = copied.at(-1)!
  if (first.kind === 'text') first.text = first.text.trimStart()
  if (last.kind === 'text') last.text = last.text.trimEnd()
  return copied.filter((run) => run.kind !== 'text' || run.text !== '')
}
const answerMessage = (text: string, model: ChatAnswerModel | undefined): ChatMessageFields => ({
  role: 'ai', runs: textRun(text), actions: [], ...(model === undefined ? {} : { model }),
})
const statusMessage = (text: string): ChatMessageFields => ({
  role: 'status', runs: textRun(text), actions: [],
})

/** The text of a turn's runs, as the model is asked it. */
const textOf = (runs: readonly ChatRun[]) => runs.map((run) => run.text).join('')

/** Core-owned chat transaction: persist the user turn, run once, then persist a validated result. */
export function createChatService(options: {
  store: VaultStore
  model: HarnessModelConfig
  runner: ChatHarnessRunner | null
}) {
  const running = new Map<string, AbortController>()
  const written = new Map<string, ChatWriting>()
  const stopped = (id: string) => {
    running.delete(id)
    written.delete(id)
  }

  /**
   * Asks the model once to answer `text` in chat `id` and keeps the answer with the model that wrote
   * it, or, when the turn gets none, a status line that says what happened in plain words; the error's
   * own text goes to the log.
   */
  const answer = async (id: string, text: string): Promise<ChatSendResult> => {
    if (!options.model.planModel().configured || options.runner === null) return { id, state: 'failed', reason: 'no-model' }
    const controller = new AbortController()
    running.set(id, controller)
    try {
      let model: ChatAnswerModel | undefined
      const answered = await options.runner.answer(id, text, controller.signal, {
        onModel: (named) => {
          model = named
          if (running.get(id) === controller) written.set(id, { text: written.get(id)?.text ?? '', model: named })
        },
        onText: (so) => {
          if (running.get(id) === controller && model !== undefined) written.set(id, { text: so, model })
        },
      })
      options.store.appendChatMessages(id, [answerMessage(answered, model)])
      return { id, state: 'complete' }
    } catch (cause) {
      if (controller.signal.aborted) return { id, state: 'cancelled' }
      console.error(`[chat] ${id} 生成失败：${cause instanceof Error ? cause.message : String(cause)}`)
      const plain = cause instanceof ChatFailure || cause instanceof CallError ? cause.message : '模型服务调用失败'
      options.store.appendChatMessages(id, [statusMessage(`生成失败：${plain}`)])
      const failure = callFailure(cause)
      return { id, state: 'failed', reason: failure === 'unknown' ? 'model' : failure }
    } finally {
      if (running.get(id) === controller) stopped(id)
    }
  }

  return {
    async send(id: string, written: readonly ChatRun[]): Promise<ChatSendResult> {
      if (running.has(id)) throw new CallError('busy', '这段对话仍在生成，请先停止或等待完成')
      options.store.chatSession(id)
      const runs = trimmed(written)
      options.store.appendChatMessages(id, [{ role: 'you', runs, actions: [] }])
      return answer(id, textOf(runs))
    },
    /**
     * Asks the model again to answer chat `id`'s last question, whose turn ended in a status line,
     * without writing the question twice: one more billable turn, as `send` is. Fails as `busy` while
     * the chat is generating and as `refused` when it does not end in such a line.
     */
    async retry(id: string): Promise<ChatSendResult> {
      if (running.has(id)) throw new CallError('busy', '这段对话仍在生成，请先停止或等待完成')
      const messages = options.store.chatMessages(id)
      const question = messages.findLast((message) => message.role !== 'status')
      if (messages.at(-1)?.role !== 'status' || question?.role !== 'you') {
        throw new CallError('refused', '这段对话的最后一问已经有回答')
      }
      return answer(id, textOf(question.runs))
    },
    /** Stops the reply being generated in `id`; from then on the chat no longer counts as generating. */
    cancel(id: string) {
      const controller = running.get(id)
      if (controller === undefined) return { id, cancelled: false }
      controller.abort()
      stopped(id)
      return { id, cancelled: true }
    },
    /** Stops the reply chat `id` is generating, if any, then moves the chat into the trash; throws when there is no such chat. */
    delete(id: string): TrashedEntry {
      running.get(id)?.abort()
      return trashedEntry(options.store, () => options.store.deleteChat(id))
    },
    /** The messages of chat `id`, each mention naming its entity only while that entity is in the vault. */
    messages(id: string): ChatMessage[] {
      let pages: Set<string> | undefined
      const inVault = ({ kind, id: entity }: NonNullable<ChatRun['target']>): boolean => {
        if (kind === 'project') return options.store.hasProject(entity)
        if (kind === 'paper') return options.store.hasPaper(entity)
        pages ??= new Set(options.store.wikiCards().map((card) => card.id))
        return kind === 'page' && pages.has(entity)
      }
      return options.store.chatMessages(id).map((message) => ({
        ...message,
        runs: message.runs.map((run) => (run.target === undefined || inVault(run.target) ? run : { kind: run.kind, text: run.text })),
      }))
    },
    /**
     * The answer being written in chat `id`: its model, as far as known, and its text so far, empty
     * before the first text; null while no turn there has named its model.
     */
    writing(id: string): ChatWriting | null {
      return written.get(id) ?? null
    },
    /** The ids of the chats whose reply is being generated. */
    generating(): string[] {
      return [...running.keys()]
    },
  }
}

export type ChatService = ReturnType<typeof createChatService>
