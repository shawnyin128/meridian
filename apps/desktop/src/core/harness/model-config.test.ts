import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { HarnessModelSettings } from '../../shared/contract.js'
import { CallError } from '../call-error.js'
import type { CredentialVault } from './credential-vault.js'
import {
  createHarnessModelConfig, HARNESS_MODEL_CONFIG_FILENAME, HARNESS_MODELS_FILENAME, HARNESS_SUBSCRIPTION_FILENAME,
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
      models: [],
      defaultModel: null,
      sources: [],
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

  it('changes the revision each time the model list or the subscription choice is saved, and only then', async () => {
    const root = mkdtempSync(join(tmpdir(), 'meridian-model-config-'))
    const config = await createHarnessModelConfig(root, credentialVault())
    const revisions = [config.revision()]

    await config.update({ ...apiProfile, apiKey: 'anthropic-secret' })
    revisions.push(config.revision())
    config.updateSubscription({ cli: 'claude', model: '' })
    revisions.push(config.revision())
    config.updateSubscription({ cli: 'claude', model: '' })
    revisions.push(config.revision())
    await config.update({ ...apiProfile })
    revisions.push(config.revision())

    expect(new Set(revisions).size).toBe(5)
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
  ])('sets up no model source, not the API profile, while no model list is saved and the subscription file %s cannot be read', async (text, reason) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const root = mkdtempSync(join(tmpdir(), 'meridian-model-config-'))
    const config = await createHarnessModelConfig(root, credentialVault())
    await config.update({ ...apiProfile, apiKey: 'anthropic-secret' })
    rmSync(join(root, HARNESS_MODELS_FILENAME))
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


describe('model list', () => {
  it('runs the default of a saved model list while the subscription file older Apps read cannot be read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const root = mkdtempSync(join(tmpdir(), 'meridian-model-config-'))
    await (await createHarnessModelConfig(root, credentialVault())).update({ ...apiProfile, apiKey: 'anthropic-secret' })
    writeFileSync(join(root, HARNESS_SUBSCRIPTION_FILENAME), '{bad', 'utf8')

    const config = await createHarnessModelConfig(root, credentialVault())

    expect(config.settings()).toMatchObject({ configured: true, subscription: { error: 'invalid' } })
    expect(config.planModel().configured).toBe(true)
    expect(await config.runtime()).toMatchObject({ provider: 'anthropic', apiKey: 'anthropic-secret' })
    vi.restoreAllMocks()
  })

  const openai = { kind: 'api', provider: 'openai', protocol: 'responses', baseUrl: 'https://api.openai.com/v1', authentication: 'api-key' } as const
  const anthropic = { kind: 'api', provider: 'anthropic', protocol: 'messages', baseUrl: 'https://api.anthropic.com', authentication: 'api-key' } as const
  const local = { kind: 'api', provider: 'openai-compatible', protocol: 'chat-completions', baseUrl: 'http://127.0.0.1:8000/v1/', authentication: 'none' } as const
  const claude = { kind: 'cli', cli: 'claude' } as const
  const codex = { kind: 'cli', cli: 'codex' } as const
  const listOf = (root: string) => JSON.parse(readFileSync(join(root, HARNESS_MODELS_FILENAME), 'utf8')) as {
    schemaVersion: string; default: string | null; models: Array<Record<string, unknown>>
  }
  /** Each model of `settings`, as its profile or CLI, model ID, effort or null, and whether it can run. */
  const shown = (settings: HarnessModelSettings) => settings.models.map((entry) => [
    entry.source.kind === 'api' ? entry.source.profile : entry.source.cli, entry.model, entry.effort ?? null, entry.configured,
  ])

  it('starts from every API profile with a model and every CLI chosen or with a model, the model in use the default, and writes no list until one is saved', async () => {
    const root = mkdtempSync(join(tmpdir(), 'meridian-model-config-'))
    const older = await createHarnessModelConfig(root, credentialVault())
    await older.update({ ...apiProfile, apiKey: 'anthropic-secret' })
    await older.update({ provider: 'openai', protocol: 'responses', baseUrl: 'https://api.openai.com/v1', model: '', authentication: 'api-key', apiKey: 'openai-secret' })
    older.updateSubscription({ cli: 'codex', model: 'gpt-6.1-sol' })
    rmSync(join(root, HARNESS_MODELS_FILENAME))

    const config = await createHarnessModelConfig(root, credentialVault())

    expect(shown(config.settings())).toEqual([['anthropic', 'claude-api', null, true], ['codex', 'gpt-6.1-sol', null, true]])
    expect(config.settings().defaultModel).toBe('cli:codex')
    expect(await config.runtime()).toEqual({ source: 'cli', cli: 'codex', model: 'gpt-6.1-sol' })
    expect(existsSync(join(root, HARNESS_MODELS_FILENAME))).toBe(false)
  })

  it('adds models from several sources, a provider\'s models sharing its key, and makes the first one added the default', async () => {
    const root = mkdtempSync(join(tmpdir(), 'meridian-model-config-'))
    const config = await createHarnessModelConfig(root, credentialVault())

    await config.addModel({ source: { ...openai, apiKey: 'openai-secret' }, model: 'gpt-6.1', effort: 'high' })
    await config.addModel({ source: openai, model: 'gpt-5.5' })
    await config.addModel({ source: claude, model: 'opus', effort: 'max' })
    const saved = await config.addModel({ source: codex, model: '' })

    expect(shown(saved)).toEqual([
      ['openai', 'gpt-6.1', 'high', true], ['openai', 'gpt-5.5', null, true], ['claude', 'opus', 'max', true], ['codex', '', null, true],
    ])
    expect(saved.defaultModel).toBe(saved.models[0]!.id)
    expect(saved.profiles).toHaveLength(1)
    expect(await config.runtime({ model: saved.models[1]!.id })).toMatchObject({ provider: 'openai', model: 'gpt-5.5', apiKey: 'openai-secret' })
    expect(await config.runtime()).toMatchObject({ provider: 'openai', model: 'gpt-6.1', apiKey: 'openai-secret', effort: 'high' })
    expect(listOf(root)).toEqual({
      schemaVersion: 'meridian.harness-models.v1', default: saved.models[0]!.id,
      mirrored: { profile: 'openai', profileModel: 'gpt-6.1', cli: null, cliModel: '' },
      models: saved.models.map((entry) => ({
        id: entry.id, source: entry.source, model: entry.model, ...(entry.effort === undefined ? {} : { effort: entry.effort }),
      })),
    })
    expect(readFileSync(join(root, HARNESS_MODELS_FILENAME), 'utf8')).not.toContain('openai-secret')
  })

  it('keeps the profile and the subscription choice older Apps read in step with the default model', async () => {
    const root = mkdtempSync(join(tmpdir(), 'meridian-model-config-'))
    const config = await createHarnessModelConfig(root, credentialVault())
    await config.addModel({ source: { ...openai, apiKey: 'openai-secret' }, model: 'gpt-6.1' })
    await config.addModel({ source: { ...anthropic, apiKey: 'anthropic-secret' }, model: 'claude-opus-5-5' })
    const added = await config.addModel({ source: claude, model: 'opus' })
    const [gpt, opusApi, opusCli] = added.models.map((entry) => entry.id) as [string, string, string]
    const older = () => ({
      model: JSON.parse(readFileSync(join(root, HARNESS_MODEL_CONFIG_FILENAME), 'utf8')) as { activeProfile: string; profiles: Array<{ provider: string; model: string }> },
      subscription: existsSync(join(root, HARNESS_SUBSCRIPTION_FILENAME))
        ? (JSON.parse(readFileSync(join(root, HARNESS_SUBSCRIPTION_FILENAME), 'utf8')) as { active: string | null; clis: Record<string, { model: string }> })
        : null,
    })

    expect(older().model.activeProfile).toBe('openai')
    config.setDefaultModel(opusCli)
    expect(older().subscription).toMatchObject({ active: 'claude', clis: { claude: { model: 'opus' } } })
    expect(config.settings()).toMatchObject({ defaultModel: opusCli, subscription: { active: 'claude' } })
    config.setDefaultModel(opusApi)
    expect(older().model.activeProfile).toBe('anthropic')
    expect(older().model.profiles.find((profile) => profile.provider === 'anthropic')?.model).toBe('claude-opus-5-5')
    expect(older().subscription?.active).toBeNull()
    await config.updateModel({ id: opusApi, source: anthropic, model: 'claude-sonnet-5-5' })
    expect(older().model.profiles.find((profile) => profile.provider === 'anthropic')?.model).toBe('claude-sonnet-5-5')
    expect(config.planModel()).toMatchObject({ provider: 'Anthropic', name: 'claude-sonnet-5-5', configured: true, billable: true })
    config.setDefaultModel(gpt)
    expect(config.planModel()).toMatchObject({ provider: 'OpenAI', name: 'gpt-6.1' })
    expect(older().model.activeProfile).toBe('openai')
  })

  it('makes the first model left, in source order, the default once the default is removed, and has none once the list is empty', async () => {
    const root = mkdtempSync(join(tmpdir(), 'meridian-model-config-'))
    const config = await createHarnessModelConfig(root, credentialVault())
    await config.addModel({ source: codex, model: 'gpt-6.1-sol' })
    await config.addModel({ source: claude, model: 'opus' })
    const added = await config.addModel({ source: { ...openai, apiKey: 'openai-secret' }, model: 'gpt-6.1' })
    const [sol, opus, gpt] = added.models.map((entry) => entry.id) as [string, string, string]

    expect(config.removeModel(sol).defaultModel).toBe(gpt)
    expect(config.removeModel(gpt).defaultModel).toBe(opus)
    const empty = config.removeModel(opus)

    expect(empty).toMatchObject({ models: [], defaultModel: null, sources: [], configured: false })
    expect(config.planModel()).toMatchObject({ configured: false })
    await expect(config.runtime()).rejects.toMatchObject({ reason: 'no-model' })
  })

  it('makes the first model left that can run, in source order, the default once the default is removed, else the first model left', async () => {
    const root = mkdtempSync(join(tmpdir(), 'meridian-model-config-'))
    const config = await createHarnessModelConfig(root, credentialVault())
    await config.addModel({ source: codex, model: 'gpt-6.1-sol' })
    await config.addModel({ source: openai, model: 'gpt-6.1' })
    const added = await config.addModel({ source: claude, model: 'opus' })
    const [sol, gpt, opus] = added.models.map((entry) => entry.id) as [string, string, string]

    expect(config.removeModel(sol).defaultModel).toBe(opus)
    expect(config.removeModel(opus).defaultModel).toBe(gpt)
  })

  describe('a choice an older App made after the list was saved', () => {
    /** Writes the subscription choice the way an older App saves it. */
    const chooseCli = (root: string, active: 'claude' | 'codex' | null, models: { claude: string; codex: string }) => writeFileSync(
      join(root, HARNESS_SUBSCRIPTION_FILENAME),
      JSON.stringify({ schemaVersion: 'meridian.harness-subscription.v1', active, clis: { claude: { model: models.claude }, codex: { model: models.codex } } }),
    )
    /** Makes profile `key` active, running `model`, the way an older App saves a profile. */
    const chooseProfile = (root: string, key: string, model: string) => {
      const file = join(root, HARNESS_MODEL_CONFIG_FILENAME)
      const held = JSON.parse(readFileSync(file, 'utf8')) as { activeProfile: string; profiles: Array<{ provider: string; model: string }> }
      writeFileSync(file, JSON.stringify({
        ...held, activeProfile: key, profiles: held.profiles.map((profile) => (profile.provider === key ? { ...profile, model } : profile)),
      }))
    }
    /** A saved list: OpenAI's gpt-6.1 with a key and Claude's opus at the high effort, the default. */
    const savedList = async () => {
      const root = mkdtempSync(join(tmpdir(), 'meridian-model-config-'))
      const config = await createHarnessModelConfig(root, credentialVault())
      await config.addModel({ source: { ...openai, apiKey: 'openai-secret' }, model: 'gpt-6.1' })
      const added = await config.addModel({ source: claude, model: 'opus', effort: 'high' })
      config.setDefaultModel(added.models[1]!.id)
      return { root, gpt: added.models[0]!.id, opus: added.models[1]!.id }
    }

    it('adopts a subscription the older App chose, adding its model as the default when the list holds none', async () => {
      const { root, gpt, opus } = await savedList()
      chooseCli(root, 'codex', { claude: 'opus', codex: 'gpt-5.5' })

      const config = await createHarnessModelConfig(root, credentialVault())

      const settings = config.settings()
      const adopted = settings.models.find((entry) => entry.source.kind === 'cli' && entry.source.cli === 'codex')!
      expect(settings.models.map((entry) => entry.id)).toEqual([gpt, opus, adopted.id])
      expect(adopted).toMatchObject({ model: 'gpt-5.5', configured: true })
      expect(settings.defaultModel).toBe(adopted.id)
      expect(await config.runtime()).toEqual({ source: 'cli', cli: 'codex', model: 'gpt-5.5' })
      expect((await createHarnessModelConfig(root, credentialVault())).settings().defaultModel).toBe(adopted.id)
    })

    it('adopts the API model the older App made active, reusing the model the list holds', async () => {
      const { root, gpt } = await savedList()
      chooseProfile(root, 'openai', 'gpt-6.1')
      chooseCli(root, null, { claude: 'opus', codex: '' })

      const config = await createHarnessModelConfig(root, credentialVault())

      expect(config.settings()).toMatchObject({ defaultModel: gpt })
      expect(config.settings().models).toHaveLength(2)
      expect(await config.runtime()).toMatchObject({ provider: 'openai', model: 'gpt-6.1', apiKey: 'openai-secret' })
    })

    it('adopts a model the older App gave the active profile while a subscription stays chosen', async () => {
      const { root } = await savedList()
      chooseProfile(root, 'openai', 'gpt-5.5')

      const config = await createHarnessModelConfig(root, credentialVault())

      const chosen = config.settings().models.find((entry) => entry.id === config.settings().defaultModel)
      expect(chosen).toMatchObject({ source: { kind: 'api', profile: 'openai' }, model: 'gpt-5.5' })
    })

    it('keeps the default, and writes nothing, while the older Apps\' files say what the list last saved', async () => {
      const { root, opus } = await savedList()
      const before = readFileSync(join(root, HARNESS_MODELS_FILENAME))

      const config = await createHarnessModelConfig(root, credentialVault())

      expect(config.settings().defaultModel).toBe(opus)
      expect(readFileSync(join(root, HARNESS_MODELS_FILENAME)).equals(before)).toBe(true)
    })

    it('adopts nothing from an API profile the older App left without a model', async () => {
      const { root, opus } = await savedList()
      chooseProfile(root, 'openai', '')
      chooseCli(root, null, { claude: 'opus', codex: '' })

      const config = await createHarnessModelConfig(root, credentialVault())

      expect(config.settings().defaultModel).toBe(opus)
    })
  })

  it('groups the models by source, API providers first, compatible services by host, then Claude, then ChatGPT, each source picking the default when it holds it, else its first model', async () => {
    const root = mkdtempSync(join(tmpdir(), 'meridian-model-config-'))
    const config = await createHarnessModelConfig(root, credentialVault())
    await config.addModel({ source: codex, model: 'gpt-6.1-sol' })
    await config.addModel({ source: claude, model: 'opus' })
    await config.addModel({ source: claude, model: 'sonnet' })
    await config.addModel({ source: local, model: 'qwen' })
    await config.addModel({ source: { ...anthropic, apiKey: 'anthropic-secret' }, model: 'claude-opus-5-5' })
    const added = await config.addModel({ source: { ...openai, apiKey: 'openai-secret' }, model: 'gpt-6.1' })
    const id = (model: string) => added.models.find((entry) => entry.model === model)!.id
    const saved = config.setDefaultModel(id('sonnet'))

    expect(saved.sources).toEqual([
      { source: { kind: 'api', profile: 'openai' }, provider: 'openai', entries: [id('gpt-6.1')], defaultEntry: id('gpt-6.1') },
      { source: { kind: 'api', profile: 'anthropic' }, provider: 'anthropic', entries: [id('claude-opus-5-5')], defaultEntry: id('claude-opus-5-5') },
      {
        source: { kind: 'api', profile: 'openai-compatible:http://127.0.0.1:8000/v1' }, provider: 'openai-compatible', host: '127.0.0.1:8000',
        entries: [id('qwen')], defaultEntry: id('qwen'),
      },
      { source: claude, entries: [id('opus'), id('sonnet')], defaultEntry: id('sonnet') },
      { source: codex, entries: [id('gpt-6.1-sol')], defaultEntry: id('gpt-6.1-sol') },
    ])
  })

  it('makes a switch to a source pick the default when it can run, else the source\'s first model that can, else its first', async () => {
    const root = mkdtempSync(join(tmpdir(), 'meridian-model-config-'))
    const config = await createHarnessModelConfig(root, credentialVault())
    await config.addModel({ source: openai, model: 'gpt-6.1' })
    await config.addModel({ source: openai, model: 'gpt-5.5' })
    await config.addModel({ source: claude, model: 'opus' })
    const added = await config.addModel({ source: claude, model: 'sonnet' })
    const id = (model: string) => added.models.find((entry) => entry.model === model)!.id
    const sourceOf = (settings: HarnessModelSettings, kind: 'api' | 'cli') => settings.sources.find((group) => group.source.kind === kind)!

    const unrunnable = config.setDefaultModel(id('gpt-5.5'))
    expect(sourceOf(unrunnable, 'api').defaultEntry).toBe(id('gpt-6.1'))
    const runnable = await config.updateModel({ id: id('gpt-5.5'), source: { ...openai, apiKey: 'openai-secret' }, model: 'gpt-5.5' })
    expect(sourceOf(runnable, 'api').defaultEntry).toBe(id('gpt-5.5'))
    expect(sourceOf(runnable, 'cli').defaultEntry).toBe(id('opus'))
    expect(sourceOf(config.setDefaultModel(id('sonnet')), 'cli').defaultEntry).toBe(id('sonnet'))
  })

  it('runs a chat\'s chosen model at the chat\'s effort, at the model\'s own once that model does not take it, and on the default once its model is gone', async () => {
    const root = mkdtempSync(join(tmpdir(), 'meridian-model-config-'))
    const config = await createHarnessModelConfig(root, credentialVault())
    await config.addModel({ source: claude, model: 'opus', effort: 'high' })
    const added = await config.addModel({ source: codex, model: 'gpt-6.1-sol', effort: 'low' })
    const [opus, sol] = added.models.map((entry) => entry.id) as [string, string]

    expect(await config.runtime({ model: sol })).toEqual({ source: 'cli', cli: 'codex', model: 'gpt-6.1-sol', effort: 'low' })
    expect(await config.runtime({ model: sol, effort: 'xhigh' })).toMatchObject({ cli: 'codex', effort: 'xhigh' })
    expect(await config.runtime({ model: opus, effort: 'ultra' })).toMatchObject({ cli: 'claude', effort: 'high' })
    expect(config.modelOf({ model: sol })).toBe(sol)
    config.removeModel(sol)
    expect(config.modelOf({ model: sol })).toBe(opus)
    expect(await config.runtime({ model: sol, effort: 'xhigh' })).toEqual({ source: 'cli', cli: 'claude', model: 'opus', effort: 'high' })
    expect(config.accepts(opus, 'max')).toBe(true)
    expect(config.accepts(opus, 'minimal')).toBe(false)
    expect(config.accepts(sol)).toBe(false)
  })

  it.each([
    ['an API model without a model ID', { source: openai, model: '' }, 'invalid'],
    ['an effort its provider does not take', { source: anthropic, model: 'claude-opus-5-5', effort: 'none' }, 'invalid'],
    ['an effort Codex runs cannot use', { source: codex, model: '', effort: 'ultra' }, 'invalid'],
    ['an effort an OpenAI-compatible service is not offered', { source: local, model: 'qwen', effort: 'low' }, 'invalid'],
  ] as const)('refuses to add %s and keeps nothing', async (_, params, reason) => {
    const root = mkdtempSync(join(tmpdir(), 'meridian-model-config-'))
    const config = await createHarnessModelConfig(root, credentialVault())

    await expect(config.addModel(params)).rejects.toMatchObject({ reason })
    expect(existsSync(join(root, HARNESS_MODELS_FILENAME))).toBe(false)
    expect(existsSync(join(root, HARNESS_MODEL_CONFIG_FILENAME))).toBe(false)
  })

  it('refuses to change, remove or make the default a model the list does not hold', async () => {
    const root = mkdtempSync(join(tmpdir(), 'meridian-model-config-'))
    const config = await createHarnessModelConfig(root, credentialVault())

    await expect(config.updateModel({ id: 'gone', source: claude, model: '' })).rejects.toMatchObject({ reason: 'not-found' })
    expect(() => config.removeModel('gone')).toThrow(expect.objectContaining({ reason: 'not-found' }))
    expect(() => config.setDefaultModel('gone')).toThrow(expect.objectContaining({ reason: 'not-found' }))
  })

  it('reads the list record by record: one it cannot read is reported on its own, the others keep showing, and it is written back as it was', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const root = mkdtempSync(join(tmpdir(), 'meridian-model-config-'))
    const unknownSource = { id: 'mistral-1', source: { kind: 'api', profile: 'mistral' }, model: 'large' }
    const unknownEffort = { id: 'opus-ludicrous', source: { kind: 'cli', cli: 'claude' }, model: 'opus', effort: 'ludicrous' }
    const broken = { id: 7 }
    writeFileSync(join(root, HARNESS_MODELS_FILENAME), JSON.stringify({
      schemaVersion: 'meridian.harness-models.v1', default: 'sol', shown: { compact: true },
      models: [
        unknownSource,
        { id: 'sol', source: { kind: 'cli', cli: 'codex' }, model: 'gpt-6.1-sol', effort: 'medium', pinned: true },
        unknownEffort,
        broken,
        { id: 'gemini-cli', source: { kind: 'cli', cli: 'gemini' }, model: '' },
      ],
    }), 'utf8')

    const config = await createHarnessModelConfig(root, credentialVault())

    expect(shown(config.settings())).toEqual([['codex', 'gpt-6.1-sol', 'medium', true]])
    expect(config.settings()).toMatchObject({ defaultModel: 'sol', modelsError: 'newer-version' })
    expect(await config.runtime()).toEqual({ source: 'cli', cli: 'codex', model: 'gpt-6.1-sol', effort: 'medium' })
    await config.addModel({ source: claude, model: 'sonnet' })
    config.setDefaultModel('sol')
    const written = listOf(root) as unknown as Record<string, unknown> & { models: unknown[] }
    expect(written['shown']).toEqual({ compact: true })
    expect(written.models.slice(0, 5)).toEqual([
      unknownSource,
      { id: 'sol', source: { kind: 'cli', cli: 'codex' }, model: 'gpt-6.1-sol', effort: 'medium', pinned: true },
      unknownEffort,
      broken,
      { id: 'gemini-cli', source: { kind: 'cli', cli: 'gemini' }, model: '' },
    ])
    expect(log).toHaveBeenCalled()
    log.mockRestore()
  })

  it.each([
    ['{bad', 'invalid'],
    [JSON.stringify({ schemaVersion: 'meridian.harness-models.v2', models: [] }), 'newer-version'],
    [JSON.stringify({ schemaVersion: 'meridian.harness-models.v1', models: {} }), 'invalid'],
  ])('keeps the profiles showing while the list file %s cannot be read, runs nothing, and starts the list again once a model is added', async (text, reason) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const root = mkdtempSync(join(tmpdir(), 'meridian-model-config-'))
    await (await createHarnessModelConfig(root, credentialVault())).update({ ...apiProfile, apiKey: 'anthropic-secret' })
    writeFileSync(join(root, HARNESS_MODELS_FILENAME), text, 'utf8')

    const config = await createHarnessModelConfig(root, credentialVault())

    expect(config.settings()).toMatchObject({ models: [], modelsError: reason })
    expect(config.settings().profiles).toContainEqual(expect.objectContaining({ provider: 'anthropic', apiKeyLastFour: 'cret' }))
    await expect(config.runtime()).rejects.toMatchObject({ reason })
    const added = await config.addModel({ source: claude, model: 'opus' })
    expect(added).not.toHaveProperty('modelsError')
    expect(await config.runtime()).toEqual({ source: 'cli', cli: 'claude', model: 'opus' })
    log.mockRestore()
  })

  it('reads no effort from the subscription file, where an older App would drop it', async () => {
    const root = mkdtempSync(join(tmpdir(), 'meridian-model-config-'))
    writeFileSync(join(root, HARNESS_SUBSCRIPTION_FILENAME), JSON.stringify({
      schemaVersion: 'meridian.harness-subscription.v1', active: 'codex', clis: { codex: { model: 'gpt-6.1-sol', effort: 'high' } },
    }), 'utf8')

    const config = await createHarnessModelConfig(root, credentialVault())

    expect(shown(config.settings())).toEqual([['codex', 'gpt-6.1-sol', null, true]])
    expect(await config.runtime()).toEqual({ source: 'cli', cli: 'codex', model: 'gpt-6.1-sol' })
  })
})
