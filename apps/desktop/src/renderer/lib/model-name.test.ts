import { describe, expect, it } from 'vitest'
import { modelDisplayName, modelName } from './model-name.js'

describe('the name a model shows by', () => {
  it('writes a Claude model id the way Anthropic names the model', () => {
    expect(modelDisplayName('claude-opus-5-5[1m]')).toBe('Claude Opus 5.5')
    expect(modelDisplayName('claude-opus-5-5')).toBe('Claude Opus 5.5')
    expect(modelDisplayName('claude-sonnet-4-20250514')).toBe('Claude Sonnet 4')
    expect(modelDisplayName('claude-3-5-sonnet-20241022')).toBe('Claude Sonnet 3.5')
    expect(modelDisplayName('opus')).toBe('Claude Opus')
    expect(modelDisplayName('fable')).toBe('Claude Fable')
  })

  it('writes a GPT model id with its version and size, without a release name', () => {
    expect(modelDisplayName('gpt-6.1-sol')).toBe('GPT-6.1')
    expect(modelDisplayName('gpt-5.5')).toBe('GPT-5.5')
    expect(modelDisplayName('gpt-5-mini')).toBe('GPT-5 mini')
    expect(modelDisplayName('gpt-5.1-codex')).toBe('GPT-5.1 Codex')
  })

  it('writes a Gemini model id with its version and tier', () => {
    expect(modelDisplayName('gemini-2.5-pro')).toBe('Gemini 2.5 Pro')
    expect(modelDisplayName('gemini-2.5-flash-lite')).toBe('Gemini 2.5 Flash-Lite')
  })

  it('shows any other id as it is', () => {
    expect(modelDisplayName('o3')).toBe('o3')
    expect(modelDisplayName('local-model')).toBe('local-model')
    expect(modelDisplayName('qwen2.5-coder:32b')).toBe('qwen2.5-coder:32b')
  })

  it('names an answer by its model, or by its CLI when the CLI ran its own default and named none', () => {
    expect(modelName({ route: 'subscription', cli: 'claude', id: 'claude-opus-5-5[1m]' })).toBe('Claude Opus 5.5')
    expect(modelName({ route: 'subscription', cli: 'claude' })).toBe('Claude Code')
    expect(modelName({ route: 'subscription', cli: 'codex' })).toBe('Codex')
    expect(modelName({ route: 'api', id: 'gpt-5.5' })).toBe('GPT-5.5')
  })
})
