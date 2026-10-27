import { createHash, randomUUID } from 'node:crypto'
import { z, ZodError } from 'zod'
import { ExperimentDesignSchema, HarnessModelConnectionCheckResultSchema } from '../../shared/contract.js'
import type {
  CallFailure, ChatAnswerModel, ExperimentDesign, HarnessCliModel, HarnessModelConnectionCheckResult,
} from '../../shared/contract.js'
import { CallError } from '../call-error.js'
import type { CoreLogLevel } from '../core-log.js'
import { extractPdfPages } from '../paper-library/index.js'
import { designSections } from '../research-ideas/index.js'
import type { VaultStore } from '../vault.js'
import { CLI_CALL_TIMEOUT_MS, CLI_REQUEST_TIMEOUT_MS, cliCallError, cliUsageLine } from './cli-call.js'
import type { CliChatSessions } from './cli/chat-sessions.js'
import type { CliChatResult, CliChatRunner } from './cli/chat-turn.js'
import { CliRunError } from './cli/child.js'
import { CLI_CALL_FAILURES } from './cli/failure.js'
import type { CliResult, CliRunner, CliUsage } from './cli/runner.js'
import { apiRunLimits } from './cost-gate.js'
import type { HarnessModelConfig, ModelChoice } from './model-config.js'
import { citablePages } from './paper-wiki.js'
import { launchHarnessProcess } from './process.js'
import { createHarnessRpc, type HarnessCallback, type HarnessChild, HarnessRpcError } from './rpc.js'

