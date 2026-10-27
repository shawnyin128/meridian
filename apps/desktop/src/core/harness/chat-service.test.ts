import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { ExperimentDesign } from '../../shared/contract.js'
import { CallError, callFailure } from '../call-error.js'
import { createFixtureStore } from '../fixture-store.js'
import experimentDesign from '../fixtures/experiment-design.json' with { type: 'json' }
import { openCoreLog, teeConsole } from '../core-log.js'
import { ChatFailure, chatHarnessError, redactSecrets, sanitizeModelConnectionDetail, type ChatHarnessRunner } from './chat.js'
import { CliRunError } from './cli/child.js'
import { HarnessRpcError } from './rpc.js'

const DESIGN = experimentDesign as ExperimentDesign
const CJK = /[\u3000-\u303f\u3400-\u9fff\uff00-\uffef]/
import { createChatService } from './chat-service.js'
import type { CredentialVault } from './credential-vault.js'
import { createHarnessModelConfig } from './model-config.js'

const vault: CredentialVault = {
  seal: async (secret) => secret.split('').reverse().join(''),
  open: async (ciphertext) => ({ secret: ciphertext.split('').reverse().join('') }),
}

/** A turn the user wrote as plain text. */
const written = (text: string) => [{ kind: 'text' as const, text }]

async function configuredModel() {
  const model = await createHarnessModelConfig(
    mkdtempSync(join(tmpdir(), 'meridian-chat-model-')),
    vault,
  )
  await model.update({
    provider: 'openai-compatible', protocol: 'responses',
    baseUrl: 'http://127.0.0.1:11434/v1', model: 'local-model', authentication: 'none',
  })
  return model
}

