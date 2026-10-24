import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { callFailure } from '../call-error.js'
import { createFixtureStore } from '../fixture-store.js'
import { sanitizeModelConnectionDetail, type ChatHarnessRunner } from './chat.js'
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

  it('persists one explicit user turn and one validated Harness answer', async () => {
    const store = createFixtureStore()
    const runner: ChatHarnessRunner = {
      checkConnection: vi.fn(async () => ({
        state: 'connected' as const, modelCalls: 1 as const, maxOutputTokens: 1 as const,
      })),
      answer: vi.fn(async () => '基于当前上下文的回答'),
      close: vi.fn(),
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
    }
    const service = createChatService({ store, model: await configuredModel(), runner })
    const before = store.chatMessages('amortize').length

    const mention = { kind: 'mention' as const, text: '@草稿树项目', target: { kind: 'project', id: 'draft' } }
    await service.send('amortize', [{ kind: 'text', text: '  看看 ' }, mention, { kind: 'text', text: ' 这条线还剩什么 \n' }])
    expect(store.chatMessages('amortize')[before]!.runs).toEqual([
      { kind: 'text', text: '看看 ' }, mention, { kind: 'text', text: ' 这条线还剩什么' },
    ])
    expect(runner.answer).toHaveBeenCalledWith('amortize', '看看 @草稿树项目 这条线还剩什么', expect.anything())
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

  it('answers a failed model call with its reason and keeps the provider text out of the result', async () => {
    const store = createFixtureStore()
    const runner: ChatHarnessRunner = {
      checkConnection: vi.fn(async () => ({
        state: 'connected' as const, modelCalls: 1 as const, maxOutputTokens: 1 as const,
      })),
      answer: vi.fn(async () => { throw new Error('401 Unauthorized: invalid x-api-key') }),
      close: vi.fn(),
    }
    const service = createChatService({ store, model: await configuredModel(), runner })

    await expect(service.send('amortize', written('测试'))).resolves.toEqual({ id: 'amortize', state: 'failed', reason: 'model' })
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
