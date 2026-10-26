import { EventEmitter } from 'node:events'
import { chmodSync, existsSync, globSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { ChatMessage, PaperReading } from '../../shared/contract.js'
import { CallError } from '../call-error.js'
import { createFixtureStore } from '../fixture-store.js'
import type { VaultStore } from '../vault.js'
import {
  CHAT_CONTEXT_BUDGETS, ChatFailure, chatHarnessError, createChatHarnessRunner, messagesBefore, packChatHistory,
  packPaperReading,
} from './chat.js'
import { createChatService } from './chat-service.js'
import { type CliChatSessions, openCliChatSessions } from './cli/chat-sessions.js'
import { CliRunError } from './cli/child.js'
import { type CliChatCall, type CliChatRunner, createCliChatRunner } from './cli/chat-turn.js'
import type { HarnessModelConfig, HarnessRuntimeModel } from './model-config.js'
import { HARNESS_CAPABILITIES, HARNESS_PROTOCOL_VERSION } from './protocol.js'
import { type HarnessChild, HarnessRpcError } from './rpc.js'

function message(id: string, role: ChatMessage['role'], text: string): ChatMessage {
  return { id, role, runs: [{ kind: 'text', text }], actions: [] }
}

function reading(overrides: Partial<PaperReading> = {}): PaperReading {
  return {
    paperId: 'paper-1', highlights: [], notes: [], remark: '', ...overrides,
  }
}

describe('Harness chat context budgets', () => {
  it('keeps recent non-status turns in chronological order within one total budget', () => {
    const history = packChatHistory([
      message('old', 'you', `old-${'a'.repeat(CHAT_CONTEXT_BUDGETS.historyCharacters)}`),
      message('status', 'status', 'internal status'),
      message('recent', 'ai', 'recent answer'),
    ])

    expect(history.at(-1)).toEqual({ role: 'assistant', text: 'recent answer' })
    expect(history[0]?.text.startsWith('…')).toBe(true)
    expect(history.map((turn) => turn.text).join('').length)
      .toBe(CHAT_CONTEXT_BUDGETS.historyCharacters)
    expect(history.some((turn) => turn.text.includes('internal status'))).toBe(false)
  })

  it('packs a turn holding a mention as the sentence the user wrote', () => {
    expect(packChatHistory([{
      id: 'mention', role: 'you', actions: [],
      runs: [{ kind: 'text', text: '看看 ' }, { kind: 'mention', text: '@推测解码加速' }, { kind: 'text', text: ' 这条线还剩什么' }],
    }])).toEqual([{ role: 'user', text: '看看 @推测解码加速 这条线还剩什么' }])
  })

  it('caps turn count independently from the character budget', () => {
    const messages = Array.from({ length: 30 }, (_, index) => (
      message(String(index), index % 2 === 0 ? 'you' : 'ai', `turn-${index}`)
    ))

    const history = packChatHistory(messages)
    expect(history).toHaveLength(CHAT_CONTEXT_BUDGETS.historyTurns)
    expect(history[0]?.text).toBe('turn-10')
    expect(history.at(-1)?.text).toBe('turn-29')
  })

  it('prioritizes authored reading state without allowing one remark to consume the packet', () => {
    const packed = packPaperReading(reading({
      remark: 'r'.repeat(20_000),
      notes: [{
        id: 'note-1', page: 3, text: 'n'.repeat(20_000), created: '2026-09-18', updated: '2026-09-18',
      }],
      highlights: [{
        id: 'highlight-1', page: 4, quote: 'q'.repeat(10_000), note: 'insight',
        rects: [{ x: 0, y: 0, width: 0.1, height: 0.1 }], color: 'yellow',
        created: '2026-09-18', updated: '2026-09-18',
      }],
    }))
    const total = packed.remark.length
      + packed.notes.reduce((sum, item) => sum + item.text.length, 0)
      + packed.highlights.reduce((sum, item) => sum + item.quote.length + item.note.length, 0)

    expect(packed.remark).toContain('…')
    expect(packed.notes).toHaveLength(1)
    expect(packed.highlights).toHaveLength(1)
    expect(total).toBeLessThanOrEqual(CHAT_CONTEXT_BUDGETS.readingCharacters)
  })
})

describe('the question a chat turn answers', () => {
  it('leaves out of the history the question being answered, also when a retry finds it before a status line', () => {
    const asked = [message('1', 'you', '问'), message('2', 'ai', '答'), message('3', 'you', '再问')]
    expect(messagesBefore(asked, '再问').map((held) => held.id)).toEqual(['1', '2'])
    const failed = [...asked, message('4', 'status', '生成失败：AI 服务停了')]
    expect(messagesBefore(failed, '再问').map((held) => held.id)).toEqual(['1', '2', '4'])
    expect(messagesBefore(failed, '别的').map((held) => held.id)).toEqual(['1', '2', '3', '4'])
  })
})

describe('chat failures in plain words', () => {
  const said = (cause: unknown) => {
    const error = chatHarnessError(cause)
    return [error instanceof ChatFailure, error.message]
  }

  it('words each Harness failure plainly and keeps the Harness\'s own wording of a model failure', () => {
    const harness = (kind: 'bad_request' | 'no_model' | 'model_error' | 'cancelled' | 'harness_gone' | 'internal', text: string) =>
      new HarnessRpcError({ kind, message: text })
    expect(said(harness('model_error', '模型服务请求超时'))).toEqual([true, '模型服务请求超时'])
    expect(said(harness('harness_gone', 'Harness process is not available'))).toEqual([true, 'AI 服务停了'])
    expect(said(harness('internal', 'Traceback (most recent call last)'))).toEqual([true, 'AI 服务出了错'])
    expect(said(harness('bad_request', 'Harness callback is not allowed: x'))).toEqual([true, '对话太长，或这次请求模型不支持'])
  })

  it('fails an answer that failed validation as malformed output, in the Harness\'s words', () => {
    const invalid = chatHarnessError(new HarnessRpcError({
      kind: 'model_error', message: '模型输出包含无效页码引用', detail: 'structured_output',
    }))
    expect(invalid).toMatchObject({ name: 'CallError', reason: 'malformed-output', message: '模型输出包含无效页码引用' })
  })

  it('never passes on a parser\'s text, and leaves an error from outside the Harness call as it is', () => {
    const parsed = z.object({ answer: z.string().min(1) }).safeParse({ answer: '' })
    expect(said(parsed.error)).toEqual([true, '模型的回答读不出来'])
    const unreadable = new CallError('key-unreadable', '保存的 API Key 读不出来')
    expect(chatHarnessError(unreadable)).toBe(unreadable)
  })
})

describe('model connection check', () => {
  it('checks a subscription CLI\'s model with the CLI\'s own check, without the Harness', async () => {
    const checked: unknown[] = []
    const runner = createChatHarnessRunner({
      store: {} as VaultStore,
      model: { runtime: async () => ({ source: 'cli', cli: 'codex', model: 'gpt-6-luna' }) } as unknown as HarnessModelConfig,
      checkCli: async (model) => {
        checked.push(model)
        return { state: 'connected', modelCalls: 1 }
      },
      cli: vi.fn<CliChatRunner>(),
      sessions: {} as CliChatSessions,
    })

    await expect(runner.checkConnection()).resolves.toEqual({ state: 'connected', modelCalls: 1 })
    expect(checked).toEqual([{ source: 'cli', cli: 'codex', model: 'gpt-6-luna' }])
    runner.close()
  })

  it('checks an API model at the provider\'s own default effort, whatever effort its profile sets', async () => {
    const child = new FakeHarness()
    const model = {
      provider: 'openai', protocol: 'responses', baseUrl: 'https://api.openai.com/v1', model: 'gpt-6.1',
      authentication: 'api-key', apiKey: 'sk-test', effort: 'xhigh',
    }
    const runner = createChatHarnessRunner({
      store: {} as VaultStore,
      model: { runtime: async () => model } as unknown as HarnessModelConfig,
      checkCli: vi.fn(),
      cli: vi.fn<CliChatRunner>(),
      sessions: {} as CliChatSessions,
      launch: () => child,
    })

    const checking = runner.checkConnection()
    child.ready()
    const request = await child.frame()
    child.send({ type: 'response', id: request['id'], ok: true, result: { state: 'connected', modelCalls: 1, maxOutputTokens: 1 } })

    await expect(checking).resolves.toMatchObject({ state: 'connected' })
    expect(request).toMatchObject({ method: 'model.check', params: { model: { provider: 'openai', model: 'gpt-6.1' } } })
    expect((request['params'] as { model: object }).model).not.toHaveProperty('effort')
    runner.close()
  })
})

class FakeHarness extends EventEmitter implements HarnessChild {
  readonly stdin = new PassThrough()
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  readonly kill = vi.fn(() => true)

  send(message: object) {
    this.stdout.write(`${JSON.stringify(message)}\n`)
  }

  ready() {
    this.send({
      type: 'event', id: 0, event: 'ready',
      data: { protocol: HARNESS_PROTOCOL_VERSION, capabilities: [...HARNESS_CAPABILITIES] },
    })
  }

  frame(): Promise<Record<string, unknown>> {
    return new Promise((resolveFrame) => {
      this.stdin.once('data', (chunk: Buffer) => resolveFrame(JSON.parse(chunk.toString('utf8').trim())))
    })
  }

  callModel(callbackId: string, id = 1, params: object = {
    system: 'Chat rules and context', prompt: 'History, then: Why?', message: 'Why?',
  }) {
    this.send({ type: 'callback', id, callbackId, method: 'model.invoke', params })
  }

  /**
   * Answers the chat.answer request Core sends next the way Harness does: one model call, with the
   * whole turn and the new message built from `text`, then the call's output as the answer, or,
   * with `reject`, a model error instead.
   */
  async answerTurn(text: string, reject = false) {
    const request = await this.frame()
    const id = request['id'] as number
    const replied = this.frame()
    this.callModel(`call-${id}`, id, { system: 'Chat rules and context', prompt: `History, then: ${text}`, message: text })
    const output = ((await replied)['result'] as { output: string }).output
    this.send(reject
      ? { type: 'error', id, ok: false, error: { kind: 'model_error', message: '模型输出包含无效页码引用' } }
      : { type: 'response', id, ok: true, result: { answer: output } })
  }
}

const CLI_MODEL: HarnessRuntimeModel = { source: 'cli', cli: 'claude', model: 'opus' }

/**
 * Stand-in `claude` and `codex` that keep sessions the way the real CLIs do: one file per session,
 * named by its id, under the folder `CLAUDE_CONFIG_DIR` or `CODEX_HOME` names. A turn that resumes a
 * session whose file is gone fails as the CLI does. Each answers `Answer <n>`, n counting the turns
 * its session holds, streams it, and records what it saw; `codex delete --force <id>` deletes the
 * session's file.
 */
const SESSION_CLI = `#!${process.execPath}
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const argv = process.argv.slice(2)
const after = (flag) => argv[argv.indexOf(flag) + 1]
const print = (event) => process.stdout.write(JSON.stringify(event) + '\\n')
let stdin = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => { stdin += chunk })
process.stdin.on('end', () => {
  if (argv[0] === 'delete') {
    const sessions = path.join(process.env.CODEX_HOME, 'sessions', '2026', '10', '25')
    for (const name of fs.existsSync(sessions) ? fs.readdirSync(sessions) : []) {
      if (name.includes(argv[2])) fs.rmSync(path.join(sessions, name))
    }
    return
  }
  fs.appendFileSync(process.env.STAND_IN_RECORD, JSON.stringify({ argv, stdin, cwd: process.cwd() }) + '\\n')
  const claude = path.basename(process.argv[1]) === 'claude'
  const resume = claude ? (argv.includes('--resume') ? after('--resume') : undefined) : (argv[1] === 'resume' ? argv.at(-2) : undefined)
  const folder = claude
    ? path.join(process.env.CLAUDE_CONFIG_DIR, 'projects', process.cwd().replace(/[^A-Za-z0-9]/g, '-'))
    : path.join(process.env.CODEX_HOME, 'sessions', '2026', '10', '25')
  const fileOf = (id) => claude ? path.join(folder, id + '.jsonl') : path.join(folder, 'rollout-2026-10-25T17-00-00-' + id + '.jsonl')
  if (resume !== undefined && !fs.existsSync(fileOf(resume))) {
    process.stderr.write('No conversation found with session ID: ' + resume + '\\n')
    process.exitCode = 1
    return
  }
  const id = resume ?? (claude ? after('--session-id') : crypto.randomUUID())
  fs.mkdirSync(folder, { recursive: true })
  fs.appendFileSync(fileOf(id), JSON.stringify({ stdin }) + '\\n')
  if (!claude) fs.appendFileSync(fileOf(id), JSON.stringify({ timestamp: 't', type: 'turn_context', payload: { model: 'gpt-6.1-sol' } }) + '\\n')
  const turns = fs.readFileSync(fileOf(id), 'utf8').split('\\n').filter((line) => line.startsWith('{"stdin"')).length
  const answer = 'Answer ' + turns
  if (claude) {
    print({ type: 'system', subtype: 'init', session_id: id, model: 'claude-opus-5-5[1m]' })
    print({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: answer } } })
    print({ type: 'result', subtype: 'success', is_error: false, result: answer, session_id: id,
      usage: { input_tokens: 2, cache_creation_input_tokens: 100, cache_read_input_tokens: 1000 * turns, output_tokens: 10 } })
  } else {
    print({ type: 'thread.started', thread_id: id })
    print({ type: 'item.completed', item: { id: 'item_1', type: 'agent_message', text: answer } })
    print({ type: 'turn.completed', usage: { input_tokens: 3000 * turns, cached_input_tokens: 2000 * turns, output_tokens: 10 * turns } })
  }
})
`

/** What a stand-in CLI saw on one turn. */
type SeenTurn = { argv: string[]; stdin: string; cwd: string }

/**
 * A chat of the fixture vault answered through `model`, which a test may change between turns, by
 * the stand-in CLIs, with the session store, the chat service, a stand-in Harness and a user-data
 * folder and CLI homes of their own.
 */
function sessionChat(initial: HarnessRuntimeModel) {
  const root = mkdtempSync(join(tmpdir(), 'meridian-chat-session-test-'))
  const bin = join(root, 'bin')
  mkdirSync(bin)
  for (const name of ['claude', 'codex']) {
    writeFileSync(join(bin, name), SESSION_CLI)
    chmodSync(join(bin, name), 0o755)
  }
  const record = join(root, 'record.jsonl')
  const environment = {
    PATH: '/usr/bin:/bin', CLAUDE_CONFIG_DIR: join(root, 'claude-home'), CODEX_HOME: join(root, 'codex-home'),
    STAND_IN_RECORD: record,
  }
  const store = createFixtureStore()
  const chat = store.createChat('Speculative decoding', true).id
  const logs: string[] = []
  const state = { model: initial }
  const model = {
    runtime: async () => state.model,
    planModel: () => ({ provider: 'Claude', name: 'opus', configured: true, billable: false }),
  } as unknown as HarnessModelConfig
  const child = new FakeHarness()
  const sessions = openCliChatSessions({
    root: join(root, 'user-data', 'cli-chats'), vault: '/vaults/research', environment,
    binary: async (cli) => join(bin, cli), onLog: (line) => logs.push(line),
  })
  const runner = createChatHarnessRunner({
    store, model, checkCli: async () => ({ state: 'connected', modelCalls: 0, maxOutputTokens: 1 }),
    cli: createCliChatRunner({
      discover: async (cli) => ({ cli, installed: true, binary: join(bin, cli), version: '1.0.0', missingFlags: [], signIn: 'subscription' }),
      // The stand-in CLIs start no MCP server; the turn's lookups add nothing to what they see.
      internalMcp: async () => ({ claudeArgs: [], codexArgs: [], env: {}, close: async () => {} }),
      environment,
    }),
    sessions,
    launch: () => child,
    onLog: (line) => logs.push(line),
  })
  const service = createChatService({ store, model, runner })
  let started = false
  /** Sends `text` and lets the stand-in Harness answer it, or reject the answer with `reject`. */
  const send = async (text: string, reject = false) => {
    const sent = service.send(chat, [{ kind: 'text', text }])
    if (!started) child.ready()
    started = true
    await child.answerTurn(text, reject)
    return sent
  }
  const retry = async () => {
    const retried = service.retry(chat)
    const question = store.chatMessages(chat).findLast((message) => message.role === 'you')!.runs[0]!.text
    await child.answerTurn(question)
    return retried
  }
  const seen = (): SeenTurn[] => (existsSync(record)
    ? readFileSync(record, 'utf8').split('\n').filter((line) => line !== '').map((line) => JSON.parse(line) as SeenTurn)
    : [])
  const sessionFiles = () => globSync('**/*.jsonl', { cwd: root }).filter((path) => path.includes('-home'))
  const close = () => {
    runner.close()
    rmSync(root, { recursive: true, force: true })
  }
  /** Deletes the CLI sessions of the chats the vault no longer keeps, the way Core does after the trash changes. */
  const prune = () => sessions.prune(new Set(store.chatIds()))
  return { store, chat, state, send, retry, seen, sessionFiles, logs, root, environment, close, prune }
}

const sessionOf = (turn: SeenTurn) => (turn.argv.includes('--resume') ? turn.argv[turn.argv.indexOf('--resume') + 1]
  : turn.argv[1] === 'resume' ? turn.argv.at(-2) : turn.argv.includes('--session-id')
    ? turn.argv[turn.argv.indexOf('--session-id') + 1] : undefined)
const resumes = (turn: SeenTurn) => turn.argv.includes('--resume') || turn.argv[1] === 'resume'

/** A runner whose chat turns on a subscription CLI `cli` answers, with a session store in a folder of its own. */
function chatRunner(model: HarnessRuntimeModel, cli: CliChatRunner) {
  const child = new FakeHarness()
  const logs: string[] = []
  const store = createFixtureStore()
  const chat = store.createChat('Speculative decoding', true).id
  const root = mkdtempSync(join(tmpdir(), 'meridian-chat-runner-test-'))
  const runner = createChatHarnessRunner({
    store,
    model: { runtime: async () => model } as unknown as HarnessModelConfig,
    checkCli: async () => ({ state: 'connected', modelCalls: 0, maxOutputTokens: 1 }),
    cli,
    sessions: openCliChatSessions({ root, vault: '/vaults/research', environment: { CLAUDE_CONFIG_DIR: root, CODEX_HOME: root } }),
    launch: () => child,
    onLog: (line) => logs.push(line),
  })
  const close = () => {
    runner.close()
    rmSync(root, { recursive: true, force: true })
  }
  return { child, runner, logs, chat, store, close }
}

describe('a chat turn on a subscription CLI', () => {
  it('answers the turn\'s one model call on the CLI with the whole turn and its model, and offers no second', async () => {
    const calls: CliChatCall[] = []
    const { child, runner, logs, chat, close } = chatRunner(CLI_MODEL, async (call) => {
      calls.push(call)
      return {
        answer: 'EAGLE reaches 3.76x [p. 6].', durationMs: 6_700,
        usage: { inputTokens: 24_182, cachedInputTokens: 23_327, outputTokens: 88 },
      }
    })
    const answering = runner.answer(chat, 'Why?', new AbortController().signal)
    child.ready()
    expect(await child.frame()).toMatchObject({
      method: 'chat.answer', params: { chatId: chat, text: 'Why?', model: CLI_MODEL },
    })

    child.callModel('first')
    expect(await child.frame()).toMatchObject({
      type: 'response', callbackId: 'first', result: { output: 'EAGLE reaches 3.76x [p. 6].' },
    })
    expect(calls).toEqual([expect.objectContaining({
      cli: 'claude', model: 'opus', system: 'Chat rules and context', prompt: 'History, then: Why?', lookup: {},
    })])
    child.callModel('second')
    expect(await child.frame()).toMatchObject({ type: 'error', callbackId: 'second', error: { kind: 'bad_request' } })
    expect(calls).toHaveLength(1)

    child.send({ type: 'response', id: 1, ok: true, result: { answer: 'EAGLE reaches 3.76x [p. 6].' } })
    await expect(answering).resolves.toBe('EAGLE reaches 3.76x [p. 6].')
    expect(logs).toContainEqual('claude: 6.7 s, 24182 input tokens (23327 cached), 88 output tokens')
    close()
  })

  it('makes the turn\'s CLI call at the reasoning effort the model sets', async () => {
    const calls: CliChatCall[] = []
    const { child, runner, chat, close } = chatRunner({ source: 'cli', cli: 'claude', model: 'opus', effort: 'max' }, async (call) => {
      calls.push(call)
      return { answer: 'Yes.', durationMs: 1_000 }
    })
    const answering = runner.answer(chat, 'Why?', new AbortController().signal)
    child.ready()
    await child.answerTurn('Why?')
    await expect(answering).resolves.toBe('Yes.')

    expect(calls).toEqual([expect.objectContaining({ cli: 'claude', model: 'opus', effort: 'max' })])
    close()
  })

  it('passes on the configured model at once, the model the CLI names, and the answer as far as the CLI has written it', async () => {
    const { child, runner, chat, close } = chatRunner(CLI_MODEL, async (call) => {
      call.onModel?.('claude-opus-5-5[1m]')
      call.onText?.('EAGLE reaches')
      call.onText?.('EAGLE reaches 3.76x [p. 6].')
      return { answer: 'EAGLE reaches 3.76x [p. 6].', model: 'claude-opus-5-5[1m]', durationMs: 1 }
    })
    const written: string[] = []
    const models: unknown[] = []
    const answering = runner.answer(chat, 'Why?', new AbortController().signal, {
      onModel: (model) => models.push(model), onText: (text) => written.push(text),
    })
    child.ready()
    await child.frame()
    child.callModel('call')
    await child.frame()
    child.send({ type: 'response', id: 1, ok: true, result: { answer: 'EAGLE reaches 3.76x [p. 6].' } })

    await expect(answering).resolves.toBe('EAGLE reaches 3.76x [p. 6].')
    expect(written).toEqual(['EAGLE reaches', 'EAGLE reaches 3.76x [p. 6].'])
    expect(models).toEqual([
      { route: 'subscription', cli: 'claude', id: 'opus' },
      { route: 'subscription', cli: 'claude', id: 'claude-opus-5-5[1m]' },
    ])
    close()
  })

  it('tells Harness how many pages a paper chat\'s paper has, read from its PDF when the vault stored no count', async () => {
    vi.stubEnv('MERIDIAN_LIBRARY_ROOT', resolve(import.meta.dirname, '../fixtures/vault'))
    try {
      const { child, runner, store, close } = chatRunner(CLI_MODEL, async () => ({ answer: 'Answer', durationMs: 1 }))
      const stored = '13979-STAR-Speculative-Decodin'
      // The same two-page PDF with one byte more, so the vault keeps it as a paper of its own.
      const copy = store.importPaper('copy.pdf', new Uint8Array([...store.paperSource(stored), 0x0a])).paper
      expect([store.getPaper(stored).pageCount, copy.pageCount]).toEqual([17, 0])
      const answering = runner.answer(store.createChat('Warm-up', true).id, 'Why?', new AbortController().signal)
      child.ready()
      await child.frame()
      const contextOf = async (paper: string) => {
        const replied = child.frame()
        child.send({
          type: 'callback', id: 1, callbackId: paper, method: 'chat.context',
          params: { id: store.chatForPaper(paper).id, currentText: 'Why?' },
        })
        return ((await replied) as { result: { paper: { pages: Array<{ number: number }>; pageCount: number } } }).result.paper
      }

      expect(await contextOf(stored)).toMatchObject({ pageCount: 17, pages: [{ number: 1 }, { number: 2 }] })
      expect(await contextOf(copy.id)).toMatchObject({ pageCount: 2, pages: [{ number: 1 }, { number: 2 }] })
      child.send({ type: 'response', id: 1, ok: true, result: { answer: 'Answer' } })
      await answering
      close()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('scopes the vault lookups of a paper chat\'s turn to its paper', async () => {
    const calls: CliChatCall[] = []
    const { child, runner, store, close } = chatRunner(CLI_MODEL, async (call) => {
      calls.push(call)
      return { answer: 'Answer', durationMs: 1 }
    })
    const paper = store.listPapers({ page: 1, size: 1 }).rows[0]!.id
    const answering = runner.answer(store.chatForPaper(paper).id, 'Why?', new AbortController().signal)
    child.ready()
    await child.frame()
    child.callModel('call')
    await child.frame()
    child.send({ type: 'response', id: 1, ok: true, result: { answer: 'Answer' } })

    await answering
    expect(calls).toEqual([expect.objectContaining({ lookup: { paperId: paper } })])
    close()
  })

  it('fails a turn whose CLI call failed for the CLI problem it met, in the CLI\'s own words', async () => {
    for (const [kind, reason] of [['usage-limit', 'usage-limit'], ['signed-out', 'cli-signed-out'], ['failed', 'model']] as const) {
      const { child, runner, chat, close } = chatRunner(CLI_MODEL, async () => {
        throw new CliRunError(kind, 'claude 运行失败：You\'ve hit your limit')
      })
      const answering = runner.answer(chat, 'Why?', new AbortController().signal)
      child.ready()
      await child.frame()

      child.callModel('limit')
      expect(await child.frame()).toMatchObject({
        type: 'error', callbackId: 'limit',
        error: { kind: 'model_error', message: 'claude 运行失败：You\'ve hit your limit' },
      })
      child.send({ type: 'error', id: 1, ok: false, error: { kind: 'model_error', message: 'claude 运行失败：You\'ve hit your limit' } })
      await expect(answering).rejects.toMatchObject({ name: 'CallError', reason, message: 'claude 运行失败：You\'ve hit your limit' })
      close()
    }
  })

  it('stops the CLI turn when the user stops the chat', async () => {
    const signals: AbortSignal[] = []
    const { child, runner, chat, close } = chatRunner(CLI_MODEL, (call) => new Promise((_, reject) => {
      signals.push(call.signal)
      call.signal.addEventListener('abort', () => reject(new CliRunError('cancelled', '已停止 claude')))
    }))
    const controller = new AbortController()
    const answering = runner.answer(chat, 'Why?', controller.signal)
    child.ready()
    await child.frame()
    child.callModel('call')
    await vi.waitFor(() => expect(signals).toHaveLength(1))

    controller.abort()
    await expect(answering).rejects.toMatchObject({ name: 'CallError', reason: 'cancelled' })
    expect(signals[0]!.aborted).toBe(true)
    close()
  })

  it.each([
    ['at the provider\'s own default', undefined, { maxOutputTokens: 2_000, maxModelCalls: 1, timeoutSeconds: 120 }],
    ['at the high effort', 'high', { maxOutputTokens: 34_000, maxModelCalls: 1, timeoutSeconds: 600 }],
  ])('sends a turn on an API model %s the output cap and timeout its effort gives', async (_, effort, limits) => {
    const model: HarnessRuntimeModel = {
      provider: 'anthropic', protocol: 'messages', baseUrl: 'https://api.anthropic.com', model: 'claude-opus-5-5',
      authentication: 'api-key', apiKey: 'sk-ant-test', ...(effort === undefined ? {} : { effort }),
    }
    const { child, runner, chat, close } = chatRunner(model, vi.fn<CliChatRunner>())
    const answering = runner.answer(chat, 'Why?', new AbortController().signal)
    child.ready()
    const request = await child.frame()
    child.send({ type: 'response', id: request['id'], ok: true, result: { answer: 'Because.' } })

    await expect(answering).resolves.toBe('Because.')
    expect(request).toMatchObject({ method: 'chat.answer', params: { limits } })
    close()
  })

  it('offers no model call to a chat on an API model', async () => {
    const cli = vi.fn<CliChatRunner>()
    const { child, runner, chat, close } = chatRunner({
      provider: 'openai', protocol: 'responses', baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-5', authentication: 'api-key', apiKey: 'sk-test',
    }, cli)
    const models: unknown[] = []
    const answering = runner.answer(chat, 'Why?', new AbortController().signal, {
      onModel: (model) => models.push(model), onText: () => {},
    })
    child.ready()
    await child.frame()

    child.callModel('call')
    expect(await child.frame()).toMatchObject({ type: 'error', callbackId: 'call', error: { kind: 'bad_request' } })
    expect(cli).not.toHaveBeenCalled()
    child.send({ type: 'response', id: 1, ok: true, result: { answer: 'API answer' } })
    await expect(answering).resolves.toBe('API answer')
    expect(models).toEqual([{ route: 'api', id: 'gpt-5' }])
    close()
  })
})

describe('a chat on a subscription CLI keeps a CLI session', () => {
  for (const cli of ['claude', 'codex'] as const) {
    it(`resumes the ${cli} session the chat started, with the new message alone, in the chat's own folder`, async () => {
      const chat = sessionChat({ source: 'cli', cli })
      try {
        await expect(chat.send('What is EAGLE?')).resolves.toMatchObject({ state: 'complete' })
        await expect(chat.send('And its speedup?')).resolves.toMatchObject({ state: 'complete' })

        const [first, second] = chat.seen()
        expect(resumes(first!)).toBe(false)
        expect(first!.stdin).toBe(cli === 'claude'
          ? 'History, then: What is EAGLE?'
          : 'Chat rules and context\n\nHistory, then: What is EAGLE?')
        expect(resumes(second!)).toBe(true)
        expect(second!.stdin).toBe('And its speedup?')
        const session = sessionOf(second!)!
        if (cli === 'claude') expect(sessionOf(first!)).toBe(session)
        expect(chat.sessionFiles()).toEqual([expect.stringContaining(`${session}.jsonl`)])
        expect(second!.cwd).toBe(first!.cwd)
        expect(first!.cwd.startsWith(join(chat.root, 'user-data', 'cli-chats'))
          || first!.cwd.startsWith(join('/private', chat.root, 'user-data', 'cli-chats'))).toBe(true)
        expect(chat.store.chatMessages(chat.chat).map((message) => message.runs[0]!.text))
          .toEqual(['What is EAGLE?', 'Answer 1', 'And its speedup?', 'Answer 2'])
      } finally {
        chat.close()
      }
    })
  }

  for (const [cli, model] of [
    ['claude', { route: 'subscription', cli: 'claude', id: 'claude-opus-5-5[1m]' }],
    ['codex', { route: 'subscription', cli: 'codex', id: 'gpt-6.1-sol' }],
  ] as const) {
    it(`keeps a ${cli} answer with the model the CLI named for it, from its stream or its own session`, async () => {
      const chat = sessionChat({ source: 'cli', cli })
      try {
        await chat.send('What is EAGLE?')
        expect(chat.store.chatMessages(chat.chat).at(-1)).toMatchObject({ role: 'ai', model })
      } finally {
        chat.close()
      }
    })
  }

  it('logs a resumed Codex turn\'s own tokens, not the running total Codex reports', async () => {
    const chat = sessionChat({ source: 'cli', cli: 'codex' })
    try {
      await chat.send('What is EAGLE?')
      await chat.send('And its speedup?')
      expect(chat.logs.filter((line) => line.startsWith('codex:'))).toEqual([
        expect.stringMatching(/^codex: \d+\.\d s, 3000 input tokens \(2000 cached\), 10 output tokens$/),
        expect.stringMatching(/^codex: \d+\.\d s, 3000 input tokens \(2000 cached\), 10 output tokens$/),
      ])
    } finally {
      chat.close()
    }
  })

  it('starts a new session with the whole turn when the chat was edited in Meridian', async () => {
    const chat = sessionChat(CLI_MODEL)
    try {
      await chat.send('What is EAGLE?')
      chat.store.appendChatMessages(chat.chat, [{ role: 'you', runs: [{ kind: 'text', text: 'A note the session never saw' }], actions: [] }])
      await chat.send('And its speedup?')

      const [first, second] = chat.seen()
      expect(resumes(second!)).toBe(false)
      expect(sessionOf(second!)).not.toBe(sessionOf(first!))
      expect(second!.stdin).toBe('History, then: And its speedup?')
      expect(chat.logs).toContain(`chat ${chat.chat}: a new claude session, the chat changed`)
    } finally {
      chat.close()
    }
  })

  it('starts a new session when the model changed between turns', async () => {
    const chat = sessionChat(CLI_MODEL)
    try {
      await chat.send('What is EAGLE?')
      chat.state.model = { source: 'cli', cli: 'claude', model: 'sonnet' }
      await chat.send('And its speedup?')

      const [, second] = chat.seen()
      expect(resumes(second!)).toBe(false)
      expect(second!.argv).toContain('--model=sonnet')
      expect(chat.logs).toContain(`chat ${chat.chat}: a new claude session, the model changed`)
    } finally {
      chat.close()
    }
  })

  it('starts a new session when the CLI no longer has the session', async () => {
    const chat = sessionChat(CLI_MODEL)
    try {
      await chat.send('What is EAGLE?')
      for (const file of chat.sessionFiles()) rmSync(join(chat.root, file))
      await expect(chat.send('And its speedup?')).resolves.toMatchObject({ state: 'complete' })

      const [, second] = chat.seen()
      expect(resumes(second!)).toBe(false)
      expect(second!.stdin).toBe('History, then: And its speedup?')
      expect(chat.logs).toContain(`chat ${chat.chat}: a new claude session, the session is gone`)
    } finally {
      chat.close()
    }
  })

  it('starts a new session when a turn is asked again after its answer was not kept', async () => {
    const chat = sessionChat(CLI_MODEL)
    try {
      await chat.send('What is EAGLE?')
      await expect(chat.send('And its speedup?', true)).resolves.toMatchObject({ state: 'failed' })
      await expect(chat.retry()).resolves.toMatchObject({ state: 'complete' })

      const [first, rejected, retried] = chat.seen()
      expect(resumes(rejected!)).toBe(true)
      expect(resumes(retried!)).toBe(false)
      expect(sessionOf(retried!)).not.toBe(sessionOf(first!))
      expect(retried!.stdin).toBe('History, then: And its speedup?')
      expect(chat.logs).toContain(`chat ${chat.chat}: a new claude session, no session to resume`)
    } finally {
      chat.close()
    }
  })
})

describe('deleting a chat on a subscription CLI', () => {
  for (const cli of ['claude', 'codex'] as const) {
    it(`keeps its ${cli} session while it is in the trash, resumes it once restored, and deletes it once purged`, async () => {
      const chat = sessionChat({ source: 'cli', cli })
      try {
        await chat.send('What is EAGLE?')
        const [first] = chat.seen()
        chat.store.deleteChat(chat.chat)
        await chat.prune()
        expect(chat.sessionFiles()).toHaveLength(1)

        chat.store.restoreTrash(chat.store.listTrash()[0]!.id)
        await chat.send('And its speedup?')
        expect(resumes(chat.seen()[1]!)).toBe(true)

        chat.store.deleteChat(chat.chat)
        chat.store.purgeTrash(chat.store.listTrash()[0]!.id)
        await chat.prune()
        expect(chat.sessionFiles()).toEqual([])
        expect(existsSync(first!.cwd)).toBe(false)
        expect(chat.logs).toContain(`chat ${chat.chat}: deleted its 1 CLI sessions`)
      } finally {
        chat.close()
      }
    })
  }
})