const MAX_MODEL_CONNECTION_DETAIL = 500
const MAX_ANSWER_TOKENS = 2_000
const MAX_DESIGN_TOKENS = 4_000
const MODEL_CONNECTION_REDACTIONS = [
  /(\b(?:authorization|proxy-authorization)\b\s*[:=]\s*)(?:bearer\s+)?(?:['"]?)(?!\[redacted\])[^\s,'"}\]]+/gi,
  /(\b(?:api[-_ ]?key|x-api-key|access[-_ ]?token|secret)\b\s*[:=]\s*)(?:bearer\s+)?(?:['"]?)(?!\[redacted\])[^\s,'"}\]]+/gi,
  /([?&](?:api[-_]?key|key|token|access_token|secret)=)(?!\[redacted\])[^&#\s]+/gi,
] as const
const MODEL_CONNECTION_TOKEN = /\b(?:sk-[A-Za-z0-9_-]{8,}|AIza[A-Za-z0-9_-]{20,})\b/g

const ChatContextParamsSchema = z.object({
  id: z.string().min(1),
  currentText: z.string().min(1).max(20_000),
}).strict()
const ChatAnswerSchema = z.object({ answer: z.string().trim().min(1).max(20_000) }).strict()
const ChatDesignAnswerSchema = z.object({
  answer: z.string().trim().min(1).max(2_000), design: ExperimentDesignSchema.nullable(),
}).strict()
/** How many mentioned Wiki pages, and claims of them, a design turn's context holds. */
const DESIGN_WIKI_PAGES = 5
const DESIGN_WIKI_CLAIMS = 40
const DESIGN_CLAIM_CHARACTERS = 1_000
/** The model IDs a provider's model-list call answered with, as Harness hands them over. */
const ModelListSchema = z.object({ models: z.array(z.string().trim().min(1).max(200)).max(1_000) }).strict()
/** How long one model-list read may take, Harness's own provider timeout included. */
const MODEL_LIST_TIMEOUT_MS = 30_000
/** How a model-list read's provider failure, as Harness classified it, reads as a call failure. */
const MODEL_LIST_FAILURES: Record<string, CallFailure> = {
  rate_limit: 'rate-limit', timeout: 'timeout', provider_http: 'server', authentication: 'model',
}

/** Why a model-list read failed, from the Harness error `cause`. */
const modelListFailure = (cause: unknown): CallFailure => {
  if (!(cause instanceof HarnessRpcError)) return 'unknown'
  if (cause.kind === 'no_model') return 'no-model'
  if (cause.kind === 'model_error') return MODEL_LIST_FAILURES[String(cause.detail)] ?? 'unavailable'
  return cause.kind === 'harness_gone' ? 'unavailable' : 'unknown'
}
/** A chat turn's model call: the whole turn as `system` and `prompt`, and the new message alone. */
const ChatModelInvokeParamsSchema = z.object({
  system: z.string().min(1).max(500_000),
  prompt: z.string().min(1).max(200_000),
  message: z.string().min(1).max(20_000),
}).strict()
/** A design turn's model call: the whole turn as `system` and `prompt`, and the JSON Schema of its output. */
const DesignModelInvokeParamsSchema = z.object({
  system: z.string().min(1).max(500_000),
  prompt: z.string().min(1).max(200_000),
  schema: z.record(z.string(), z.unknown()),
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

/** The text of a message as the model reads it again: its runs, then the sections of the design an answer carries. */
const messageText = (message: StoredChatMessage) => {
  const text = message.runs.map((run) => run.text).join('').trim()
  return message.design === undefined ? text : `${text}\n\n${designSections(message.design)}`
}

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

/** `value` with every key, token and credential it shows, and every one of `secrets`, replaced by `[redacted]`. */
export function redactSecrets(value: string, secrets: readonly string[] = []): string {
  let detail = value
  for (const pattern of MODEL_CONNECTION_REDACTIONS) detail = detail.replace(pattern, '$1[redacted]')
  detail = detail.replace(MODEL_CONNECTION_TOKEN, '[redacted]')
  for (const secret of secrets) {
    if (secret !== '') detail = detail.split(secret).join('[redacted]')
  }
  return detail
}

/** Keep diagnostics useful while preventing a provider or client from echoing credentials. */
export function sanitizeModelConnectionDetail(value: string, secrets: readonly string[] = []): string {
  const detail = redactSecrets(value, secrets).replace(/\s+/g, ' ').trim()
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
      : cause instanceof HarnessRpcError && cause.kind === 'no_model'
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
  if (cause instanceof ZodError) return new ChatFailure('模型的回答读不出来', { cause })
  if (!(cause instanceof HarnessRpcError)) {
    return cause instanceof Error ? cause : new Error(String(cause))
  }
  if (cause.kind === 'cancelled') return new ChatFailure('已停止生成', { cause })
  if (cause.kind === 'harness_gone') return new ChatFailure('AI 服务停了', { cause })
  if (cause.kind === 'bad_request') return new ChatFailure('AI 服务内部出错', { cause })
  if (cause.kind === 'no_model') return new ChatFailure('还没有连上模型', { cause })
  if (cause.kind === 'model_error' && cause.detail === 'structured_output') {
    return new CallError('malformed-output', cause.message, { cause })
  }
  // The Harness words a model's own failure plainly and safely (ModelInvocationError).
  if (cause.kind === 'model_error') return new ChatFailure(cause.message, { cause })
  return new ChatFailure('AI 服务出了错', { cause })
}

/**
 * A single-purpose chat client with a least-privilege callback surface. A turn runs on the model its
 * chat chose, as `choiceOf` gives it, or on the default. A turn on a subscription CLI also gets its
 * one model call from Core, which `cli` runs in the chat's CLI session that `sessions` keeps, with the
 * internal MCP server's vault lookups, scoped to the chat's paper in a paper chat; a turn whose CLI
 * call fails fails for the CLI problem it met.
 */
export function createChatHarnessRunner(options: {
  store: VaultStore
  model: HarnessModelConfig
  /** The model chat `chatId` chose, or null when it chose none; every chat runs the default without it. */
  choiceOf?: (chatId: string) => ModelChoice | null
  /** The connection check of a subscription CLI's model, which makes one model call once the CLI is ready. */
  checkCli: (model: HarnessCliModel) => Promise<HarnessModelConnectionCheckResult>
  cli: CliChatRunner
  /** The one-call structured runner a design turn on a subscription CLI runs on, outside the chat's session. */
  structured: CliRunner
  sessions: CliChatSessions
  launch?: () => HarnessChild
  onLog?: (level: CoreLogLevel, line: string) => void
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

  /** The chats whose running turn is a design turn. */
  const designing = new Set<string>()

  /**
   * The claims of the aggregation pages chat `chatId` mentioned, the latest mentioned first, at most
   * DESIGN_WIKI_PAGES pages and DESIGN_WIKI_CLAIMS claims, each with its ref and its page's title.
   */
  const mentionedClaims = async (chatId: string) => {
    const cards = new Map(options.store.wikiCards().map((card) => [card.id, card]))
    const pages = [...new Set(options.store.chatMessages(chatId).flatMap((message) => message.runs)
      .flatMap((run) => (run.target?.kind === 'page' && cards.has(run.target.id) ? [run.target.id] : []))
      .reverse())].slice(0, DESIGN_WIKI_PAGES)
    const claims: Array<{ ref: string; page: string; text: string }> = []
    for (const id of pages) {
      const page = await options.store.wikiAggregation(id)
      for (const claim of page.claims) {
        claims.push({ ref: `${id}#${claim.id}`, page: page.title, text: clipMiddle(claim.text, DESIGN_CLAIM_CHARACTERS) })
      }
    }
    return claims.slice(0, DESIGN_WIKI_CLAIMS)
  }

  /**
   * Throws a malformed-output CallError unless every anchor of `design` names what chat `chatId`'s
   * vault holds: a Wiki page or a paper's page, and a claim on that page, or a page of the chat's paper.
   */
  const checkAnchors = async (chatId: string, design: ExperimentDesign) => {
    const cards = new Set(options.store.wikiCards().map((card) => card.id))
    const paperId = options.store.chatSession(chatId).paperId
    for (const { anchor } of design.ledger) {
      if (anchor === null) continue
      const held = anchor.kind === 'source' ? anchor.paper === paperId : await (async () => {
        const [page, claim] = anchor.ref.split('#') as [string, string | undefined]
        if (page.startsWith('papers/')) return claim === undefined && options.store.hasPaper(page.slice('papers/'.length))
        if (!cards.has(page)) return false
        return claim === undefined || (await options.store.wikiAggregation(page)).claims.some((held) => held.id === claim)
      })()
      if (!held) throw new CallError('malformed-output', '模型的实验设计引用了库里没有的锚点')
    }
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
        const wiki = designing.has(id) ? { wiki: await mentionedClaims(id) } : {}
        if (session.paperId === undefined) return { title: session.title, history, ...wiki }
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
          ...wiki,
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
      options.onLog?.('info', cliUsageLine(model.cli, usage === undefined ? result : { ...result, usage }))
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

  /**
   * The one structured model call of a design turn of chat `chatId` on `model`, ending when `signal`
   * aborts, with the vault lookups a turn of that chat has, outside the chat's CLI session; a CLI
   * failure goes to `onFailure`.
   */
  const cliDesign = (
    chatId: string, model: HarnessCliModel, signal: AbortSignal, onFailure: (failure: CliRunError) => void,
  ): HarnessCallback => {
    let called = false
    return async (params) => {
      if (called) throw new HarnessRpcError({ kind: 'bad_request', message: 'A run makes one model call' })
      called = true
      const call = DesignModelInvokeParamsSchema.parse(params)
      const paperId = options.store.chatSession(chatId).paperId
      let result: CliResult
      try {
        result = await options.structured({
          cli: model.cli,
          ...(model.model === undefined ? {} : { model: model.model }),
          ...(model.effort === undefined ? {} : { effort: model.effort }),
          ...call,
          lookup: paperId === undefined ? {} : { paperId },
          timeoutMs: CLI_CALL_TIMEOUT_MS,
          signal,
        })
      } catch (cause) {
        if (cause instanceof CliRunError) onFailure(cause)
        throw cliCallError(model.cli, cause, options.onLog)
      }
      options.onLog?.('info', cliUsageLine(model.cli, result))
      return { output: result.output }
    }
  }

  return {
    /** Checks configured source `id` at its own model, or the default source without one, at its provider's or CLI's own default effort. */
    async checkConnection(id?: string) {
      let model
      try {
        model = await options.model.runtime(id === undefined ? undefined : { source: id })
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
     * The model IDs API source `id` lists, as its provider's own model-list call answers with the
     * source's key, which makes no model call. Throws a CallError: `no-model` for a source that is
     * not set up to run, and why the provider's call failed otherwise.
     */
    async listModels(id: string): Promise<string[]> {
      const model = await options.model.runtime({ source: id })
      if ('source' in model) throw new CallError('invalid', '订阅的模型不从 API 读')
      try {
        return ModelListSchema.parse(await rpc.request('model.list', { model }, { timeoutMs: MODEL_LIST_TIMEOUT_MS })).models
      } catch (cause) {
        throw new CallError(modelListFailure(cause), '模型列表读不出来', { cause })
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
        const model = await options.model.runtime(options.choiceOf?.(id))
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
    /**
     * Asks Harness to answer design turn `text` in chat `id` until `signal` aborts, with the claims of
     * the Wiki pages the chat mentioned in its context and an output cap of MAX_DESIGN_TOKENS on an API
     * model; on a subscription CLI the turn is one structured call outside the chat's session.
     * `progress` hears the model writing it. Returns the answer and its design, null when the model
     * found nothing to test; rejects with a malformed-output CallError when the design anchors what the
     * vault does not hold, and otherwise as `answer` does.
     */
    async design(id: string, text: string, signal: AbortSignal, progress?: ChatProgress): Promise<{ answer: string; design: ExperimentDesign | null }> {
      const ended = new AbortController()
      let failure: CliRunError | undefined
      designing.add(id)
      try {
        const model = await options.model.runtime(options.choiceOf?.(id))
        progress?.onModel('source' in model
          ? { route: 'subscription', cli: model.cli, ...(model.model === undefined ? {} : { id: model.model }) }
          : { route: 'api', id: model.model })
        const { maxOutputTokens, timeoutSeconds, requestTimeoutMs } = apiRunLimits('source' in model ? undefined : model.effort, MAX_DESIGN_TOKENS)
        const result = ChatDesignAnswerSchema.parse(await rpc.request('chat.answer', {
          chatId: id,
          text,
          design: true,
          model,
          limits: { maxOutputTokens, maxModelCalls: 1, timeoutSeconds },
        }, {
          signal,
          ...('source' in model ? {
            timeoutMs: CLI_REQUEST_TIMEOUT_MS,
            callbacks: { 'model.invoke': cliDesign(id, model, AbortSignal.any([signal, ended.signal]), (cause) => { failure = cause }) },
          } : { timeoutMs: requestTimeoutMs }),
        }))
        if (result.design !== null) await checkAnchors(id, result.design)
        return result
      } catch (cause) {
        throw failure === undefined
          ? chatHarnessError(cause)
          : new CallError(CLI_CALL_FAILURES[failure.kind], failure.message, { cause: failure })
      } finally {
        designing.delete(id)
        ended.abort()
      }
    },
    close: rpc.close,
  }
}

export type ChatHarnessRunner = ReturnType<typeof createChatHarnessRunner>
