import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { CallError } from '../call-error.js'
import type { CredentialVault } from './credential-vault.js'
import {
  createHarnessModelConfig, HARNESS_MODEL_CONFIG_FILENAME, HARNESS_SUBSCRIPTION_FILENAME,
} from './model-config.js'

const credentialVault = (): CredentialVault => ({
  seal: async (secret) => Array.from(secret).reverse().join(''),
  open: async (ciphertext) => ({ secret: Array.from(ciphertext).reverse().join('') }),
})

describe('Harness model configuration', () => {
  it('stores only an encrypted credential and returns only its last four characters', async () => {
    const root = mkdtempSync(join(tmpdir(), 'meridian-model-config-'))
    const config = await createHarnessModelConfig(root, credentialVault())
    const initialProfile = {
      provider: 'openai',
      protocol: 'responses',
      baseUrl: 'https://api.openai.com/v1',
      model: '',
      authentication: 'api-key',
      apiKeyConfigured: false,
      configured: false,
    }
    expect(config.settings()).toEqual({
      ...initialProfile,
      profiles: [initialProfile],
      subscription: { active: null, models: { claude: '', codex: '' } },
    })

    const saved = await config.update({
      provider: 'openai', protocol: 'responses',
      baseUrl: 'https://api.openai.com/v1', model: 'model-a',
      authentication: 'api-key', apiKey: 'secret-value',
    })
    expect(saved).toEqual(expect.objectContaining({
      baseUrl: 'https://api.openai.com/v1', model: 'model-a',
      apiKeyConfigured: true, apiKeyLastFour: 'alue', configured: true,
    }))
    expect(saved).not.toHaveProperty('apiKey')
    expect(await config.runtime()).toEqual(expect.objectContaining({ apiKey: 'secret-value' }))
    const disk = readFileSync(join(root, HARNESS_MODEL_CONFIG_FILENAME), 'utf8')
    expect(disk).not.toContain('secret-value')
    expect(disk).toContain('eulav-terces')
    if (process.platform !== 'win32') {
      expect(statSync(root).mode & 0o777).toBe(0o700)
      expect(statSync(join(root, HARNESS_MODEL_CONFIG_FILENAME)).mode & 0o777).toBe(0o600)
    }
  })

  it('retains or clears an existing key explicitly and supports no-auth local endpoints', async () => {
    const root = mkdtempSync(join(tmpdir(), 'meridian-model-config-'))
    const config = await createHarnessModelConfig(root, credentialVault())
    await config.update({
      provider: 'openai-compatible', protocol: 'chat-completions',
      baseUrl: 'http://127.0.0.1:8000/v1', model: 'local',
      authentication: 'api-key', apiKey: 'keep-me',
    })
    await config.update({
      provider: 'openai-compatible', protocol: 'chat-completions',
      baseUrl: 'http://127.0.0.1:8000/v1', model: 'local-2',
      authentication: 'api-key',
    })
    expect(await config.runtime()).toMatchObject({ apiKey: 'keep-me', protocol: 'chat-completions' })
    expect((await config.update({
      provider: 'openai-compatible', protocol: 'chat-completions',
      baseUrl: 'http://127.0.0.1:8000/v1', model: 'local-2',
      authentication: 'api-key', clearApiKey: true,
    })).configured).toBe(false)
    expect((await config.update({
      provider: 'openai-compatible', protocol: 'chat-completions',
      baseUrl: 'http://127.0.0.1:8000/v1', model: 'local-2',
      authentication: 'none',
    })).configured).toBe(true)
    expect(config.planModel()).toMatchObject({ configured: true, billable: false })
  })

  it('keeps remote compatible services behind the billable cost confirmation', async () => {
    const root = mkdtempSync(join(tmpdir(), 'meridian-model-config-'))
    const config = await createHarnessModelConfig(root, credentialVault())
    await config.update({
      provider: 'openai-compatible', protocol: 'chat-completions',
      baseUrl: 'https://provider.example/v1', model: 'remote-model',
      authentication: 'api-key', apiKey: 'remote-secret',
    })

    expect(config.planModel()).toMatchObject({ configured: true, billable: true })
  })

  it('surfaces malformed saved configuration without preventing settings repair', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const root = mkdtempSync(join(tmpdir(), 'meridian-model-config-'))
    writeFileSync(join(root, HARNESS_MODEL_CONFIG_FILENAME), '{bad', 'utf8')
    const config = await createHarnessModelConfig(root, credentialVault())
    expect(config.settings()).toMatchObject({ configured: false, error: 'invalid' })
    expect(await config.update({
      provider: 'openai-compatible', protocol: 'responses',
      baseUrl: 'http://127.0.0.1:8000/v1', model: 'local',
      authentication: 'none',
    })).not.toHaveProperty('error')
    vi.restoreAllMocks()
  })

  it('names a configuration a newer App saved as newer-version', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const root = mkdtempSync(join(tmpdir(), 'meridian-model-config-'))
    writeFileSync(join(root, HARNESS_MODEL_CONFIG_FILENAME), JSON.stringify({ schemaVersion: 'meridian.harness-model.v99' }), 'utf8')
    const config = await createHarnessModelConfig(root, credentialVault())
    expect(config.settings().error).toBe('newer-version')
    vi.restoreAllMocks()
  })

  it('keeps provider and compatible-endpoint credentials in independent profiles', async () => {
    const root = mkdtempSync(join(tmpdir(), 'meridian-model-config-'))
    const config = await createHarnessModelConfig(root, credentialVault())
    await config.update({
      provider: 'openai', protocol: 'responses',
      baseUrl: 'https://api.openai.com/v1', model: 'gpt-test',
      authentication: 'api-key', apiKey: 'openai-aaaa',
    })
    await config.update({
      provider: 'anthropic', protocol: 'messages',
      baseUrl: 'https://api.anthropic.com', model: 'claude-test',
      authentication: 'api-key', apiKey: 'anthropic-bbbb',
    })
    expect(await config.update({
      provider: 'openai', protocol: 'responses',
      baseUrl: 'https://api.openai.com/v1', model: 'gpt-test',
      authentication: 'api-key',
    })).toMatchObject({
      provider: 'openai', apiKeyConfigured: true, apiKeyLastFour: 'aaaa', configured: true,
    })
    expect(await config.runtime()).toMatchObject({ apiKey: 'openai-aaaa' })
    expect(await config.update({
      provider: 'anthropic', protocol: 'messages',
      baseUrl: 'https://api.anthropic.com', model: 'claude-test',
      authentication: 'api-key',
    })).toMatchObject({
      provider: 'anthropic', apiKeyConfigured: true, apiKeyLastFour: 'bbbb', configured: true,
    })
    expect(await config.runtime()).toMatchObject({ apiKey: 'anthropic-bbbb' })

    await config.update({
      provider: 'openai-compatible', protocol: 'chat-completions',
      baseUrl: 'https://first.example/v1', model: 'first-model',
      authentication: 'api-key', apiKey: 'first-1111',
    })
    await config.update({
      provider: 'openai-compatible', protocol: 'chat-completions',
      baseUrl: 'https://second.example/v1', model: 'second-model',
      authentication: 'api-key', apiKey: 'second-2222',
    })
    const restored = await config.update({
      provider: 'openai-compatible', protocol: 'chat-completions',
      baseUrl: 'https://first.example/v1', model: 'first-model',
      authentication: 'api-key',
    })
    expect(restored).toMatchObject({ apiKeyConfigured: true, apiKeyLastFour: '1111' })
    expect(restored.profiles).toHaveLength(4)
    expect(await config.runtime()).toMatchObject({ apiKey: 'first-1111' })

    const disk = readFileSync(join(root, HARNESS_MODEL_CONFIG_FILENAME), 'utf8')
    expect(disk).not.toContain('openai-aaaa')
    expect(disk).not.toContain('anthropic-bbbb')
    expect(disk).not.toContain('first-1111')
    expect(disk).not.toContain('second-2222')
  })

  it.each([
    ['meridian.harness-model.v1', 'openai', 'responses', 'https://api.openai.com/v1'],
    ['meridian.harness-model.v2', 'openai-compatible', 'responses', 'https://provider.example/v1'],
    ['meridian.harness-model.v3', 'openai-compatible', 'chat-completions', 'https://provider.example/v1'],
  ])('migrates %s plaintext credentials immediately', async (schemaVersion, provider, protocol, baseUrl) => {
    const root = mkdtempSync(join(tmpdir(), 'meridian-model-config-'))
    const file = join(root, HARNESS_MODEL_CONFIG_FILENAME)
    writeFileSync(file, JSON.stringify({
      schemaVersion, provider, protocol, baseUrl, model: 'provider-model',
      authentication: 'api-key', apiKey: 'legacy-secret',
    }), 'utf8')

    const config = await createHarnessModelConfig(root, credentialVault())
    expect(config.settings()).toMatchObject({ configured: true, apiKeyLastFour: 'cret' })
    expect(await config.runtime()).toMatchObject({ apiKey: 'legacy-secret' })
    expect(readFileSync(file, 'utf8')).not.toContain('legacy-secret')
  })

  it('migrates the prior encrypted single profile without decrypting it', async () => {
    const root = mkdtempSync(join(tmpdir(), 'meridian-model-config-'))
    const file = join(root, HARNESS_MODEL_CONFIG_FILENAME)
    writeFileSync(file, JSON.stringify({
      schemaVersion: 'meridian.harness-model.v4', provider: 'anthropic', protocol: 'messages',
      baseUrl: 'https://api.anthropic.com', model: 'claude-test', authentication: 'api-key',
      credential: {
        storage: 'electron-safe-storage.v1', ciphertext: 'terces-detpyrcne', lastFour: 'cret',
      },
    }), 'utf8')

    const config = await createHarnessModelConfig(root, credentialVault())
    expect(config.settings()).toMatchObject({
      provider: 'anthropic', configured: true, apiKeyLastFour: 'cret',
    })
    expect(await config.runtime()).toMatchObject({ apiKey: 'encrypted-secret' })
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({
      schemaVersion: 'meridian.harness-model.v5',
      activeProfile: 'anthropic',
      profiles: [{ provider: 'anthropic' }],
    })
  })

  it('removes a legacy plaintext key if secure storage is unavailable', async () => {
    const root = mkdtempSync(join(tmpdir(), 'meridian-model-config-'))
    const file = join(root, HARNESS_MODEL_CONFIG_FILENAME)
    writeFileSync(file, JSON.stringify({
      schemaVersion: 'meridian.harness-model.v3', provider: 'openai', protocol: 'responses',
      baseUrl: 'https://api.openai.com/v1', model: 'gpt-test',
      authentication: 'api-key', apiKey: 'legacy-secret',
    }), 'utf8')
    const unavailable: CredentialVault = {
      seal: async () => { throw new CallError('key-unsaved', 'secure storage unavailable') },
      open: async () => { throw new CallError('key-unreadable', 'secure storage unavailable') },
    }
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})

    const config = await createHarnessModelConfig(root, unavailable)
    expect(config.settings()).toMatchObject({ configured: false, apiKeyConfigured: false })
    expect(config.settings().error).toBe('key-unsaved')
    expect(log).toHaveBeenCalledWith(expect.stringContaining('已从明文配置移除'))
    log.mockRestore()
    expect(readFileSync(file, 'utf8')).not.toContain('legacy-secret')
  })
})

