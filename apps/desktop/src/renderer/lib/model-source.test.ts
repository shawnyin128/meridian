import { describe, expect, it } from 'vitest'
import type { HarnessModelSourceGroup } from '../../shared/contract.js'
import { catalogFor } from '../messages/catalog.js'
import { modelEntryLabel, modelSourceLabel, profileKey } from './model-source.js'

const group = (source: HarnessModelSourceGroup['source'], fields: Partial<HarnessModelSourceGroup> = {}): HarnessModelSourceGroup => ({
  source, entries: ['m'], defaultEntry: 'm', ...fields,
})

describe('the name of a model source', () => {
  it.each(['zh', 'en'] as const)('names an official provider by its API, a compatible service on a connection template by the template, and a subscription by its plan, in %s', (locale) => {
    const m = catalogFor(locale)
    const names = [
      group({ kind: 'api', profile: 'openai' }, { provider: 'openai' }),
      group({ kind: 'api', profile: 'anthropic' }, { provider: 'anthropic' }),
      group({ kind: 'api', profile: 'google-gemini' }, { provider: 'google-gemini' }),
      group({ kind: 'api', profile: 'openai-compatible:http://127.0.0.1:11434/v1' }, { provider: 'openai-compatible', host: '127.0.0.1:11434' }),
      group({ kind: 'cli', cli: 'claude' }),
      group({ kind: 'cli', cli: 'codex' }),
    ].map((held) => modelSourceLabel(m, held))

    expect(names).toEqual([
      'OpenAI API', 'Anthropic API', 'Google Gemini API', locale === 'zh' ? 'Ollama 本地' : 'Ollama (local)',
      m.settings.model.subscriptions.claude.label, m.settings.model.subscriptions.codex.label,
    ])
    expect(names.slice(4)).toEqual(locale === 'zh' ? ['Claude 订阅', 'ChatGPT 订阅'] : names.slice(4))
  })

  /** The source of an OpenAI-compatible service at `baseUrl`, as Core groups it. */
  const compatible = (baseUrl: string) => group(
    { kind: 'api', profile: `openai-compatible:${baseUrl}` }, { provider: 'openai-compatible', host: new URL(baseUrl).host },
  )

  it.each([
    ['zh', ['DeepSeek API', 'OpenRouter API', 'Ollama 本地', 'LM Studio 本地']],
    ['en', ['DeepSeek API', 'OpenRouter API', 'Ollama (local)', 'LM Studio (local)']],
  ] as const)('names a compatible service by the connection template its base URL matches, trailing slashes aside, in %s', (locale, names) => {
    const m = catalogFor(locale)
    expect(['https://api.deepseek.com/', 'https://openrouter.ai/api/v1', 'http://127.0.0.1:11434/v1', 'http://127.0.0.1:1234/v1//']
      .map((baseUrl) => modelSourceLabel(m, compatible(baseUrl)))).toEqual(names)
  })

  it.each([
    ['zh', ['example.com API', 'together.xyz API', 'internal.lab.io API', '本地服务 · 8000', '本地服务 · 8080', '本地服务 · 11434']],
    ['en', ['example.com API', 'together.xyz API', 'internal.lab.io API', 'Local service · 8000', 'Local service · 8080', 'Local service · 11434']],
  ] as const)('names any other remote compatible service by its host without api., www. or the port, and a local one by its port, in %s', (locale, names) => {
    const m = catalogFor(locale)
    expect([
      'https://api.example.com/v1', 'https://www.together.xyz:8443/v1', 'https://internal.lab.io',
      'http://localhost:8000/v1', 'http://[::1]:8080', 'http://127.0.0.1:11434/api',
    ].map((baseUrl) => modelSourceLabel(m, compatible(baseUrl)))).toEqual(names)
  })

  it('keys a profile the way Core does: by its provider, or by a compatible service\'s base URL without trailing slashes', () => {
    expect(profileKey({ provider: 'anthropic', baseUrl: 'https://api.anthropic.com' })).toBe('anthropic')
    expect(profileKey({ provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:11434/v1//' })).toBe('openai-compatible:http://127.0.0.1:11434/v1')
  })
})

describe('the name of a configured model', () => {
  it.each([['zh', '默认模型'], ['en', 'Default model']] as const)('names a model by its ID as configured, and a CLI\'s own default model as the default model, in %s', (locale, name) => {
    const m = catalogFor(locale)

    expect(modelEntryLabel(m, { model: 'opus' })).toBe('opus')
    expect(modelEntryLabel(m, { model: 'gpt-6.1' })).toBe('gpt-6.1')
    expect(modelEntryLabel(m, { model: '' })).toBe(name)
  })
})
