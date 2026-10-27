import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createFixtureStore } from '../fixture-store.js'
import type { VaultStore } from '../vault.js'
import { createVaultStore } from '../vault-store.js'
import { ideaPreview, saveIdeaDraft } from './index.js'

const TITLE = '按接受率调草稿树宽'
const BODY = '大 batch 下树宽跟着接受率走。'

/**
 * A chat of three rounds about tree width, the second mentioning `project` when given, whose answer
 * to an idea turn drafts an idea from the first and third rounds' questions and the second's answer.
 */
function ideaChat(store: VaultStore, project?: string) {
  const chat = store.createChat('树宽', true).id
  store.appendChatMessages(chat, [
    { role: 'you', actions: [], runs: [{ kind: 'text', text: '树宽能跟着接受率变吗' }] },
    { role: 'ai', actions: [], runs: [{ kind: 'text', text: '可以' }] },
    {
      role: 'you', actions: [], runs: project === undefined ? [{ kind: 'text', text: '顺便问问 MoE' }]
        : [{ kind: 'mention', text: '@效率', target: { kind: 'project', id: project } }, { kind: 'text', text: ' 里怎么做' }],
    },
    { role: 'ai', actions: [], runs: [{ kind: 'text', text: '先看大 batch' }] },
    { role: 'you', actions: [], runs: [{ kind: 'text', text: '整理想法' }] },
  ])
  const ids = store.chatMessages(chat).map((message) => message.id)
  store.appendChatMessages(chat, [{
    role: 'ai', actions: [], runs: [{ kind: 'text', text: '整理好了。' }],
    idea: { title: TITLE, body: BODY, sources: [ids[0]!, ids[3]!, ids[4]!] },
  }])
  return { chat, message: store.chatMessages(chat).at(-1)!.id }
}

describe('saving a chat\'s idea draft', () => {
  it('previews the idea as the user left it, the project the chat mentioned, the chat and the rounds it came from', () => {
    const store = createFixtureStore()
    const { chat, message } = ideaChat(store, 'draft')
    const preview = ideaPreview(store, chat, message, '改过的标题', BODY)

    expect(preview).toEqual({
      idea: { title: '改过的标题', body: BODY, project: { id: 'draft', name: 'draft 效率' } },
      chat: '树宽',
      rounds: [1, 2, 3],
      fingerprint: expect.stringMatching(/^[0-9a-f]{16}$/),
      saved: null,
    })
    expect(ideaPreview(store, chat, message, TITLE, BODY).fingerprint).not.toBe(preview.fingerprint)
  })

  it('refuses a confirmation whose fingerprint is not that of the content as shown, and writes nothing', () => {
    const store = createFixtureStore()
    const { chat, message } = ideaChat(store)
    const shown = ideaPreview(store, chat, message, TITLE, BODY)
    const before = store.listIdeas().length

    expect(() => saveIdeaDraft(store, chat, message, '又改了', BODY, shown.fingerprint)).toThrow(expect.objectContaining({ reason: 'refused' }))
    expect(store.listIdeas()).toHaveLength(before)
  })

  it('refuses an answer without an idea draft', () => {
    const store = createFixtureStore()
    const chat = store.createChat('无草稿', true).id
    store.appendChatMessages(chat, [{ role: 'ai', runs: [{ kind: 'text', text: '只有结论' }], actions: [] }])
    const message = store.chatMessages(chat).at(-1)!.id

    expect(() => ideaPreview(store, chat, message, TITLE, BODY)).toThrow(expect.objectContaining({ reason: 'not-found' }))
  })
})

describe('a saved idea draft in the vault', () => {
  let vault: string
  afterEach(() => { rmSync(vault, { recursive: true, force: true }) })

  it('saves the idea from the chat with the title and body as shown, marks the draft saved, and refuses saving it twice', () => {
    vault = mkdtempSync(join(tmpdir(), 'meridian-idea-draft-'))
    cpSync(resolve(import.meta.dirname, '../fixtures/vault'), vault, { recursive: true })
    const store = createVaultStore(vault, () => '2026-10-27')
    const { chat, message } = ideaChat(store)
    const shown = ideaPreview(store, chat, message, '改过的标题', BODY)

    const idea = saveIdeaDraft(store, chat, message, '改过的标题', BODY, shown.fingerprint)

    expect(idea).toMatchObject({ title: '改过的标题', body: BODY, source: { chatId: chat, chatTitle: '树宽' } })
    expect(idea.relations).toBeUndefined()
    const stored = (JSON.parse(readFileSync(join(vault, '.meridian', 'chats.json'), 'utf8')) as Array<{ id: string; messages: Array<{ id: string; idea?: { saved?: string } }> }>)
      .find((held) => held.id === chat)!.messages.find((held) => held.id === message)!
    expect(stored.idea!.saved).toBe(idea.id)
    const again = ideaPreview(createVaultStore(vault), chat, message, '改过的标题', BODY)
    expect(again.saved).toBe(idea.id)
    expect(() => saveIdeaDraft(store, chat, message, '改过的标题', BODY, again.fingerprint)).toThrow(expect.objectContaining({ reason: 'refused' }))
    expect(store.listIdeas().filter((held) => held.title === '改过的标题')).toHaveLength(1)
  })
})
