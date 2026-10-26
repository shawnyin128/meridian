import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { readStoredList } from '../vault/stored-records.js'
import type { VaultStore } from '../vault.js'
import { createVaultStore } from '../vault-store.js'
import type { ChatHarnessRunner } from './chat.js'
import { createChatService } from './chat-service.js'
import type { CredentialVault } from './credential-vault.js'
import { createHarnessModelConfig } from './model-config.js'

/** Test vault the store opens. */
const VAULT = resolve(import.meta.dirname, '../fixtures/vault')

/** The chat record schema of App 0.0.20.0 (v0.0.20000), copied with the schemas it is built from. */
const ChatRunSchema0200 = z.object({
  kind: z.enum(['text', 'mention']),
  text: z.string(),
  target: z.object({ kind: z.string(), id: z.string() }).strict().optional(),
}).strict()
const ChatActionSchema0200 = z.object({
  kind: z.literal('writeBack'), label: z.string(), project: z.string(), text: z.string(),
  done: z.boolean().optional(),
}).strict()
const ChatMessageSchema0200 = z.object({
  id: z.string(),
  role: z.enum(['you', 'ai', 'status']),
  runs: z.array(ChatRunSchema0200),
  actions: z.array(ChatActionSchema0200),
}).strict()
const chatRecordOf = <M extends z.ZodTypeAny>(message: M) => z.object({
  id: z.string(),
  title: z.string(),
  archived: z.boolean(),
  paperId: z.string().optional(),
}).strict().extend({
  named: z.boolean(),
  messages: z.array(message),
  idea: z.object({ feed: z.string(), version: z.number().int().min(1), first: z.string() }).strict().optional(),
})
const ChatRecordSchema0200 = chatRecordOf(ChatMessageSchema0200)
/** The chat record schema of App 0.0.21.0 (v0.0.21000), whose messages name the model of an answer. */
const ChatRecordSchema0210 = chatRecordOf(ChatMessageSchema0200.extend({
  model: z.discriminatedUnion('route', [
    z.object({ route: z.literal('subscription'), cli: z.enum(['claude', 'codex']), id: z.string().min(1).max(200).optional() }).strict(),
    z.object({ route: z.literal('api'), id: z.string().min(1).max(200) }).strict(),
  ]).optional(),
}).strict())

const vault: CredentialVault = {
  seal: async (secret) => secret,
  open: async (ciphertext) => ({ secret: ciphertext }),
}

describe('一轮停下时留下的回答存下的样子', () => {
  let root: string
  let store: VaultStore

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'meridian-chat-compat-'))
    cpSync(VAULT, join(root, 'vault'), { recursive: true })
    store = createVaultStore(join(root, 'vault'))
  })

  afterEach(() => { rmSync(root, { recursive: true, force: true }) })

  it('App 0.0.21.0 和 0.0.20.0 的对话 schema 都读得出停下时写到一半的回答', async () => {
    const model = { route: 'subscription' as const, cli: 'claude' as const, id: 'claude-opus-5-5[1m]' }
    const runner: ChatHarnessRunner = {
      checkConnection: vi.fn(async () => ({ state: 'connected' as const, modelCalls: 1 as const, maxOutputTokens: 1 as const })),
      answer: vi.fn((_id, _text, signal, progress) => new Promise<string>((_resolve, reject) => {
        progress?.onModel(model)
        progress?.onText('EAGLE reaches')
        signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true })
      })),
      close: vi.fn(),
      listModels: vi.fn(),
    }
    const config = await createHarnessModelConfig(join(root, 'config'), vault)
    await config.update({
      provider: 'openai-compatible', protocol: 'responses', baseUrl: 'http://127.0.0.1:11434/v1', model: 'local-model', authentication: 'none',
    })
    const chat = store.createChat('停下的一轮', true).id
    const service = createChatService({ store, model: config, runner })
    const sending = service.send(chat, [{ kind: 'text', text: 'EAGLE 快多少' }])
    service.cancel(chat)
    await expect(sending).resolves.toMatchObject({ state: 'cancelled' })

    const file = join(root, 'vault', '.meridian', 'chats.json')
    const raw = JSON.parse(readFileSync(file, 'utf8')) as { id: string }[]
    const stored = raw.find((record) => record.id === chat)
    const answer = { role: 'ai', runs: [{ kind: 'text', text: 'EAGLE reaches' }], actions: [] }
    expect(ChatRecordSchema0210.parse(stored).messages.at(-1)).toEqual({ id: expect.any(String), ...answer, model })
    // App 0.0.20.0 reads its lists with this same readStoredList, unchanged since then.
    const read0200 = readStoredList(file, raw, ChatRecordSchema0200, 'id')
    expect(read0200.unreadable).toEqual([])
    expect(read0200.rows.find((record) => record.id === chat)?.messages.at(-1)).toEqual({ id: expect.any(String), ...answer })
  })
})
