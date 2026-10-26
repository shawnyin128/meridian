import { createHash, randomUUID } from 'node:crypto'
import { z, ZodError } from 'zod'
import { HarnessModelConnectionCheckResultSchema } from '../../shared/contract.js'
import type {
  ChatAnswerModel, HarnessCliModel, HarnessModelConnectionCheckResult,
} from '../../shared/contract.js'
import { CallError } from '../call-error.js'
import { extractPdfPages } from '../paper-library/index.js'
import type { VaultStore } from '../vault.js'
import { CLI_CALL_TIMEOUT_MS, CLI_REQUEST_TIMEOUT_MS, cliCallError, cliUsageLine } from './cli-call.js'
import type { CliChatSessions } from './cli/chat-sessions.js'
import type { CliChatResult, CliChatRunner } from './cli/chat-turn.js'
import { CliRunError } from './cli/child.js'
import { CLI_CALL_FAILURES } from './cli/failure.js'
import type { CliUsage } from './cli/runner.js'
import { apiRunLimits } from './cost-gate.js'
import type { HarnessModelConfig } from './model-config.js'
import { citablePages } from './paper-wiki.js'
import { launchHarnessProcess } from './process.js'
import { createHarnessRpc, type HarnessCallback, type HarnessChild, HarnessRpcError } from './rpc.js'

const MAX_MODEL_CONNECTION_DETAIL = 500
const MAX_ANSWER_TOKENS = 2_000
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
/** A chat turn's model call: the whole turn as `system` and `prompt`, and the new message alone. */
const ChatModelInvokeParamsSchema = z.object({
  system: z.string().min(1).max(500_000),
  prompt: z.string().min(1).max(200_000),
  message: z.string().min(1).max(20_000),
}).strict()
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
  message.runs.map((run) => run.text).join('').trim()

type Turn = { role: 'you' | 'ai'; text: string }
/** What a CLI session of a chat holds of `messages`: what was said and answered, without the status lines. */
const turnsOf = (messages: readonly StoredChatMessage[]): Turn[] =>
  messages.flatMap((message) => (message.role === 'status' ? [] : [{ role: message.role, text: messageText(message) }]))
/** A fingerprint of `turns`, which tells whether a CLI session holds the turns a chat holds now. */
const turnsDigest = (turns: readonly Turn[]) =>
  createHash('sha256').update(JSON.stringify(turns.map((turn) => [turn.role, turn.text]))).digest('hex')
/** The usage between two running totals a Codex session reported. */
const usageSince = (total: CliUsage, before: CliUsage): CliUsage => ({
  inputTokens: total.inputTokens - before.inputTokens,
  cachedInputTokens: total.cachedInputTokens - before.cachedInputTokens,
  outputTokens: total.outputTokens - before.outputTokens,
})

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

/**
 * The messages of a chat that come before the question `currentText` being answered: all of them but
 * the last one said, when that one asks `currentText`. A status line after it, which a turn retried
 * after a failure has, does not count as said.
 */
export function messagesBefore(messages: readonly StoredChatMessage[], currentText: string): StoredChatMessage[] {
  const at = messages.findLastIndex((message) => message.role !== 'status')
  const last = messages[at]
  return last?.role === 'you' && messageText(last) === currentText
    ? messages.filter((_, index) => index !== at)
    : [...messages]
}

/** What a chat turn tells while it runs: the model writing its answer, as soon as it is known and whenever it is known better, and the answer as far as it is written. */
export type ChatProgress = { onModel: (model: ChatAnswerModel) => void; onText: (text: string) => void }

/** A chat turn that got no answer, its message what happened in plain words, as the chat's status line says it. */
export class ChatFailure extends Error {}

/**
 * What went wrong with a chat turn, as a ChatFailure in plain words, or as a malformed-output
 * CallError when the answer failed validation: the text of a provider's response or of a parser never
 * reaches it. An error from outside the Harness call, such as an unreadable key, is returned as it is.
 */