const apiProfile = {
  provider: 'anthropic', protocol: 'messages', baseUrl: 'https://api.anthropic.com',
  model: 'claude-api', authentication: 'api-key',
} as const

describe('subscription choice', () => {
  it('keeps the subscription choice in its own file and leaves the API profiles byte for byte', async () => {
    const root = mkdtempSync(join(tmpdir(), 'meridian-model-config-'))
    const config = await createHarnessModelConfig(root, credentialVault())
    await config.update({ ...apiProfile, apiKey: 'anthropic-secret' })
    const profiles = readFileSync(join(root, HARNESS_MODEL_CONFIG_FILENAME))

    const saved = await config.updateSubscription({ cli: 'claude', model: '' })

    expect(readFileSync(join(root, HARNESS_MODEL_CONFIG_FILENAME)).equals(profiles)).toBe(true)
    expect(JSON.parse(readFileSync(join(root, HARNESS_SUBSCRIPTION_FILENAME), 'utf8'))).toEqual({
      schemaVersion: 'meridian.harness-subscription.v1',
      active: 'claude',
      clis: { claude: { model: '' }, codex: { model: '' } },
    })
    expect(saved).toMatchObject({
      provider: 'anthropic', model: 'claude-api', apiKeyLastFour: 'cret', configured: true,
      subscription: { active: 'claude', models: { claude: '', codex: '' } },
    })
    expect(await config.runtime()).toEqual({ source: 'cli', cli: 'claude' })
    expect(config.planModel()).toEqual({
      provider: 'Claude 订阅', name: '默认模型', configured: true, billable: false, cli: 'claude',
    })

    const reopened = await createHarnessModelConfig(root, credentialVault())
    expect(reopened.settings().subscription).toEqual({ active: 'claude', models: { claude: '', codex: '' } })
    expect(readFileSync(join(root, HARNESS_MODEL_CONFIG_FILENAME)).equals(profiles)).toBe(true)
  })

  it('runs the model picked for the CLI and keeps each CLI its own model', async () => {
    const root = mkdtempSync(join(tmpdir(), 'meridian-model-config-'))
    const config = await createHarnessModelConfig(root, credentialVault())
    await config.updateSubscription({ cli: 'claude', model: 'opus' })
    const saved = await config.updateSubscription({ cli: 'codex', model: 'gpt-5-codex' })

    expect(saved.subscription).toEqual({ active: 'codex', models: { claude: 'opus', codex: 'gpt-5-codex' } })
    expect(await config.runtime()).toEqual({ source: 'cli', cli: 'codex', model: 'gpt-5-codex' })
    expect(config.planModel()).toMatchObject({ provider: 'ChatGPT 订阅', name: 'gpt-5-codex', configured: true, cli: 'codex' })
  })

  it('makes a saved API profile the model source again and keeps each CLI its model', async () => {
    const root = mkdtempSync(join(tmpdir(), 'meridian-model-config-'))
    const config = await createHarnessModelConfig(root, credentialVault())
    await config.updateSubscription({ cli: 'codex', model: 'gpt-5-codex' })

    const saved = await config.update({ ...apiProfile, apiKey: 'anthropic-secret' })

    expect(saved.subscription).toEqual({ active: null, models: { claude: '', codex: 'gpt-5-codex' } })
    expect(await config.runtime()).toMatchObject({ provider: 'anthropic', apiKey: 'anthropic-secret' })
    expect(config.planModel()).toMatchObject({ provider: 'Anthropic', name: 'claude-api' })
    expect(config.planModel()).not.toHaveProperty('cli')
    expect((await createHarnessModelConfig(root, credentialVault())).settings().subscription.active).toBeNull()
  })

  it('changes the subscription revision each time the subscription choice is saved, and only then', async () => {
    const root = mkdtempSync(join(tmpdir(), 'meridian-model-config-'))
    const config = await createHarnessModelConfig(root, credentialVault())
    const revisions = [config.subscriptionRevision()]

    await config.update({ ...apiProfile, apiKey: 'anthropic-secret' })
    revisions.push(config.subscriptionRevision())
    config.updateSubscription({ cli: 'claude', model: '' })
    revisions.push(config.subscriptionRevision())
    config.updateSubscription({ cli: 'claude', model: '' })
    revisions.push(config.subscriptionRevision())
    await config.update({ ...apiProfile })
    revisions.push(config.subscriptionRevision())

    expect(revisions[1]).toBe(revisions[0])
    expect(new Set(revisions.slice(1)).size).toBe(4)
  })

  it('writes no subscription file while only API profiles are saved', async () => {
    const root = mkdtempSync(join(tmpdir(), 'meridian-model-config-'))
    const config = await createHarnessModelConfig(root, credentialVault())
    await config.update({ ...apiProfile, apiKey: 'anthropic-secret' })

    expect(existsSync(join(root, HARNESS_SUBSCRIPTION_FILENAME))).toBe(false)
    expect(await config.runtime()).toMatchObject({ provider: 'anthropic' })
  })

  it('reads a subscription file with keys a newer App added and CLIs it does not know', async () => {
    const root = mkdtempSync(join(tmpdir(), 'meridian-model-config-'))
    writeFileSync(join(root, HARNESS_SUBSCRIPTION_FILENAME), JSON.stringify({
      schemaVersion: 'meridian.harness-subscription.v1', active: 'codex', usage: { shown: true },
      clis: { codex: { model: 'gpt-5-codex', effort: 'high' }, gemini: { model: 'gemini-pro' } },
    }), 'utf8')

    const config = await createHarnessModelConfig(root, credentialVault())

    expect(config.settings().subscription).toEqual({ active: 'codex', models: { claude: '', codex: 'gpt-5-codex' } })
    expect(await config.runtime()).toEqual({ source: 'cli', cli: 'codex', model: 'gpt-5-codex' })
  })

  it.each([
    ['{bad', 'invalid'],
    [JSON.stringify({ schemaVersion: 'meridian.harness-subscription.v1', active: 'codex', clis: { codex: { model: '--yolo' } } }), 'invalid'],
    [JSON.stringify({ schemaVersion: 'meridian.harness-subscription.v1', active: 'gemini', clis: {} }), 'newer-version'],
    [JSON.stringify({ schemaVersion: 'meridian.harness-subscription.v2', active: 'claude', clis: {} }), 'newer-version'],
  ])('sets up no model source, not the API profile, while the subscription file %s cannot be read', async (text, reason) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const root = mkdtempSync(join(tmpdir(), 'meridian-model-config-'))
    const config = await createHarnessModelConfig(root, credentialVault())
    await config.update({ ...apiProfile, apiKey: 'anthropic-secret' })
    writeFileSync(join(root, HARNESS_SUBSCRIPTION_FILENAME), text, 'utf8')

    const reopened = await createHarnessModelConfig(root, credentialVault())

    expect(reopened.settings()).toMatchObject({ configured: true, subscription: { active: null, error: reason } })
    expect(reopened.settings()).not.toHaveProperty('error')
    expect(reopened.planModel().configured).toBe(false)
    await expect(reopened.runtime()).rejects.toThrow()
    expect((await reopened.updateSubscription({ cli: 'claude', model: '' })).subscription)
      .toEqual({ active: 'claude', models: { claude: '', codex: '' } })
    vi.restoreAllMocks()
  })
})
