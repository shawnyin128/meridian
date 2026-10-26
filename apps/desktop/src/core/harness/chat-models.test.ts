import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { openChatModels } from './chat-models.js'

/** A model list holding models `opus`, taking `high` and `max`, and `sol`, taking `low`; the default is `opus`. */
const models = {
  accepts: (id: string, effort?: string) => ({ opus: ['high', 'max'], sol: ['low'] } as Record<string, string[]>)[id]
    ?.includes(effort ?? (id === 'opus' ? 'high' : 'low')) ?? false,
  modelOf: (choice?: { model: string } | null) => (choice !== null && choice !== undefined && ['opus', 'sol'].includes(choice.model) ? choice.model : 'opus'),
}

const choicesFile = () => join(mkdtempSync(join(tmpdir(), 'meridian-chat-models-')), 'chat-models', 'choices.json')

describe('chat model choices', () => {
  it('runs a chat that chose nothing on the default, and a chat that chose a model on it at its own effort, alone', () => {
    const file = choicesFile()
    const choices = openChatModels({ file, vault: '/vaults/research', models })

    expect(choices.shown('chat-1')).toEqual({ model: 'opus' })
    expect(choices.set('chat-1', 'sol', 'low')).toEqual({ model: 'sol', effort: 'low' })
    expect(choices.shown('chat-2')).toEqual({ model: 'opus' })
    expect(choices.choiceOf('chat-1')).toEqual({ model: 'sol', effort: 'low' })
    expect(choices.set('chat-1', 'opus')).toEqual({ model: 'opus' })

    const reopened = openChatModels({ file, vault: '/vaults/research', models })
    expect(reopened.choiceOf('chat-1')).toEqual({ model: 'opus' })
    expect(openChatModels({ file, vault: '/vaults/other', models }).choiceOf('chat-1')).toBeNull()
  })

  it('shows a chat whose model was removed on the default, without its own effort', () => {
    const choices = openChatModels({ file: choicesFile(), vault: '/vaults/research', models })
    choices.set('chat-1', 'sol', 'low')

    const gone = openChatModels({
      file: choicesFile(), vault: '/vaults/research', models: { ...models, modelOf: () => 'opus' },
    })
    gone.set('chat-1', 'sol', 'low')

    expect(gone.shown('chat-1')).toEqual({ model: 'opus' })
  })

  it('refuses a model the list does not hold and an effort the model does not take, keeping the chat\'s choice', () => {
    const choices = openChatModels({ file: choicesFile(), vault: '/vaults/research', models })
    choices.set('chat-1', 'sol')

    expect(() => choices.set('chat-1', 'gone')).toThrow(expect.objectContaining({ reason: 'not-found' }))
    expect(() => choices.set('chat-1', 'opus', 'low')).toThrow(expect.objectContaining({ reason: 'invalid' }))
    expect(choices.choiceOf('chat-1')).toEqual({ model: 'sol' })
  })

  it('forgets the choices of the vault\'s chats that are gone, keeps the others and other vaults\', and writes nothing when none is gone', () => {
    const file = choicesFile()
    openChatModels({ file, vault: '/vaults/other', models }).set('chat-9', 'sol')
    const choices = openChatModels({ file, vault: '/vaults/research', models })
    choices.set('chat-1', 'sol')
    choices.set('chat-2', 'opus', 'max')
    const before = readFileSync(file, 'utf8')

    choices.prune(new Set(['chat-1', 'chat-2']))
    expect(readFileSync(file, 'utf8')).toBe(before)
    choices.prune(new Set(['chat-2']))

    expect(choices.choiceOf('chat-1')).toBeNull()
    expect(choices.choiceOf('chat-2')).toEqual({ model: 'opus', effort: 'max' })
    expect(openChatModels({ file, vault: '/vaults/other', models }).choiceOf('chat-9')).toEqual({ model: 'sol' })
  })

  it('skips a record it cannot read, reporting it, and writes it back as it was', () => {
    const file = choicesFile()
    openChatModels({ file, vault: '/vaults/research', models }).set('chat-1', 'sol')
    const record = JSON.parse(readFileSync(file, 'utf8')) as { chats: unknown[] }
    const odd = { vault: '/vaults/research', chat: 'chat-2', model: 7 }
    writeFileSync(file, JSON.stringify({ chats: [...record.chats, odd] }))
    const onLog = vi.fn()

    const choices = openChatModels({ file, vault: '/vaults/research', models, onLog })
    choices.set('chat-3', 'opus')

    expect(onLog).toHaveBeenCalledWith(expect.stringContaining('1 chat records cannot be read'))
    expect(choices.choiceOf('chat-2')).toBeNull()
    expect((JSON.parse(readFileSync(file, 'utf8')) as { chats: unknown[] }).chats).toContainEqual(odd)
  })

  it('writes no file until a chat chooses a model', () => {
    const file = choicesFile()
    const choices = openChatModels({ file, vault: '/vaults/research', models })
    choices.shown('chat-1')
    choices.prune(new Set())

    expect(existsSync(file)).toBe(false)
  })
})