export function chatHarnessError(cause: unknown): Error {
  if (cause instanceof ZodError) return new ChatFailure('模型的回答读不出来')
  if (!(cause instanceof HarnessRpcError)) {
    return cause instanceof Error ? cause : new Error(String(cause))
  }
  if (cause.kind === 'cancelled') return new ChatFailure('已停止生成')
  if (cause.kind === 'harness_gone') return new ChatFailure('AI 服务停了')
  if (cause.kind === 'bad_request') return new ChatFailure('对话太长，或这次请求模型不支持')
  if (cause.kind === 'no_model') return new ChatFailure('还没有连上模型')
  if (cause.kind === 'model_error' && cause.detail === 'structured_output') {
    return new CallError('malformed-output', cause.message, { cause })
  }
  // The Harness words a model's own failure plainly and safely (ModelInvocationError).
  if (cause.kind === 'model_error') return new ChatFailure(cause.message)
  return new ChatFailure('AI 服务出了错')
}

/**
 * A single-purpose chat client with a least-privilege callback surface. A turn on a subscription CLI
 * also gets its one model call from Core, which `cli` runs in the chat's CLI session that `sessions`
 * keeps, with the internal MCP server's vault lookups, scoped to the chat's paper in a paper chat; a
 * turn whose CLI call fails fails for the CLI problem it met.
 */
