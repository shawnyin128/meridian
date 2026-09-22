import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createFixtureStore } from '../fixture-store.js'
import { sanitizeModelConnectionDetail, type ChatHarnessRunner } from './chat.js'
import { createChatService } from './chat-service.js'
import type { CredentialVault } from './credential-vault.js'
import { createHarnessModelConfig } from './model-config.js'

const vault: CredentialVault = {
  seal: async (secret) => secret.split('').reverse().join(''),
  open: async (ciphertext) => ({ secret: ciphertext.split('').reverse().join('') }),
}

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

    await expect(service.send('amortize', '测试')).resolves.toEqual({
      id: 'amortize', state: 'complete',
    })
    expect(store.chatMessages('amortize').slice(before)).toMatchObject([
      { role: 'you', runs: [{ text: '测试' }] },
      { role: 'ai', runs: [{ text: '基于当前上下文的回答' }] },
    ])
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
    const sending = service.send('amortize', '停止这个请求')

    expect(service.cancel('amortize')).toEqual({ id: 'amortize', cancelled: true })
    await expect(sending).resolves.toEqual({
      id: 'amortize', state: 'cancelled', message: '已停止生成',
    })
    expect(store.chatMessages('amortize').slice(before)).toMatchObject([
      { role: 'you', runs: [{ text: '停止这个请求' }] },
    ])
  })

  it('states that setup is required instead of pretending to be an AI answer', async () => {
    const store = createFixtureStore()
    const model = await createHarnessModelConfig(
      mkdtempSync(join(tmpdir(), 'meridian-chat-model-')),
      vault,
    )
    const service = createChatService({ store, model, runner: null })
    const before = store.chatMessages('amortize').length

    const result = await service.send('amortize', '测试')
    expect(result.state).toBe('failed')
    expect(store.chatMessages('amortize').slice(before)).toMatchObject([
      { role: 'you' },
      { role: 'status', runs: [{ text: expect.stringContaining('设置') }] },
    ])
  })
})
