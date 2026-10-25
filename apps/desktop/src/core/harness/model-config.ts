import { chmodSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type {
  CallFailure, HarnessCli, HarnessCliModel, HarnessModelProfile, HarnessModelProtocol, HarnessModelProvider,
  HarnessModelSettings, HarnessModelSettingsUpdate, HarnessSubscriptionSettings, HarnessUpdateSubscriptionParams,
} from '../../shared/contract.js'
import {
  HarnessCliSchema, HarnessModelSettingsUpdateSchema, HarnessSubscriptionModelSchema,
  HarnessUpdateSubscriptionParamsSchema,
} from '../../shared/contract.js'
import { CallError, callFailure } from '../call-error.js'
import { writeJson } from '../vault/writer.js'
import type { CredentialVault } from './credential-vault.js'

export const HARNESS_MODEL_CONFIG_FILENAME = 'harness-model.json'
const CONFIG_VERSION = 'meridian.harness-model.v5'
const LEGACY_CONFIG_VERSIONS = [
  'meridian.harness-model.v1',
  'meridian.harness-model.v2',
  'meridian.harness-model.v3',
  'meridian.harness-model.v4',
] as const
const CREDENTIAL_STORAGE = 'electron-safe-storage.v1'
export const HARNESS_SUBSCRIPTION_FILENAME = 'harness-subscription.json'
const SUBSCRIPTION_VERSION = 'meridian.harness-subscription.v1'
const SUBSCRIPTION_LABELS: Record<HarnessCli, string> = { claude: 'Claude 订阅', codex: 'ChatGPT 订阅' }

const PROVIDERS: Record<HarnessModelProvider, {
  baseUrl: string
  protocol: HarnessModelProtocol
  authentication: 'api-key' | 'none'
  label: string
}> = {
  openai: {
    baseUrl: 'https://api.openai.com/v1', protocol: 'responses',
    authentication: 'api-key', label: 'OpenAI',
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com', protocol: 'messages',
    authentication: 'api-key', label: 'Anthropic',
  },
  'google-gemini': {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    protocol: 'generate-content', authentication: 'api-key', label: 'Google Gemini',
  },
  'openai-compatible': {
    baseUrl: 'http://127.0.0.1:11434/v1', protocol: 'responses',
    authentication: 'none', label: 'OpenAI 兼容 API',
  },
}

type StoredCredential = {
  storage: typeof CREDENTIAL_STORAGE
  ciphertext: string
  lastFour: string
}

type PrivateModelProfile = {
  provider: HarnessModelProvider
  protocol: HarnessModelProtocol
  baseUrl: string
  model: string
  authentication: 'api-key' | 'none'
  credential?: StoredCredential
}

type PrivateModelConfig = {
  schemaVersion: typeof CONFIG_VERSION
  activeProfile: string
  profiles: PrivateModelProfile[]
}

type SubscriptionChoice = Omit<HarnessSubscriptionSettings, 'error'>

type SubscriptionRecord = {
  schemaVersion: typeof SUBSCRIPTION_VERSION
  active: HarnessCli | null
  clis: Record<HarnessCli, { model: string }>
}

const noSubscription = (): SubscriptionChoice => ({ active: null, models: { claude: '', codex: '' } })

type LoadedConfig = {
  value: PrivateModelConfig
  legacyApiKey?: string
  migrated?: boolean
}

export type HarnessRuntimeModel = {
  provider: HarnessModelProvider
  protocol: HarnessModelProtocol
  baseUrl: string
  model: string
  authentication: 'api-key' | 'none'
  apiKey?: string
}

const normalizeBaseUrl = (baseUrl: string) => baseUrl.replace(/\/+$/, '')

const isLocalNoAuth = (profile: HarnessModelProfile) => {
  if (profile.provider !== 'openai-compatible' || profile.authentication !== 'none') return false
  const hostname = new URL(profile.baseUrl).hostname
  return ['localhost', '127.0.0.1', '[::1]'].includes(hostname)
}

const profileKey = (provider: HarnessModelProvider, baseUrl: string) => (
  provider === 'openai-compatible'
    ? `${provider}:${normalizeBaseUrl(baseUrl)}`
    : provider
)

const defaultProfile = (): PrivateModelProfile => ({
  provider: 'openai',
  protocol: PROVIDERS.openai.protocol,
  baseUrl: PROVIDERS.openai.baseUrl,
  model: '',
  authentication: PROVIDERS.openai.authentication,
})

const defaults = (): PrivateModelConfig => {
  const profile = defaultProfile()
  return {
    schemaVersion: CONFIG_VERSION,
    activeProfile: profileKey(profile.provider, profile.baseUrl),
    profiles: [profile],
  }
}

const lastFourOf = (secret: string) => Array.from(secret).slice(-4).join('')

const activeProfile = (config: PrivateModelConfig): PrivateModelProfile => (
  config.profiles.find((profile) => (
    profileKey(profile.provider, profile.baseUrl) === config.activeProfile
  )) ?? config.profiles[0]!
)

const publicProfile = (profile: PrivateModelProfile): HarnessModelProfile => {
  const apiKeyConfigured = profile.credential !== undefined
  return {
    provider: profile.provider,
    protocol: profile.protocol,
    baseUrl: profile.baseUrl,
    model: profile.model,
    authentication: profile.authentication,
    apiKeyConfigured,
    ...(profile.credential === undefined ? {} : { apiKeyLastFour: profile.credential.lastFour }),
    configured: profile.model !== '' && (profile.authentication === 'none' || apiKeyConfigured),
  }
}

/** Persist only public connection data and OS-encrypted credential envelopes. */
function persist(configHome: string, file: string, value: PrivateModelConfig | SubscriptionRecord): void {
  mkdirSync(configHome, { recursive: true, mode: 0o700 })
  if (process.platform !== 'win32') chmodSync(configHome, 0o700)
  writeJson(file, value, join(configHome, '.tmp'))
  if (process.platform !== 'win32') chmodSync(file, 0o600)
}

/** Core owns model profiles. Main performs OS-backed cryptography; Renderer sees metadata only. */
export async function createHarnessModelConfig(configHome: string, vault: CredentialVault) {
  const file = join(configHome, HARNESS_MODEL_CONFIG_FILENAME)
  const subscriptionFile = join(configHome, HARNESS_SUBSCRIPTION_FILENAME)
  let value = defaults()
  let loadError: CallFailure | undefined
  let subscription = noSubscription()
  let subscriptionError: CallFailure | undefined
  try {
    subscription = readSubscriptionChoice(subscriptionFile)
  } catch (error) {
    console.error(`[harness] ${error instanceof Error ? error.message : String(error)}`)
    subscriptionError = callFailure(error)
  }
  try {
    const loaded = readPrivateConfig(file)
    value = loaded.value
    if (loaded.legacyApiKey !== undefined) {
      try {
        const current = activeProfile(value)
        const credential: StoredCredential = {
          storage: CREDENTIAL_STORAGE,
          ciphertext: await vault.seal(loaded.legacyApiKey),
          lastFour: lastFourOf(loaded.legacyApiKey),
        }
        value = {
          ...value,
          profiles: value.profiles.map((profile) => (
            profileKey(profile.provider, profile.baseUrl) === value.activeProfile
              ? { ...current, credential }
              : profile
          )),
        }
        persist(configHome, file, value)
      } catch (cause) {
        persist(configHome, file, value)
        console.error(`[harness] 旧 API Key 已从明文配置移除：${cause instanceof Error ? cause.message : String(cause)}`)
        loadError = callFailure(cause)
      }
    } else if (loaded.migrated === true) {
      persist(configHome, file, value)
    }
  } catch (error) {
    console.error(`[harness] ${error instanceof Error ? error.message : String(error)}`)
    loadError = callFailure(error)
  }

  const publicSettings = (): HarnessModelSettings => {
    const current = publicProfile(activeProfile(value))
    return {
      ...current,
      profiles: value.profiles.map(publicProfile),
      subscription: { ...subscription, ...(subscriptionError === undefined ? {} : { error: subscriptionError }) },
      ...(loadError === undefined ? {} : { error: loadError }),
    }
  }

  const choose = (next: SubscriptionChoice) => {
    persist(configHome, subscriptionFile, {
      schemaVersion: SUBSCRIPTION_VERSION,
      active: next.active,
      clis: { claude: { model: next.models.claude }, codex: { model: next.models.codex } },
    })
    subscription = next
    subscriptionError = undefined
  }

  return {
    settings: publicSettings,
    async update(input: HarnessModelSettingsUpdate): Promise<HarnessModelSettings> {
      const next = HarnessModelSettingsUpdateSchema.parse(input)
      const normalizedUrl = normalizeBaseUrl(next.baseUrl)
      const nextKey = profileKey(next.provider, normalizedUrl)
      const existing = value.profiles.find((profile) => (
        profileKey(profile.provider, profile.baseUrl) === nextKey
      ))
      if (existing === undefined && value.profiles.length >= 100) {
        throw new CallError('refused', '最多保存 100 个模型配置')
      }
      let credential: StoredCredential | undefined
      if (next.clearApiKey !== true && next.authentication !== 'none') {
        if (next.apiKey !== undefined) {
          credential = {
            storage: CREDENTIAL_STORAGE,
            ciphertext: await vault.seal(next.apiKey),
            lastFour: lastFourOf(next.apiKey),
          }
        } else {
          credential = existing?.credential
        }
      }
      const updated: PrivateModelProfile = {
        provider: next.provider,
        protocol: next.protocol,
        baseUrl: normalizedUrl,
        model: next.model,
        authentication: next.authentication,
        ...(credential === undefined ? {} : { credential }),
      }
      value = {
        schemaVersion: CONFIG_VERSION,
        activeProfile: nextKey,
        profiles: [
          updated,
          ...value.profiles.filter((profile) => (
            profileKey(profile.provider, profile.baseUrl) !== nextKey
          )),
        ],
      }
      loadError = undefined
      persist(configHome, file, value)
      if (subscription.active !== null || subscriptionError !== undefined) choose({ ...subscription, active: null })
      return publicSettings()
    },
    /** Makes subscription CLI `cli` the model source, running `model`; the API profiles stay as they are. */
    updateSubscription(input: HarnessUpdateSubscriptionParams): HarnessModelSettings {
      const { cli, model } = HarnessUpdateSubscriptionParamsSchema.parse(input)
      choose({ active: cli, models: { ...subscription.models, [cli]: model } })
      return publicSettings()
    },
    async runtime(): Promise<HarnessRuntimeModel | HarnessCliModel> {
      if (subscriptionError !== undefined) {
        throw new CallError(subscriptionError, '订阅配置读不出来')
      }
      if (subscription.active !== null) {
        const model = subscription.models[subscription.active]
        return { source: 'cli', cli: subscription.active, ...(model === '' ? {} : { model }) }
      }
      const current = activeProfile(value)
      let apiKey: string | undefined
      if (current.credential !== undefined) {
        const credential = current.credential
        const opened = await vault.open(credential.ciphertext)
        apiKey = opened.secret
        if (opened.replacement !== undefined) {
          const replacement = opened.replacement
          const currentKey = profileKey(current.provider, current.baseUrl)
          value = {
            ...value,
            profiles: value.profiles.map((profile) => (
              profileKey(profile.provider, profile.baseUrl) === currentKey
                ? {
                    ...profile,
                    credential: { ...credential, ciphertext: replacement },
                  }
                : profile
            )),
          }
          persist(configHome, file, value)
        }
      }
      return {
        provider: current.provider,
        protocol: current.protocol,
        baseUrl: current.baseUrl,
        model: current.model,
        authentication: current.authentication,
        ...(apiKey === undefined ? {} : { apiKey }),
      }
    },
    planModel() {
      const cli = subscription.active
      if (cli !== null) {
        return {
          provider: SUBSCRIPTION_LABELS[cli], name: subscription.models[cli] || '默认模型', configured: true, billable: false,
        }
      }
      const settings = publicSettings()
      return {
        provider: PROVIDERS[settings.provider].label,
        name: settings.model || '未配置',
        configured: settings.configured && subscriptionError === undefined,
        billable: !isLocalNoAuth(settings),
      }
    },
  }
}

function parseCredential(raw: unknown): StoredCredential | undefined {
  if (raw === undefined) return undefined
  const held = raw as Partial<StoredCredential>
  if (typeof held !== 'object' || held === null
    || held.storage !== CREDENTIAL_STORAGE
    || typeof held.ciphertext !== 'string' || held.ciphertext === ''
    || typeof held.lastFour !== 'string' || held.lastFour === '' || Array.from(held.lastFour).length > 4) {
    throw new Error('保存的 API Key 密文元数据无效')
  }
  return held as StoredCredential
}

function parseProfile(raw: unknown): PrivateModelProfile {
  if (typeof raw !== 'object' || raw === null) throw new Error('模型配置项无效')
  const held = raw as Record<string, unknown>
  const publicPart = HarnessModelSettingsUpdateSchema.parse({
    provider: held['provider'],
    protocol: held['protocol'],
    baseUrl: held['baseUrl'],
    model: held['model'],
    authentication: held['authentication'],
  })
  const credential = parseCredential(held['credential'])
  if (publicPart.authentication === 'none' && credential !== undefined) {
    throw new CallError('invalid', '无需认证的模型配置不能保存 API Key')
  }
  return {
    provider: publicPart.provider,
    protocol: publicPart.protocol,
    baseUrl: normalizeBaseUrl(publicPart.baseUrl),
    model: publicPart.model,
    authentication: publicPart.authentication,
    ...(credential === undefined ? {} : { credential }),
  }
}

function parseCurrentConfig(parsed: Record<string, unknown>): PrivateModelConfig {
  if (!Array.isArray(parsed['profiles']) || parsed['profiles'].length < 1
    || parsed['profiles'].length > 100) {
    throw new Error('模型配置仓库无效')
  }
  const profiles = parsed['profiles'].map(parseProfile)
  const keys = profiles.map((profile) => profileKey(profile.provider, profile.baseUrl))
  if (new Set(keys).size !== keys.length) throw new Error('模型配置仓库包含重复项')
  const selected = parsed['activeProfile']
  if (typeof selected !== 'string' || !keys.includes(selected)) {
    throw new CallError('not-found', '当前模型配置不存在')
  }
  return { schemaVersion: CONFIG_VERSION, activeProfile: selected, profiles }
}

function parseLegacyConfig(
  parsed: Record<string, unknown>,
  schemaVersion: typeof LEGACY_CONFIG_VERSIONS[number],
): LoadedConfig {
  const provider = schemaVersion === 'meridian.harness-model.v1'
    ? parsed['baseUrl'] === PROVIDERS.openai.baseUrl ? 'openai' : 'openai-compatible'
    : parsed['provider']
  const protocol = schemaVersion === 'meridian.harness-model.v4'
    || schemaVersion === 'meridian.harness-model.v3'
    ? parsed['protocol']
    : provider === 'openai-compatible'
      ? 'responses'
      : PROVIDERS[provider as HarnessModelProvider]?.protocol
  const publicPart = HarnessModelSettingsUpdateSchema.parse({
    provider,
    protocol,
    baseUrl: provider === 'openai' ? PROVIDERS.openai.baseUrl : parsed['baseUrl'],
    model: parsed['model'],
    authentication: provider === 'openai' ? 'api-key' : parsed['authentication'],
  })
  const credential = schemaVersion === 'meridian.harness-model.v4'
    ? parseCredential(parsed['credential'])
    : undefined
  const profile: PrivateModelProfile = {
    provider: publicPart.provider,
    protocol: publicPart.protocol,
    baseUrl: normalizeBaseUrl(publicPart.baseUrl),
    model: publicPart.model,
    authentication: publicPart.authentication,
    ...(credential === undefined ? {} : { credential }),
  }
  const legacyApiKey = schemaVersion === 'meridian.harness-model.v4' ? undefined : parsed['apiKey']
  return {
    value: {
      schemaVersion: CONFIG_VERSION,
      activeProfile: profileKey(profile.provider, profile.baseUrl),
      profiles: [profile],
    },
    migrated: true,
    ...(typeof legacyApiKey === 'string' && legacyApiKey !== '' ? { legacyApiKey } : {}),
  }
}

function readPrivateConfig(file: string): LoadedConfig {
  if (!existsSync(file)) return { value: defaults() }
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
    const schemaVersion = String(parsed['schemaVersion'])
    if (schemaVersion === CONFIG_VERSION) return { value: parseCurrentConfig(parsed) }
    if (!LEGACY_CONFIG_VERSIONS.includes(
      schemaVersion as typeof LEGACY_CONFIG_VERSIONS[number],
    )) {
      throw new CallError('newer-version', '版本不受支持')
    }
    return parseLegacyConfig(
      parsed,
      schemaVersion as typeof LEGACY_CONFIG_VERSIONS[number],
    )
  } catch (error) {
    throw new CallError(
      callFailure(error) === 'newer-version' ? 'newer-version' : 'invalid',
      `AI 模型配置无效：${error instanceof Error ? error.message : String(error)}`, { cause: error },
    )
  }
}

