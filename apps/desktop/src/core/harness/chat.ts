import { z } from 'zod'
import { HarnessModelConnectionCheckResultSchema } from '../../shared/contract.js'
import { extractPdfPages } from '../paper-library/index.js'
import type { VaultStore } from '../vault.js'
import type { HarnessModelConfig } from './model-config.js'
import { launchHarnessProcess } from './process.js'
import { createHarnessRpc, HarnessRpcError } from './rpc.js'

const MAX_MODEL_CONNECTION_DETAIL = 500
const MODEL_CONNECTION_REDACTIONS = [
  /(\b(?:authorization|proxy-authorization)\b\s*[:=]\s*)(?:bearer\s+)?(?:['"]?)[^\s,'"}\]]+/gi,
  /(\b(?:api[-_ ]?key|x-api-key|access[-_ ]?token|secret)\b\s*[:=]\s*)(?:bearer\s+)?(?:['"]?)[^\s,'"}\]]+/gi,
  /([?&](?:api[-_]?key|key|token|access_token|secret)=)[^&#\s]+/gi,
] as const
const MODEL_CONNECTION_TOKEN = /\b(?:sk-[A-Za-z0-9_-]{8,}|AIza[A-Za-z0-9_-]{20,})\b/g

const ChatContextParamsSchema = z.object({
  id: z.string().min(1),
  currentText: z.string().min(1).max(20_000),
}).strict()
const ChatAnswerSchema = z.object({ answer: z.string().trim().min(1).max(20_000) }).strict()
export const CHAT_CONTEXT_BUDGETS = Object.freeze({
  sourceCharacters: 80_000,
  historyCharacters: 12_000,
  historyTurns: 20,
  readingCharacters: 12_000,
  readingRemarkCharacters: 4_000,
  readingItemCharacters: 3_000,
  abstractCharacters: 8_000,
  authors: 50,
  authorCharacters: 200,
})

type StoredChatMessage = ReturnType<VaultStore['chatMessages']>[number]
type StoredPaperReading = ReturnType<VaultStore['paperReading']>

const messageText = (message: StoredChatMessage) =>
  message.runs.map((run) => run.text).join(' ').trim()

function clipMiddle(value: string, limit: number): string {
  const text = value.trim()
  if (text.length <= limit) return text
  if (limit <= 1) return limit === 1 ? '…' : ''
  const head = Math.ceil((limit - 1) / 2)
  return `${text.slice(0, head)}…${text.slice(-(limit - head - 1))}`
}

function clipTail(value: string, limit: number): string {
  const text = value.trim()
  if (text.length <= limit) return text
  if (limit <= 1) return limit === 1 ? '…' : ''
  return `…${text.slice(-(limit - 1))}`
}

/** Keep diagnostics useful while preventing a provider or client from echoing credentials. */
export function sanitizeModelConnectionDetail(value: string, secrets: readonly string[] = []): string {
  let detail = value
  for (const pattern of MODEL_CONNECTION_REDACTIONS) detail = detail.replace(pattern, '$1[redacted]')
  detail = detail.replace(MODEL_CONNECTION_TOKEN, '[redacted]')
  for (const secret of secrets) {
    if (secret !== '') detail = detail.split(secret).join('[redacted]')
  }
  detail = detail.replace(/\s+/g, ' ').trim()
  if (detail.length > MAX_MODEL_CONNECTION_DETAIL) {
    return `${detail.slice(0, MAX_MODEL_CONNECTION_DETAIL - 1).trimEnd()}…`
  }
  return detail
}

function failedConnectionCheck(
  cause: unknown,
  secrets: readonly string[],
  modelCalls: 0 | 1,
) {
  const rpcDetail = cause instanceof HarnessRpcError && typeof cause.detail === 'string'
    ? cause.detail : undefined
  const rawDetail = rpcDetail ?? (cause instanceof Error ? cause.message : String(cause))
  const detail = sanitizeModelConnectionDetail(rawDetail, secrets)
  const timeout = /timed?\s*out|timeout/i.test(rawDetail)
  const reason = timeout
    ? 'timeout' as const
    : cause instanceof HarnessRpcError && cause.kind === 'harness_gone'
      ? 'unavailable' as const
      : cause instanceof HarnessRpcError && ['bad_request', 'no_model'].includes(cause.kind)
        ? 'configuration' as const
        : 'unknown' as const
  return {
    state: 'failed' as const,
    reason,
    detail: detail || 'No diagnostic message was returned.',
    modelCalls,
    maxOutputTokens: 1 as const,
  }
}

/** Preserve the newest whole turns and a bounded tail of the oldest included turn. */
export function packChatHistory(messages: readonly StoredChatMessage[]) {
  const history: Array<{ role: 'user' | 'assistant'; text: string }> = []
  let remaining = CHAT_CONTEXT_BUDGETS.historyCharacters
  for (let index = messages.length - 1; index >= 0
    && history.length < CHAT_CONTEXT_BUDGETS.historyTurns && remaining > 0; index -= 1) {
    const message = messages[index]!
    if (message.role === 'status') continue
    const text = clipTail(messageText(message), remaining)
    if (text === '') continue
    history.unshift({ role: message.role === 'you' ? 'user' : 'assistant', text })
    remaining -= text.length
  }
  return history
}

/** Prioritize the user's paper-wide remark and authored notes within one deterministic budget. */
export function packPaperReading(reading: StoredPaperReading) {
  let remaining = CHAT_CONTEXT_BUDGETS.readingCharacters
  const remark = clipMiddle(
    reading.remark,
    Math.min(remaining, CHAT_CONTEXT_BUDGETS.readingRemarkCharacters),
  )
  remaining -= remark.length

  const notes: Array<{ page: number; text: string }> = []
  for (let index = reading.notes.length - 1; index >= 0 && remaining > 0; index -= 1) {
    const note = reading.notes[index]!
    const text = clipMiddle(
      note.text,
      Math.min(remaining, CHAT_CONTEXT_BUDGETS.readingItemCharacters),
    )
    if (text === '') continue
    notes.unshift({ page: note.page, text })
    remaining -= text.length
  }

  const highlights: Array<{ page: number; quote: string; note: string }> = []
  const orderedHighlights = [
    ...reading.highlights.filter((item) => item.note.trim() === ''),
    ...reading.highlights.filter((item) => item.note.trim() !== ''),
  ]
  for (let index = orderedHighlights.length - 1; index >= 0 && remaining > 0; index -= 1) {
    const highlight = orderedHighlights[index]!
    const itemBudget = Math.min(remaining, CHAT_CONTEXT_BUDGETS.readingItemCharacters)
    const quoteLimit = Math.min(itemBudget, Math.ceil(itemBudget / 2))
    const quote = clipMiddle(highlight.quote, quoteLimit)
    const note = clipMiddle(highlight.note, itemBudget - quote.length)
    if (quote === '' && note === '') continue
    highlights.unshift({ page: highlight.page, quote, note })
    remaining -= quote.length + note.length
  }
  return { highlights, notes, remark }
}

/** Convert Harness failures into stable UI copy without exposing provider response bodies. */
function chatHarnessError(cause: unknown): Error {
  if (!(cause instanceof HarnessRpcError)) {
    return cause instanceof Error ? cause : new Error(String(cause))
  }
  if (cause.kind === 'cancelled') return new Error('已停止生成')
  if (cause.kind === 'harness_gone') return new Error('AI 服务已停止，请重新发送')
  if (cause.kind === 'bad_request') return new Error('对话上下文过大或请求格式不受支持')
  return cause
}

/** A single-purpose chat client with a least-privilege callback surface. */
export function createChatHarnessRunner(options: {
  store: VaultStore
  model: HarnessModelConfig
  onLog?: (line: string) => void
}) {
  const sourceText = new Map<string, Promise<Array<{ number: number; text: string }>>>()
  const paperPages = (paperId: string) => {
    const cached = sourceText.get(paperId)
    if (cached !== undefined) return cached
    const created = Promise.resolve().then(async () => {
      const source = options.store.paperSource(paperId)
      const pages = await extractPdfPages(source)
      let remaining = CHAT_CONTEXT_BUDGETS.sourceCharacters
      return pages.flatMap((page) => {
        if (remaining <= 0) return []
        const text = page.text.slice(0, remaining)
        remaining -= text.length
        return text === '' ? [] : [{ number: page.number, text }]
      })
    })
    sourceText.set(paperId, created)
    return created
  }

  const rpc = createHarnessRpc({
    launch: launchHarnessProcess,
    requiredCapabilities: ['chat', 'model-check'],
    ...(options.onLog === undefined ? {} : { onLog: options.onLog }),
    callbacks: {
      'chat.context': async (params) => {
        const { id, currentText } = ChatContextParamsSchema.parse(params)
        const session = options.store.chatSession(id)
        const storedMessages = options.store.chatMessages(id)
        const last = storedMessages.at(-1)
        const priorMessages = last?.role === 'you' && messageText(last) === currentText
          ? storedMessages.slice(0, -1)
          : storedMessages
        const history = packChatHistory(priorMessages)
        if (session.paperId === undefined) return { title: session.title, history }
        const paper = options.store.getPaper(session.paperId)
        const reading = options.store.paperReading(session.paperId)
        let pages: Array<{ number: number; text: string }> = []
        try {
          pages = await paperPages(session.paperId)
        } catch {
          // Metadata and personal reading state remain useful when the source PDF is unavailable.
        }
        return {
          title: session.title,
          history,
          paper: {
            id: paper.id,
            title: paper.title,
            authors: (paper.authors ?? [])
              .slice(0, CHAT_CONTEXT_BUDGETS.authors)
              .map((author) => clipMiddle(author, CHAT_CONTEXT_BUDGETS.authorCharacters)),
            ...(paper.year === undefined ? {} : { year: paper.year }),
            ...(paper.abstract === undefined ? {} : {
              abstract: clipMiddle(paper.abstract, CHAT_CONTEXT_BUDGETS.abstractCharacters),
            }),
            pages,
            reading: packPaperReading(reading),
          },
        }
      },
    },
  })

  return {
    async checkConnection() {
      let model
      try {
        model = await options.model.runtime()
      } catch (cause) {
        return failedConnectionCheck(cause, [], 0)
      }
      const secrets = model.apiKey === undefined ? [] : [model.apiKey]
      try {
        const result = HarnessModelConnectionCheckResultSchema.parse(await rpc.request('model.check', {
          model,
        }))
        return result.state === 'connected'
          ? result
          : { ...result, detail: sanitizeModelConnectionDetail(result.detail, secrets) }
      } catch (cause) {
        const modelCalls = cause instanceof HarnessRpcError
          && ['harness_gone', 'bad_request', 'no_model'].includes(cause.kind) ? 0 : 1
        return failedConnectionCheck(cause, secrets, modelCalls)
      }
    },
    async answer(id: string, text: string, signal: AbortSignal): Promise<string> {
      try {
        const result = ChatAnswerSchema.parse(await rpc.request('chat.answer', {
          chatId: id,
          text,
          model: await options.model.runtime(),
          limits: { maxOutputTokens: 2_000, maxModelCalls: 1 },
        }, { signal }))
        return result.answer
      } catch (cause) {
        throw chatHarnessError(cause)
      }
    },
    close: rpc.close,
  }
}

export type ChatHarnessRunner = ReturnType<typeof createChatHarnessRunner>