describe('Core chat service', () => {
  it('redacts credentials and bounds model connection diagnostics before Renderer sees them', () => {
    const apiKey = 'sk-core-secret-1234567890'
    const detail = sanitizeModelConnectionDetail(
      `Invalid API key: ${apiKey}\nAuthorization: Bearer ${apiKey} ${'x'.repeat(600)}`,
      [apiKey],
    )

    expect(detail).toContain('[redacted]')
    expect(detail).not.toContain(apiKey)
    expect(detail).not.toContain('\n')
    expect(detail.length).toBeLessThanOrEqual(500)
  })

  it('runs a chat on its own model while the default cannot run, and finds no model for a chat without one', async () => {
    const model = await createHarnessModelConfig(mkdtempSync(join(tmpdir(), 'meridian-chat-model-')), vault)
    await model.addModel({
      source: { kind: 'api', provider: 'openai', protocol: 'responses', baseUrl: 'https://api.openai.com/v1', authentication: 'api-key' },
      model: 'gpt-6.1',
    })
    const opus = (await model.addModel({ source: { kind: 'cli', cli: 'claude' }, model: 'opus', effort: 'high' }))
      .models.find((entry) => entry.model === 'opus')!.id
    const runner: ChatHarnessRunner = { checkConnection: vi.fn(), answer: vi.fn(async () => '回答'), close: vi.fn(), listModels: vi.fn(), design: vi.fn() }
    const service = createChatService({
      store: createFixtureStore(), model, runner, choiceOf: (id) => (id === 'amortize' ? { source: opus } : null),
    })

    expect(model.settings().configured).toBe(false)
    await expect(service.send('amortize', written('测试'))).resolves.toEqual({ id: 'amortize', state: 'complete' })
    await expect(service.send('widthknee', written('测试'))).resolves.toEqual({ id: 'widthknee', state: 'failed', reason: 'no-model' })
  })

  it('persists one explicit user turn and one validated Harness answer', async () => {
    const store = createFixtureStore()
    const runner: ChatHarnessRunner = {
      checkConnection: vi.fn(async () => ({
        state: 'connected' as const, modelCalls: 1 as const, maxOutputTokens: 1 as const,
      })),
      answer: vi.fn(async () => '基于当前上下文的回答'),
      close: vi.fn(),
      listModels: vi.fn(),
      design: vi.fn(),
    }
    const service = createChatService({ store, model: await configuredModel(), runner })
    const before = store.chatMessages('amortize').length

    await expect(service.send('amortize', written('测试'))).resolves.toEqual({
      id: 'amortize', state: 'complete',
    })
    expect(store.chatMessages('amortize').slice(before)).toMatchObject([
      { role: 'you', runs: [{ text: '测试' }] },
      { role: 'ai', runs: [{ text: '基于当前上下文的回答' }] },
    ])
  })

  it('stores a mention as a run of its own, trims the turn at its ends and hands the model the whole sentence', async () => {
    const store = createFixtureStore()
    const runner: ChatHarnessRunner = {
      checkConnection: vi.fn(async () => ({
        state: 'connected' as const, modelCalls: 1 as const, maxOutputTokens: 1 as const,
      })),
      answer: vi.fn(async () => '回答'),
      close: vi.fn(),
      listModels: vi.fn(),
      design: vi.fn(),
    }
    const service = createChatService({ store, model: await configuredModel(), runner })
    const before = store.chatMessages('amortize').length

    const mention = { kind: 'mention' as const, text: '@草稿树项目', target: { kind: 'project', id: 'draft' } }
    await service.send('amortize', [{ kind: 'text', text: '  看看 ' }, mention, { kind: 'text', text: ' 这条线还剩什么 \n' }])
    expect(store.chatMessages('amortize')[before]!.runs).toEqual([
      { kind: 'text', text: '看看 ' }, mention, { kind: 'text', text: ' 这条线还剩什么' },
    ])
    expect(runner.answer).toHaveBeenCalledWith('amortize', '看看 @草稿树项目 这条线还剩什么', expect.anything(), expect.any(Object))
  })

  it('hands over a mention with the entity it names while that entity is in the vault, and as its text once it is gone', async () => {
    const store = createFixtureStore()
    const service = createChatService({ store, model: await configuredModel(), runner: null })
    const named = [
      { kind: 'mention' as const, text: '@草稿树项目', target: { kind: 'project', id: 'draft' } },
      { kind: 'mention' as const, text: '@SmoothQuant', target: { kind: 'paper', id: '2210.17323' } },
      { kind: 'mention' as const, text: '@KV cache 量化', target: { kind: 'page', id: 'topics/kv-cache-quantization' } },
    ]
    const gone = [
      { kind: 'mention' as const, text: '@删掉的项目', target: { kind: 'project', id: 'no-such-project' } },
      { kind: 'mention' as const, text: '@删掉的论文', target: { kind: 'paper', id: 'no-such-paper' } },
      { kind: 'mention' as const, text: '@删掉的页', target: { kind: 'page', id: 'topics/no-such-page' } },
    ]
    store.appendChatMessages('amortize', [{ role: 'you', runs: [...named, ...gone], actions: [] }])

    expect(service.messages('amortize').at(-1)!.runs).toEqual([
      ...named, ...gone.map(({ kind, text }) => ({ kind, text })),
    ])
    expect(store.chatMessages('amortize').at(-1)!.runs).toEqual([...named, ...gone])
  })

  it('reports the answer being written with its model, from before its first text until the turn ends or stops', async () => {
    const store = createFixtureStore()
    const configured = { route: 'subscription' as const, cli: 'claude' as const }
    const reported = { route: 'subscription' as const, cli: 'claude' as const, id: 'claude-opus-5-5[1m]' }
    let write: (text: string) => void = () => {}
    let finish: (answer: string) => void = () => {}
    const runner: ChatHarnessRunner = {
      checkConnection: vi.fn(async () => ({
        state: 'connected' as const, modelCalls: 1 as const, maxOutputTokens: 1 as const,
      })),
      answer: vi.fn((_id, _text, signal, progress) => new Promise<string>((resolve, reject) => {
        progress?.onModel(configured)
        write = (text) => progress?.onText(text)
        finish = resolve
        signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true })
      })),
      close: vi.fn(),
      listModels: vi.fn(),
      design: vi.fn(),
    }
    const service = createChatService({ store, model: await configuredModel(), runner })
    expect(service.writing('amortize')).toBeNull()

    const sentAt = Date.now()
    const answered = service.send('amortize', written('EAGLE 快多少'))
    const since = service.writing('amortize')?.since ?? ''
    expect(Date.parse(since)).toBeGreaterThanOrEqual(sentAt)
    expect(Date.parse(since)).toBeLessThanOrEqual(Date.now())
    expect(service.writing('amortize')).toEqual({ text: '', model: configured, since })
    write('EAGLE reaches')
    vi.mocked(runner.answer).mock.calls[0]![3]!.onModel(reported)
    write('EAGLE reaches 3.76x')
    expect(service.writing('amortize')).toEqual({ text: 'EAGLE reaches 3.76x', model: reported, since })
    expect(service.writing('widthknee')).toBeNull()
    finish('EAGLE reaches 3.76x [p. 6].')
    await expect(answered).resolves.toMatchObject({ state: 'complete' })
    expect(service.writing('amortize')).toBeNull()
    expect(store.chatMessages('amortize').at(-1)).toMatchObject({ role: 'ai', model: reported })

    const stopped = service.send('amortize', written('再问一句'))
    expect(service.writing('amortize')).toEqual({ text: '', model: configured, since: expect.any(String) })
    service.cancel('amortize')
    expect(service.writing('amortize')).toBeNull()
    await expect(stopped).resolves.toMatchObject({ state: 'cancelled' })
  })

  it('keeps an answer whose runner named no model without one', async () => {
    const store = createFixtureStore()
    const runner: ChatHarnessRunner = {
      checkConnection: vi.fn(async () => ({
        state: 'connected' as const, modelCalls: 1 as const, maxOutputTokens: 1 as const,
      })),
      answer: vi.fn(async () => '回答'),
      close: vi.fn(),
      listModels: vi.fn(),
      design: vi.fn(),
    }
    const service = createChatService({ store, model: await configuredModel(), runner })
    await service.send('amortize', written('问'))
    expect(store.chatMessages('amortize').at(-1)).not.toHaveProperty('model')
  })

  it('keeps the user turn and emits no fake answer when cancelled', async () => {
    const store = createFixtureStore()
    const runner: ChatHarnessRunner = {
      checkConnection: vi.fn(async () => ({
        state: 'connected' as const, modelCalls: 1 as const, maxOutputTokens: 1 as const,
      })),
      answer: vi.fn((_id, _text, signal) => new Promise<string>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true })
      })),
      close: vi.fn(),
      listModels: vi.fn(),
      design: vi.fn(),
    }
    const service = createChatService({ store, model: await configuredModel(), runner })
    const before = store.chatMessages('amortize').length
    const sending = service.send('amortize', written('停止这个请求'))

    expect(service.cancel('amortize')).toEqual({ id: 'amortize', cancelled: true })
    await expect(sending).resolves.toEqual({ id: 'amortize', state: 'cancelled' })
    expect(store.chatMessages('amortize').slice(before)).toMatchObject([
      { role: 'you', runs: [{ text: '停止这个请求' }] },
    ])
  })

  it('stopping a turn keeps the text it had written as its answer, with the model writing it, and nothing it answers after the stop', async () => {
    const store = createFixtureStore()
    const model = { route: 'subscription' as const, cli: 'codex' as const, id: 'gpt-6.1' }
    const writes: string[] = []
    let finish: (answer: string) => void = () => {}
    const runner: ChatHarnessRunner = {
      checkConnection: vi.fn(async () => ({
        state: 'connected' as const, modelCalls: 1 as const, maxOutputTokens: 1 as const,
      })),
      // Names its model, writes what `writes` holds, and resolves only when the test says so, stopped or not.
      answer: vi.fn((_id, _text, _signal, progress) => new Promise<string>((resolve) => {
        progress?.onModel(model)
        for (const text of writes) progress?.onText(text)
        finish = resolve
      })),
      close: vi.fn(),
      listModels: vi.fn(),
      design: vi.fn(),
    }
    const service = createChatService({ store, model: await configuredModel(), runner })
    const before = store.chatMessages('amortize').length

    writes.push('EAGLE reaches', 'EAGLE reaches 3.76x')
    const stopped = service.send('amortize', written('EAGLE 快多少'))
    expect(service.cancel('amortize')).toEqual({ id: 'amortize', cancelled: true })
    finish('EAGLE reaches 3.76x [p. 6].')
    await expect(stopped).resolves.toEqual({ id: 'amortize', state: 'cancelled' })

    writes.length = 0
    const silent = service.send('amortize', written('再问一句'))
    expect(service.cancel('amortize')).toEqual({ id: 'amortize', cancelled: true })
    finish('停止之后才到的回答')
    await expect(silent).resolves.toEqual({ id: 'amortize', state: 'cancelled' })

    expect(store.chatMessages('amortize').slice(before)).toEqual([
      { id: expect.any(String), role: 'you', runs: [{ kind: 'text', text: 'EAGLE 快多少' }], actions: [] },
      { id: expect.any(String), role: 'ai', runs: [{ kind: 'text', text: 'EAGLE reaches 3.76x' }], actions: [], model },
      { id: expect.any(String), role: 'you', runs: [{ kind: 'text', text: '再问一句' }], actions: [] },
    ])
  })

  it('deleting a chat that is generating stops the generation before the chat goes to the trash, and the late answer never lands', async () => {
    const store = createFixtureStore()
    let signal: AbortSignal | undefined
    let finish: (answer: string) => void = () => {}
    const runner: ChatHarnessRunner = {
      checkConnection: vi.fn(async () => ({
        state: 'connected' as const, modelCalls: 1 as const, maxOutputTokens: 1 as const,
      })),
      // Resolves only when the test says so, whether or not it was aborted.
      answer: vi.fn((_id, _text, held) => {
        signal = held
        return new Promise<string>((resolve) => { finish = resolve })
      }),
      close: vi.fn(),
      listModels: vi.fn(),
      design: vi.fn(),
    }
    const service = createChatService({ store, model: await configuredModel(), runner })
    const before = store.chatMessages('amortize').length
    const remove = store.deleteChat
    let stoppedFirst: boolean | undefined
    vi.spyOn(store, 'deleteChat').mockImplementation((id) => {
      stoppedFirst = signal?.aborted
      remove(id)
    })
    const sending = service.send('amortize', written('删之前问的一句'))

    const { trash } = service.delete('amortize')
    finish('删掉之后才到的回答')

    await expect(sending).resolves.toEqual({ id: 'amortize', state: 'cancelled' })
    expect(stoppedFirst).toBe(true)
    expect(store.listChats().map((chat) => chat.id)).not.toContain('amortize')
    expect(store.listTrash()[0]).toMatchObject({ id: trash, kind: 'chat' })
    store.restoreTrash(trash)
    expect(store.chatMessages('amortize').slice(before)).toMatchObject([
      { role: 'you', runs: [{ text: '删之前问的一句' }] },
    ])
  })

  it('answers a failed model call with its reason and keeps the provider text out of the result', async () => {
    const store = createFixtureStore()
    const runner: ChatHarnessRunner = {
      checkConnection: vi.fn(async () => ({
        state: 'connected' as const, modelCalls: 1 as const, maxOutputTokens: 1 as const,
      })),
      answer: vi.fn(async () => { throw new Error('401 Unauthorized: invalid x-api-key') }),
      close: vi.fn(),
      listModels: vi.fn(),
      design: vi.fn(),
    }
    const service = createChatService({ store, model: await configuredModel(), runner })

    await expect(service.send('amortize', written('测试'))).resolves.toEqual({ id: 'amortize', state: 'failed', reason: 'model' })
  })

  /** A runner whose model answers with each of `answers` in turn: a string is an answer, an Error a failure. */
  const runnerOf = (...answers: Array<string | Error>): ChatHarnessRunner => {
    const queue = [...answers]
    return {
      checkConnection: vi.fn(async () => ({
        state: 'connected' as const, modelCalls: 1 as const, maxOutputTokens: 1 as const,
      })),
      answer: vi.fn(async () => {
        const next = queue.shift()!
        if (next instanceof Error) throw next
        return next
      }),
      close: vi.fn(),
      listModels: vi.fn(),
      design: vi.fn(),
    }
  }
  const textsAfter = (store: ReturnType<typeof createFixtureStore>, before: number) =>
    store.chatMessages('amortize').slice(before).map((message) => [message.role, message.runs.map((run) => run.text).join('')])

  it('没得到回答的那一轮,状态行用平白的话说出了什么事:模型服务自己说清的原因照写,其他报错的原文不写进来', async () => {
    const store = createFixtureStore()
    const service = createChatService({
      store, model: await configuredModel(),
      runner: runnerOf(new ChatFailure('模型服务请求超时'), new Error('TypeError: Cannot read properties of undefined (reading "answer")')),
    })
    const before = store.chatMessages('amortize').length
    await service.send('amortize', written('第一问'))
    await service.send('amortize', written('第二问'))
    expect(textsAfter(store, before)).toEqual([
      ['you', '第一问'], ['status', '生成失败：模型服务请求超时'],
      ['you', '第二问'], ['status', '生成失败：模型服务调用失败'],
    ])
  })

  it('writes a turn that failed in the Harness request to the log file with its step, kind and detail, and not the question', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'meridian-chat-log-'))
    const printers = { error: console.error, warn: console.warn, info: console.info, log: console.log }
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      teeConsole(openCoreLog({ dir, redact: (text) => redactSecrets(text) }), console)
      const rejected = new HarnessRpcError({ kind: 'bad_request', message: 'Core returned an invalid chat context', detail: 'Authorization: Bearer sk-live-1234567890abcdef' })
      const service = createChatService({ store: createFixtureStore(), model: await configuredModel(), runner: runnerOf(chatHarnessError(rejected)) })
      await service.send('amortize', written('不该进日志的问题'))
    } finally {
      Object.assign(console, printers)
      quiet.mockRestore()
    }
    const log = readFileSync(join(dir, 'core.log'), 'utf8')
    expect(log).toContain('error [chat] chat amortize failed at request (bad_request): Core returned an invalid chat context: Authorization: [redacted]\n')
    expect(log).not.toContain('sk-live-1234567890abcdef')
    expect(log).not.toMatch(CJK)
    expect(log).not.toContain('不该进日志的问题')
  })

  it('logs a failed turn in English: the kind and the English detail, not the Chinese words the chat shows', async () => {
    const lines: string[] = []
    const quiet = vi.spyOn(console, 'error').mockImplementation((line: string) => { lines.push(line) })
    try {
      const failures = [
        chatHarnessError(new HarnessRpcError({ kind: 'model_error', message: '模型服务请求超时', detail: 'timeout' })),
        chatHarnessError(new HarnessRpcError({ kind: 'no_model', message: '还没有配置模型' })),
        new CallError('model', 'claude 运行失败', { cause: new CliRunError('failed', 'claude 运行失败', { exitCode: 1, stderr: 'Error: boom' }) }),
        new CallError('not-found', '论文不存在：p1'),
      ]
      const service = createChatService({ store: createFixtureStore(), model: await configuredModel(), runner: runnerOf(...failures) })
      for (let n = 0; n < failures.length; n += 1) await service.send('amortize', written('问'))
    } finally {
      quiet.mockRestore()
    }
    expect(lines).toEqual([
      '[chat] chat amortize failed at request (model_error): timeout',
      '[chat] chat amortize failed at request (no_model): no_model',
      '[chat] chat amortize failed at cli (failed): exit 1: Error: boom',
      '[chat] chat amortize failed at core (not-found): not-found',
    ])
  })

  it('重试一轮没回答的问题:再问模型一次同一个问题,问题不再写一遍,回答取代状态行', async () => {
    const store = createFixtureStore()
    const runner = runnerOf(new ChatFailure('AI 服务停了'), '重试后的回答')
    const service = createChatService({ store, model: await configuredModel(), runner })
    const before = store.chatMessages('amortize').length
    await service.send('amortize', written('  要重试的问题 '))

    await expect(service.retry('amortize')).resolves.toEqual({ id: 'amortize', state: 'complete' })
    expect(runner.answer).toHaveBeenLastCalledWith('amortize', '要重试的问题', expect.any(AbortSignal), expect.any(Object))
    expect(textsAfter(store, before)).toEqual([['you', '要重试的问题'], ['ai', '重试后的回答']])
  })

  it('a retry that fails again leaves one failure line, the newest', async () => {
    const store = createFixtureStore()
    const service = createChatService({
      store, model: await configuredModel(),
      runner: runnerOf(new ChatFailure('AI 服务停了'), new ChatFailure('AI 服务内部出错'), new ChatFailure('还没有连上模型')),
    })
    const before = store.chatMessages('amortize').length
    await service.send('amortize', written('问'))
    await service.retry('amortize')
    await service.retry('amortize')
    expect(textsAfter(store, before)).toEqual([['you', '问'], ['status', '生成失败：还没有连上模型']])
  })

  it('keeps where a chat\'s last turn failed until its next turn starts, for that chat only', async () => {
    const store = createFixtureStore()
    let reply: (answer: string) => void = () => {}
    const queue: Array<() => Promise<string>> = [
      async () => { throw chatHarnessError(new HarnessRpcError({ kind: 'bad_request', message: 'Core returned an invalid chat context' })) },
      () => new Promise<string>((resolve) => { reply = resolve }),
    ]
    const runner: ChatHarnessRunner = { ...runnerOf(), answer: vi.fn(() => queue.shift()!()) }
    const service = createChatService({ store, model: await configuredModel(), runner })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(service.failure('amortize')).toBeNull()
    await service.send('amortize', written('问'))
    expect(service.failure('amortize')).toEqual({ step: 'request', kind: 'bad_request', detail: 'Core returned an invalid chat context' })
    expect(service.failure('widthknee')).toBeNull()
    const retrying = service.retry('amortize')
    expect(service.failure('amortize')).toBeNull()
    reply('答')
    await retrying
    expect(service.failure('amortize')).toBeNull()
    vi.mocked(console.error).mockRestore()
  })

  it('最后一问已经有回答时不重试,还在生成时报忙', async () => {
    const store = createFixtureStore()
    let reply: (answer: string) => void = () => {}
    const runner: ChatHarnessRunner = {
      ...runnerOf(),
      answer: vi.fn(() => new Promise<string>((resolve) => { reply = resolve })),
    }
    const service = createChatService({ store, model: await configuredModel(), runner })
    const sending = service.send('amortize', written('问'))
    expect(callFailure(await service.retry('amortize').catch((error: unknown) => error))).toBe('busy')
    reply('答')
    await sending
    expect(callFailure(await service.retry('amortize').catch((error: unknown) => error))).toBe('refused')
    expect(runner.answer).toHaveBeenCalledTimes(1)
  })

  it('fails a second send to a chat that is still generating as busy', async () => {
    const store = createFixtureStore()
    const runner: ChatHarnessRunner = {
      checkConnection: vi.fn(async () => ({
        state: 'connected' as const, modelCalls: 1 as const, maxOutputTokens: 1 as const,
      })),
      answer: vi.fn((_id, _text, signal) => new Promise<string>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true })
      })),
      close: vi.fn(),
      listModels: vi.fn(),
      design: vi.fn(),
    }
    const service = createChatService({ store, model: await configuredModel(), runner })
    const first = service.send('amortize', written('第一句'))

    const second = await service.send('amortize', written('第二句')).catch((error: unknown) => error)
    expect(callFailure(second)).toBe('busy')
    service.cancel('amortize')
    await first
  })

  it('reports a chat as generating from the moment its send starts until its reply arrives, and no other chat', async () => {
    const store = createFixtureStore()
    let reply: (answer: string) => void = () => {}
    const runner: ChatHarnessRunner = {
      checkConnection: vi.fn(async () => ({
        state: 'connected' as const, modelCalls: 1 as const, maxOutputTokens: 1 as const,
      })),
      answer: vi.fn(() => new Promise<string>((resolve) => { reply = resolve })),
      close: vi.fn(),
      listModels: vi.fn(),
      design: vi.fn(),
    }
    const service = createChatService({ store, model: await configuredModel(), runner })
    expect(service.generating()).toEqual([])

    const sending = service.send('amortize', written('第一句'))
    expect(service.generating()).toEqual(['amortize'])
    reply('回答')
    await sending
    expect(service.generating()).toEqual([])
  })

  it('stops counting a stopped chat as generating at once, before its model call has wound down', async () => {
    const store = createFixtureStore()
    const runner: ChatHarnessRunner = {
      checkConnection: vi.fn(async () => ({
        state: 'connected' as const, modelCalls: 1 as const, maxOutputTokens: 1 as const,
      })),
      answer: vi.fn((_id, _text, signal) => new Promise<string>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true })
      })),
      close: vi.fn(),
      listModels: vi.fn(),
      design: vi.fn(),
    }
    const service = createChatService({ store, model: await configuredModel(), runner })
    const stopped = service.send('amortize', written('停止这个请求'))

    service.cancel('amortize')
    expect(service.generating()).toEqual([])
    const next = service.send('amortize', written('再问一次'))
    await stopped
    expect(service.generating()).toEqual(['amortize'])
    service.cancel('amortize')
    await next
  })

  it('with only a subscription chosen, and no API profile set up, a send reaches the model', async () => {
    const store = createFixtureStore()
    const model = await createHarnessModelConfig(mkdtempSync(join(tmpdir(), 'meridian-chat-model-')), vault)
    model.updateSubscription({ cli: 'codex', model: '' })
    const runner: ChatHarnessRunner = {
      checkConnection: vi.fn(async () => ({
        state: 'connected' as const, modelCalls: 0 as const, maxOutputTokens: 1 as const,
      })),
      answer: vi.fn(async () => '订阅模型的回答'),
      close: vi.fn(),
      listModels: vi.fn(),
      design: vi.fn(),
    }
    const service = createChatService({ store, model, runner })

    await expect(service.send('amortize', written('测试'))).resolves.toEqual({ id: 'amortize', state: 'complete' })
    expect(runner.answer).toHaveBeenCalledOnce()
  })

  it('without a model keeps only the user turn and reports no-model, writing no status sentence of its own', async () => {
    const store = createFixtureStore()
    const model = await createHarnessModelConfig(
      mkdtempSync(join(tmpdir(), 'meridian-chat-model-')),
      vault,
    )
    const service = createChatService({ store, model, runner: null })
    const before = store.chatMessages('amortize').length

    const result = await service.send('amortize', written('测试'))
    expect(result).toEqual({ id: 'amortize', state: 'failed', reason: 'no-model' })
    expect(store.chatMessages('amortize').slice(before).map((message) => message.role)).toEqual(['you'])
  })
})

