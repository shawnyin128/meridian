import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openChatModels } from '../../apps/desktop/src/core/harness/chat-models.ts'
import { createHarnessModelConfig } from '../../apps/desktop/src/core/harness/model-config.ts'
import { seedModelChoice } from './model.mjs'

let home = ''
afterEach(() => rmSync(home, { recursive: true, force: true }))

/** A credential store for model lists that hold no key. */
const noKeys = { seal: async () => { throw new Error('no key is sealed') }, open: async () => { throw new Error('no key is opened') } }

describe('测试库种下的模型', () => {
  it('默认是 Claude 订阅的 opus · high，能跑，也写进老版本读的订阅选择；OpenAI 的 gpt-6.1 留着但没配好；那条对话跑 sonnet · max', async () => {
    home = mkdtempSync(join(tmpdir(), 'meridian-test-library-model-'))
    const config = join(home, 'config')
    const models = await createHarnessModelConfig(config, noKeys)
    const choices = openChatModels({ file: join(home, 'user-data', 'chat-models', 'choices.json'), vault: join(home, 'library'), models })
    // Core's handlers for the calls the seed makes, on this config home and user-data folder.
    const handlers = {
      'harness.addModel': (params) => models.addModel(params),
      'harness.setDefaultModel': ({ id }) => models.setDefaultModel(id),
      'chat.list': () => [{ id: 'chat-12', title: 'KV cache 量化方案' }, { id: 'chat-156', title: '推测解码的树宽怎么定' }],
      'chat.setModel': ({ id, model, effort }) => choices.set(id, model, effort),
    }
    await seedModelChoice(async (method, params) => handlers[method](params))

    const settings = models.settings()
    const named = (id) => settings.models.find((entry) => entry.id === id)
    expect(named(settings.defaultModel)).toMatchObject({ source: { kind: 'cli', cli: 'claude' }, model: 'opus', effort: 'high', configured: true })
    expect(settings.configured).toBe(true)
    expect(settings.models.filter((entry) => entry.source.kind === 'api' && entry.source.profile === 'openai')
      .map(({ model, effort, configured }) => ({ model, effort, configured }))).toEqual([{ model: 'gpt-6.1', effort: 'medium', configured: false }])
    expect(JSON.parse(readFileSync(join(config, 'harness-subscription.json'), 'utf8')))
      .toMatchObject({ active: 'claude', clis: { claude: { model: 'opus' } } })
    const chat = choices.shown('chat-156')
    expect([named(chat.model)?.model, chat.effort, choices.shown('chat-12').model]).toEqual(['sonnet', 'max', settings.defaultModel])
  })
})