export function createChatHarnessRunner(options: {
  store: VaultStore
  model: HarnessModelConfig
  /** The connection check of a subscription CLI's model, which makes one model call once the CLI is ready. */
  checkCli: (model: HarnessCliModel) => Promise<HarnessModelConnectionCheckResult>
  cli: CliChatRunner
  sessions: CliChatSessions
  launch?: () => HarnessChild
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
    launch: options.launch ?? launchHarnessProcess,
    requiredCapabilities: ['chat', 'model-check'],
    ...(options.onLog === undefined ? {} : { onLog: options.onLog }),
    callbacks: {
      'chat.context': async (params) => {
        const { id, currentText } = ChatContextParamsSchema.parse(params)
        const session = options.store.chatSession(id)
        const history = packChatHistory(messagesBefore(options.store.chatMessages(id), currentText))
        if (session.paperId === undefined) return { title: session.title, history }
        const paper = options.store.getPaper(session.paperId)
        const reading = options.store.paperReading(session.paperId)
        let pages: Array<{ number: number; text: string }> = []
        let pageCount = paper.pageCount
        try {
          const paperId = session.paperId
          pages = await paperPages(paperId)
          pageCount = await citablePages(paper, () => options.store.paperSource(paperId))
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
            pageCount,
            reading: packPaperReading(reading),
          },
        }
      },
    },
  })

  /**
   * The one model call of a turn of chat `chatId` that answers `text` on `model`, ending when
   * `signal` aborts, telling `progress` the model the CLI names and the answer as far as it has
   * written it, and reporting a CLI failure to `onFailure`. It resumes the chat's CLI session, with the new message alone, while that
   * session holds the turns the chat holds; otherwise it starts a new session with the whole turn.
   * `keep` makes the session resumable once the turn's `answer` is kept.
   */
  const cliTurn = (
    chatId: string, text: string, model: HarnessCliModel, signal: AbortSignal,
    onFailure: (failure: CliRunError) => void, progress?: ChatProgress,
  ) => {
    let reported: string | undefined
    const named = (id: string) => {
      if (id === reported) return
      reported = id
      progress?.onModel({ route: 'subscription', cli: model.cli, id })
    }
    const before = turnsOf(messagesBefore(options.store.chatMessages(chatId), text))
    let called = false
    let ran: { id: string; total?: CliUsage } | null = null
    const call: HarnessCallback = async (params) => {
      if (called) throw new HarnessRpcError({ kind: 'bad_request', message: 'A run makes one model call' })
      called = true
      const { system, prompt, message } = ChatModelInvokeParamsSchema.parse(params)
      const paperId = options.store.chatSession(chatId).paperId
      const resumed = options.sessions.resumable(chatId, model, turnsDigest(before))
      const start = resumed === null && model.cli === 'claude' ? randomUUID() : undefined
      let id = resumed?.id ?? start
      // Until its answer is kept, the session holds a turn the chat may never hold.
      options.sessions.begin(chatId, model.cli, id)
      let result: CliChatResult
      try {
        result = await options.cli({
          cli: model.cli,
          ...(model.model === undefined ? {} : { model: model.model }),
          ...(model.effort === undefined ? {} : { effort: model.effort }),
          system,
          prompt: resumed === null ? prompt : message,
          session: resumed !== null ? { resume: resumed.id } : start === undefined ? {} : { start },
          folder: options.sessions.folder(chatId),
          lookup: paperId === undefined ? {} : { paperId },
          timeoutMs: CLI_CALL_TIMEOUT_MS,
          signal,
          onSession: (named) => {
            id = named
            options.sessions.started(chatId, model.cli, named)
          },
          ...(progress === undefined ? {} : { onText: progress.onText, onModel: named }),
        })
      } catch (cause) {
        if (cause instanceof CliRunError) onFailure(cause)
        throw cliCallError(model.cli, cause, options.onLog)
      }
      // Codex reports a session's running total, so a resumed turn's own usage is the difference.
      const total = model.cli === 'codex' ? result.usage : undefined
      const usage = total !== undefined && resumed?.total !== undefined ? usageSince(total, resumed.total) : result.usage
      options.onLog?.(cliUsageLine(model.cli, usage === undefined ? result : { ...result, usage }))
      if (id !== undefined) ran = { id, ...(total === undefined ? {} : { total }) }
      const fromCli = result.model ?? (model.cli === 'codex' && id !== undefined ? options.sessions.codexModel(id) : null)
      if (fromCli !== null) named(fromCli)
      return { output: result.answer }
    }
    const keep = (answer: string) => {
      if (ran === null) return
      options.sessions.keep(chatId, {
        cli: model.cli,
        id: ran.id,
        ...(model.model === undefined ? {} : { model: model.model }),
        history: turnsDigest([...before, { role: 'you', text: text.trim() }, { role: 'ai', text: answer }]),
        ...(ran.total === undefined ? {} : { total: ran.total }),
      })
    }
    return { call, keep }
  }

  return {
    async checkConnection() {
      let model
      try {
        model = await options.model.runtime()
      } catch (cause) {
        return failedConnectionCheck(cause, [], 0)
      }
      if ('source' in model) return options.checkCli(model)
      const secrets = model.apiKey === undefined ? [] : [model.apiKey]
      // The check runs at the provider's own default effort.
      const checked = { ...model }
      delete checked.effort
      try {
        const result = HarnessModelConnectionCheckResultSchema.parse(await rpc.request('model.check', {
          model: checked,
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
    /**
     * Asks Harness to answer `text` in chat `id` until `signal` aborts. `progress` hears the model
     * writing the answer at once, as configured, and again when a CLI names its own; a model that
     * streams its answer also tells it the answer as far as it is written.
     */
    async answer(id: string, text: string, signal: AbortSignal, progress?: ChatProgress): Promise<string> {
      const ended = new AbortController()
      let failure: CliRunError | undefined
      try {
        const model = await options.model.runtime()
        progress?.onModel('source' in model
          ? { route: 'subscription', cli: model.cli, ...(model.model === undefined ? {} : { id: model.model }) }
          : { route: 'api', id: model.model })
        const turn = 'source' in model
          ? cliTurn(id, text, model, AbortSignal.any([signal, ended.signal]), (cause) => { failure = cause }, progress)
          : null
        const { maxOutputTokens, timeoutSeconds, requestTimeoutMs } = apiRunLimits('source' in model ? undefined : model.effort, MAX_ANSWER_TOKENS)
        const result = ChatAnswerSchema.parse(await rpc.request('chat.answer', {
          chatId: id,
          text,
          model,
          limits: { maxOutputTokens, maxModelCalls: 1, timeoutSeconds },
        }, {
          signal,
          ...(turn === null ? { timeoutMs: requestTimeoutMs } : {
            timeoutMs: CLI_REQUEST_TIMEOUT_MS,
            callbacks: { 'model.invoke': turn.call },
          }),
        }))
        turn?.keep(result.answer)
        return result.answer
      } catch (cause) {
        throw failure === undefined
          ? chatHarnessError(cause)
          : new CallError(CLI_CALL_FAILURES[failure.kind], failure.message, { cause: failure })
      } finally {
        ended.abort()
      }
    },
    close: rpc.close,
  }
}

export type ChatHarnessRunner = ReturnType<typeof createChatHarnessRunner>
