import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { ChatMessage, PaperReading } from '../../shared/contract.js'
import { CallError } from '../call-error.js'
import type { VaultStore } from '../vault.js'
import {
  CHAT_CONTEXT_BUDGETS, ChatFailure, chatHarnessError, createChatHarnessRunner, messagesBefore, packChatHistory,
  packPaperReading,
} from './chat.js'
import { CliRunError } from './cli/child.js'
import type { CliChatCall, CliChatRunner } from './cli/chat-turn.js'
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

  it('never passes on a parser\'s text, and leaves an error from outside the Harness call as it is', () => {
    const parsed = z.object({ answer: z.string().min(1) }).safeParse({ answer: '' })
    expect(said(parsed.error)).toEqual([true, '模型的回答读不出来'])
    const unreadable = new CallError('key-unreadable', '保存的 API Key 读不出来')
    expect(chatHarnessError(unreadable)).toBe(unreadable)
  })
})

describe('model connection check', () => {
  it('checks a subscription CLI with its own check, without the Harness or a model call', async () => {
    const checked: string[] = []
    const runner = createChatHarnessRunner({
      store: {} as VaultStore,
      model: { runtime: async () => ({ source: 'cli', cli: 'codex' }) } as unknown as HarnessModelConfig,
      checkCli: async (cli) => {
        checked.push(cli)
        return { state: 'connected', modelCalls: 0, maxOutputTokens: 1 }
      },
      cli: vi.fn<CliChatRunner>(),
    })

    await expect(runner.checkConnection()).resolves.toEqual({ state: 'connected', modelCalls: 0, maxOutputTokens: 1 })
    expect(checked).toEqual(['codex'])
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

  callModel(callbackId: string) {
    this.send({
      type: 'callback', id: 1, callbackId, method: 'model.invoke',
      params: { system: 'Chat rules and context', prompt: 'History, then: Why?', message: 'Why?' },
    })
  }
}

const CLI_MODEL: HarnessRuntimeModel = { source: 'cli', cli: 'claude', model: 'opus' }

function chatRunner(model: HarnessRuntimeModel, cli: CliChatRunner) {
  const child = new FakeHarness()
  const logs: string[] = []
  const runner = createChatHarnessRunner({
    store: {} as VaultStore,
    model: { runtime: async () => model } as unknown as HarnessModelConfig,
    checkCli: async () => ({ state: 'connected', modelCalls: 0, maxOutputTokens: 1 }),
    cli,
    launch: () => child,
    onLog: (line) => logs.push(line),
  })
  return { child, runner, logs }
}

describe('a chat turn on a subscription CLI', () => {
  it('answers the turn\'s one model call on the CLI with the whole turn and its model, and offers no second', async () => {
    const calls: CliChatCall[] = []
    const { child, runner, logs } = chatRunner(CLI_MODEL, async (call) => {
      calls.push(call)
      return {
        answer: 'EAGLE reaches 3.76x [p. 6].', durationMs: 6_700,
        usage: { inputTokens: 24_182, cachedInputTokens: 23_327, outputTokens: 88 },
      }
    })
    const answering = runner.answer('chat-1', 'Why?', new AbortController().signal)
    child.ready()
    expect(await child.frame()).toMatchObject({
      method: 'chat.answer', params: { chatId: 'chat-1', text: 'Why?', model: CLI_MODEL },
    })

    child.callModel('first')
    expect(await child.frame()).toMatchObject({
      type: 'response', callbackId: 'first', result: { output: 'EAGLE reaches 3.76x [p. 6].' },
    })
    expect(calls).toEqual([expect.objectContaining({
      cli: 'claude', model: 'opus', system: 'Chat rules and context', prompt: 'History, then: Why?', mcpFlags: [],
    })])
    child.callModel('second')
    expect(await child.frame()).toMatchObject({ type: 'error', callbackId: 'second', error: { kind: 'bad_request' } })
    expect(calls).toHaveLength(1)

    child.send({ type: 'response', id: 1, ok: true, result: { answer: 'EAGLE reaches 3.76x [p. 6].' } })
    await expect(answering).resolves.toBe('EAGLE reaches 3.76x [p. 6].')
    expect(logs).toEqual(['claude: 6.7 s, 24182 input tokens (23327 cached), 88 output tokens'])
    runner.close()
  })

  it('passes a CLI failure to Harness as a model error in the CLI\'s own words', async () => {
    const { child, runner } = chatRunner(CLI_MODEL, async () => {
      throw new CliRunError('failed', 'claude 运行失败：Claude AI usage limit reached')
    })
    const answering = runner.answer('chat-1', 'Why?', new AbortController().signal)
    child.ready()
    await child.frame()

    child.callModel('limit')
    expect(await child.frame()).toMatchObject({
      type: 'error', callbackId: 'limit',
      error: { kind: 'model_error', message: 'claude 运行失败：Claude AI usage limit reached' },
    })
    child.send({ type: 'error', id: 1, ok: false, error: { kind: 'model_error', message: 'claude 运行失败：Claude AI usage limit reached' } })
    await expect(answering).rejects.toEqual(new ChatFailure('claude 运行失败：Claude AI usage limit reached'))
    runner.close()
  })

  it('stops the CLI turn when the user stops the chat', async () => {
    const signals: AbortSignal[] = []
    const { child, runner } = chatRunner(CLI_MODEL, (call) => new Promise((_, reject) => {
      signals.push(call.signal)
      call.signal.addEventListener('abort', () => reject(new CliRunError('cancelled', '已停止 claude')))
    }))
    const controller = new AbortController()
    const answering = runner.answer('chat-1', 'Why?', controller.signal)
    child.ready()
    await child.frame()
    child.callModel('call')
    await vi.waitFor(() => expect(signals).toHaveLength(1))

    controller.abort()
    await expect(answering).rejects.toEqual(new ChatFailure('已停止生成'))
    expect(signals[0]!.aborted).toBe(true)
    runner.close()
  })

  it('offers no model call to a chat on an API model', async () => {
    const cli = vi.fn<CliChatRunner>()
    const { child, runner } = chatRunner({
      provider: 'openai', protocol: 'responses', baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-5', authentication: 'api-key', apiKey: 'sk-test',
    }, cli)
    const answering = runner.answer('chat-1', 'Why?', new AbortController().signal)
    child.ready()
    await child.frame()

    child.callModel('call')
    expect(await child.frame()).toMatchObject({ type: 'error', callbackId: 'call', error: { kind: 'bad_request' } })
    expect(cli).not.toHaveBeenCalled()
    child.send({ type: 'response', id: 1, ok: true, result: { answer: 'API answer' } })
    await expect(answering).resolves.toBe('API answer')
    runner.close()
  })
})