/**
 * Reads the subscription choice in `file`, or no choice when there is none. Keys and CLIs this
 * version does not know are ignored. Throws `newer-version` for a schema version or an active CLI
 * this version cannot run, and `invalid` for anything else it cannot read.
 */
function readSubscriptionChoice(file: string): SubscriptionChoice {
  if (!existsSync(file)) return noSubscription()
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
    if (parsed['schemaVersion'] !== SUBSCRIPTION_VERSION) throw new CallError('newer-version', '版本不受支持')
    const active = parsed['active']
    if (active !== null && !HarnessCliSchema.safeParse(active).success) {
      throw new CallError(typeof active === 'string' ? 'newer-version' : 'invalid', `无法运行 ${String(active)}`)
    }
    const clis = (parsed['clis'] ?? {}) as Record<string, unknown>
    if (typeof clis !== 'object' || Array.isArray(clis)) throw new Error('CLI 配置无效')
    const modelOf = (cli: HarnessCli) => {
      const held = clis[cli]
      if (held === undefined) return ''
      if (typeof held !== 'object' || held === null) throw new Error(`${cli} 的配置无效`)
      return HarnessSubscriptionModelSchema.parse((held as Record<string, unknown>)['model'])
    }
    return { active: active as HarnessCli | null, models: { claude: modelOf('claude'), codex: modelOf('codex') } }
  } catch (error) {
    throw new CallError(
      callFailure(error) === 'newer-version' ? 'newer-version' : 'invalid',
      `订阅配置无效：${error instanceof Error ? error.message : String(error)}`, { cause: error },
    )
  }
}

export type HarnessModelConfig = Awaited<ReturnType<typeof createHarnessModelConfig>>
