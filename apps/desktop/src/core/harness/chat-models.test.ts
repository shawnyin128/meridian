import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { HarnessSourceModels } from '../../shared/contract.js'
import { openChatModels } from './chat-models.js'
import type { ModelChoice } from './model-config.js'

/**
 * A model list holding Claude, taking `high` and `max`, and Codex, taking `low` and `medium`; Claude
 * is the default.
 */
const models = {
  accepts: (id: string, effort?: string) => {
    const levels = ({ 'cli:claude': ['high', 'max'], 'cli:codex': ['low', 'medium'] } as Record<string, string[]>)[id]
    return levels !== undefined && (effort === undefined || levels.includes(effort))
  },
  modelOf: (choice?: ModelChoice | null) => (choice !== null && choice !== undefined && ['cli:claude', 'cli:codex'].includes(choice.source)
    ? choice.source : 'cli:claude'),
}
/** The models each source offers, as read: Codex lists `sol`, taking `low` and `medium`, and `mini`, taking `low`. */
const offers = async (source: string): Promise<HarnessSourceModels> => (source === 'cli:codex'
  ? { source, models: [{ id: '', efforts: { levels: ['low', 'medium'] } }, { id: 'sol', efforts: { levels: ['low', 'medium'] } }, { id: 'mini', efforts: { levels: ['low'] } }] }
  : { source, models: [{ id: 'opus', efforts: { levels: ['high', 'max'] } }] })

const choicesFile = () => join(mkdtempSync(join(tmpdir(), 'meridian-chat-models-')), 'chat-models', 'choices.json')
const open = (file: string, vault = '/vaults/research', extra: Partial<Parameters<typeof openChatModels>[0]> = {}) =>
  openChatModels({ file, vault, models, offers, ...extra })

describe('chat model choices', () => {
  it('runs a chat that chose nothing on the default source, and a chat that chose a source on it, with its own model and effort, alone', async () => {
    const file = choicesFile()
    const choices = open(file)

    expect(choices.shown('chat-1')).toEqual({ source: 'cli:claude' })
    expect(await choices.set('chat-1', 'cli:codex', 'mini', 'low')).toEqual({ source: 'cli:codex', model: 'mini', effort: 'low' })
    expect(choices.shown('chat-2')).toEqual({ source: 'cli:claude' })
    expect(choices.choiceOf('chat-1')).toEqual({ source: 'cli:codex', model: 'mini', effort: 'low' })
    expect(await choices.set('chat-1', 'cli:claude')).toEqual({ source: 'cli:claude' })

    expect(open(file).choiceOf('chat-1')).toEqual({ source: 'cli:claude' })
    expect(open(file, '/vaults/other').choiceOf('chat-1')).toBeNull()
  })

  it('shows a chat whose source was removed on the default source, without its own model or effort', async () => {
    const file = choicesFile()
    await open(file).set('chat-1', 'cli:codex', 'sol', 'medium')

    const gone = open(file, '/vaults/research', { models: { ...models, modelOf: () => 'cli:claude' } })
    expect(gone.shown('chat-1')).toEqual({ source: 'cli:claude' })
  })

  it('refuses a source the list does not hold, a model the source\'s list does not offer and an effort the model does not take, keeping the chat\'s choice', async () => {
    const choices = open(choicesFile())
    await choices.set('chat-1', 'cli:codex', 'sol')

    await expect(choices.set('chat-1', 'cli:gone')).rejects.toMatchObject({ reason: 'not-found' })
    await expect(choices.set('chat-1', 'cli:codex', 'gpt-9')).rejects.toMatchObject({ reason: 'invalid' })
    await expect(choices.set('chat-1', 'cli:codex', 'mini', 'medium')).rejects.toMatchObject({ reason: 'invalid' })
    await expect(choices.set('chat-1', 'cli:claude', undefined, 'low')).rejects.toMatchObject({ reason: 'invalid' })
    expect(choices.choiceOf('chat-1')).toEqual({ source: 'cli:codex', model: 'sol' })
  })

  it('takes any model of a source whose list could not be read, and checks the effort against the source', async () => {
    const choices = open(choicesFile(), '/vaults/research', {
      offers: async (source) => ({ source, models: [{ id: '', efforts: { levels: [] } }], error: 'cli-missing' }),
    })

    expect(await choices.set('chat-1', 'cli:codex', 'gpt-9', 'medium')).toEqual({ source: 'cli:codex', model: 'gpt-9', effort: 'medium' })
    await expect(choices.set('chat-1', 'cli:codex', 'gpt-9', 'max')).rejects.toMatchObject({ reason: 'invalid' })
  })

  it('forgets the choices of the vault\'s chats that are gone, keeps the others and other vaults\', and writes nothing when none is gone', async () => {
    const file = choicesFile()
    await open(file, '/vaults/other').set('chat-9', 'cli:codex')
    const choices = open(file)
    await choices.set('chat-1', 'cli:codex')
    await choices.set('chat-2', 'cli:claude', 'opus', 'max')
    const before = readFileSync(file, 'utf8')

    choices.prune(new Set(['chat-1', 'chat-2']))
    expect(readFileSync(file, 'utf8')).toBe(before)
    choices.prune(new Set(['chat-2']))

    expect(choices.choiceOf('chat-1')).toBeNull()
    expect(choices.choiceOf('chat-2')).toEqual({ source: 'cli:claude', model: 'opus', effort: 'max' })
    expect(open(file, '/vaults/other').choiceOf('chat-9')).toEqual({ source: 'cli:codex' })
  })

  it('skips a record it cannot read, reporting it, and writes it back as it was', async () => {
    const file = choicesFile()
    await open(file).set('chat-1', 'cli:codex')
    const record = JSON.parse(readFileSync(file, 'utf8')) as { chats: unknown[] }
    const odd = { vault: '/vaults/research', chat: 'chat-2', model: 'sol' }
    writeFileSync(file, JSON.stringify({ chats: [...record.chats, odd] }))
    const onLog = vi.fn()

    const choices = open(file, '/vaults/research', { onLog })
    await choices.set('chat-3', 'cli:claude')

    expect(onLog).toHaveBeenCalledWith(expect.stringContaining('1 chat records cannot be read'))
    expect(choices.choiceOf('chat-2')).toBeNull()
    expect((JSON.parse(readFileSync(file, 'utf8')) as { chats: unknown[] }).chats).toContainEqual(odd)
  })

  it('writes no file until a chat chooses a source', () => {
    const file = choicesFile()
    const choices = open(file)
    choices.shown('chat-1')
    choices.prune(new Set())

    expect(existsSync(file)).toBe(false)
  })
})