describe('a design turn in the chat service', () => {
  const designRunner = (result: { answer: string; design: ExperimentDesign | null }): ChatHarnessRunner => ({
    checkConnection: vi.fn(),
    answer: vi.fn(async () => { throw new Error('a design turn must not run as an ordinary turn') }),
    design: vi.fn(async (_id, _text, _signal, progress) => {
      progress?.onModel({ route: 'api', id: 'local-model' })
      return result
    }),
    close: vi.fn(),
    listModels: vi.fn(),
  })

  it('keeps the answer of a design turn with the design it carries', async () => {
    const store = createFixtureStore()
    const runner = designRunner({ answer: '可以测。', design: DESIGN })
    const service = createChatService({ store, model: await configuredModel(), runner })

    await expect(service.send('amortize', written('设计实验'), true)).resolves.toEqual({ id: 'amortize', state: 'complete' })
    expect(runner.design).toHaveBeenCalledWith('amortize', '设计实验', expect.any(AbortSignal), expect.anything())
    expect(store.chatMessages('amortize').at(-1)).toEqual({
      id: expect.any(String), role: 'ai', runs: [{ kind: 'text', text: '可以测。' }], actions: [],
      model: { route: 'api', id: 'local-model' }, design: DESIGN,
    })
  })

  it('keeps an answer without a design when the model found nothing to test', async () => {
    const store = createFixtureStore()
    const service = createChatService({ store, model: await configuredModel(), runner: designRunner({ answer: '先说清要测的主张。', design: null }) })

    await service.send('amortize', written('设计实验'), true)
    expect(store.chatMessages('amortize').at(-1)).not.toHaveProperty('design')
  })

  it('asks again as a design turn when the retry asks for one', async () => {
    const store = createFixtureStore()
    const runner = designRunner({ answer: '可以测。', design: DESIGN })
    const service = createChatService({ store, model: await configuredModel(), runner })
    store.appendChatMessages('amortize', [
      { role: 'you', runs: written('设计实验'), actions: [] },
      { role: 'status', runs: written('生成失败：AI 服务停了'), actions: [] },
    ])

    await service.retry('amortize', true)
    expect(runner.design).toHaveBeenCalledWith('amortize', '设计实验', expect.any(AbortSignal), expect.anything())
    expect(store.chatMessages('amortize').at(-1)?.design).toEqual(DESIGN)
  })
})
