import { describe, expect, it } from 'vitest'
import type { HarnessModelSourceGroup } from '../../shared/contract.js'
import { catalogFor } from '../messages/catalog.js'
import { modelSourceLabel, profileKey } from './model-source.js'

const group = (source: HarnessModelSourceGroup['source'], fields: Partial<HarnessModelSourceGroup> = {}): HarnessModelSourceGroup => ({
  source, entries: ['m'], defaultEntry: 'm', ...fields,
})

describe('the name of a model source', () => {
  it.each(['zh', 'en'] as const)('names an official provider by its API, a compatible service by its host and port, and a subscription by its plan, in %s', (locale) => {
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
      'OpenAI API', 'Anthropic API', 'Google Gemini API', '127.0.0.1:11434',
      m.settings.model.subscriptions.claude.label, m.settings.model.subscriptions.codex.label,
    ])
    expect(names.slice(4)).toEqual(locale === 'zh' ? ['Claude 订阅', 'ChatGPT 订阅'] : names.slice(4))
  })

  it('keys a profile the way Core does: by its provider, or by a compatible service\'s base URL without trailing slashes', () => {
    expect(profileKey({ provider: 'anthropic', baseUrl: 'https://api.anthropic.com' })).toBe('anthropic')
    expect(profileKey({ provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:11434/v1//' })).toBe('openai-compatible:http://127.0.0.1:11434/v1')
  })
})
