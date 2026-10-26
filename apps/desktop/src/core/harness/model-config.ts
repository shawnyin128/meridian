import { chmodSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type {
  CallFailure, HarnessCli, HarnessCliModel, HarnessModelProfile, HarnessModelProtocol, HarnessModelProvider,
  HarnessModelSettings, HarnessModelSettingsUpdate, HarnessSubscriptionSettings, HarnessUpdateSubscriptionParams,
} from '../../shared/contract.js'
import {
  HARNESS_API_EFFORTS, HarnessCliSchema, HarnessEffortSchema, HarnessModelSettingsUpdateSchema,
  HarnessSubscriptionModelSchema, HarnessUpdateSubscriptionParamsSchema,
} from '../../shared/contract.js'
import { CallError, callFailure } from '../call-error.js'
import { writeJson } from '../vault/writer.js'
import type { CredentialVault } from './credential-vault.js'
import { CLAUDE_EFFORTS, CODEX_UNUSABLE_EFFORTS } from './subscription.js'

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
export const HARNESS_MODEL_OPTIONS_FILENAME = 'harness-model-options.json'
const OPTIONS_VERSION = 'meridian.harness-model-options.v1'
/**
 * The reasoning efforts each CLI accepts from Settings: Claude Code's --effort levels, and for Codex,
 * whose catalog names its levels, any level word a run can use.
 */
const CLI_EFFORTS: Record<HarnessCli, (effort: string) => boolean> = {
  claude: (effort) => (CLAUDE_EFFORTS as readonly string[]).includes(effort),
  codex: (effort) => HarnessEffortSchema.safeParse(effort).success && !CODEX_UNUSABLE_EFFORTS.has(effort),
}

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

type SubscriptionChoice = Omit<HarnessSubscriptionSettings, 'error' | 'efforts'>

type SubscriptionRecord = {
  schemaVersion: typeof SUBSCRIPTION_VERSION
  active: HarnessCli | null
  clis: Record<HarnessCli, { model: string }>
}

const noSubscription = (): SubscriptionChoice => ({ active: null, models: { claude: '', codex: '' } })

/** Where a reasoning effort is kept in the options file: under an API profile's key or a CLI's name. */
type EffortSection = 'profiles' | 'clis'

/**
 * The reasoning efforts the options file holds: by API profile key and by CLI, with why each entry
 * this version cannot read failed, by `<section>/<key>`, and the file as read, keys it does not know
 * included.
 */
type StoredEfforts = {
  profiles: Record<string, string>
  clis: Partial<Record<HarnessCli, string>>
  unreadable: Record<string, CallFailure>
  raw: Record<string, unknown>
}

const noEfforts = (): StoredEfforts => ({ profiles: {}, clis: {}, unreadable: {}, raw: {} })

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

type LoadedConfig = {
  value: PrivateModelConfig
  legacyApiKey?: string
  migrated?: boolean
}

/** A model reached through a LangChain provider, with its API key when it needs one. */
type HarnessApiModel = {
  provider: HarnessModelProvider
  protocol: HarnessModelProtocol
  baseUrl: string
  model: string
  authentication: 'api-key' | 'none'
  apiKey?: string
  /** The reasoning effort the run asks for; without it the provider's own default applies. */
  effort?: string
}

/** The model a Harness run uses: an API provider, or the user's own signed-in CLI. */
export type HarnessRuntimeModel = HarnessApiModel | HarnessCliModel

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
function persist(configHome: string, file: string, value: PrivateModelConfig | SubscriptionRecord | Record<string, unknown>): void {
  mkdirSync(configHome, { recursive: true, mode: 0o700 })
  if (process.platform !== 'win32') chmodSync(configHome, 0o700)
  writeJson(file, value, join(configHome, '.tmp'))
  if (process.platform !== 'win32') chmodSync(file, 0o600)
}

/** Core owns model profiles. Main performs OS-backed cryptography; Renderer sees metadata only. */
export async function createHarnessModelConfig(configHome: string, vault: CredentialVault) {
  const file = join(configHome, HARNESS_MODEL_CONFIG_FILENAME)
  const subscriptionFile = join(configHome, HARNESS_SUBSCRIPTION_FILENAME)
  const optionsFile = join(configHome, HARNESS_MODEL_OPTIONS_FILENAME)
  let value = defaults()
  let loadError: CallFailure | undefined
  let subscription = noSubscription()
  let subscriptionError: CallFailure | undefined
  let subscriptionRevision = 0
  let efforts = noEfforts()
  let effortsError: CallFailure | undefined
  try {
    subscription = readSubscriptionChoice(subscriptionFile)
  } catch (error) {
    console.error(`[harness] ${error instanceof Error ? error.message : String(error)}`)
    subscriptionError = callFailure(error)
  }
  try {
    efforts = readEfforts(optionsFile)
    for (const [entry, failure] of Object.entries(efforts.unreadable)) {
      console.error(`[harness] 推理强度配置 ${entry} 读不出来（${failure}）`)
    }
  } catch (error) {
    console.error(`[harness] ${error instanceof Error ? error.message : String(error)}`)
    effortsError = callFailure(error)
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

  /** Why the effort kept under `key` of `section` cannot be read, if it cannot. */
  const effortFailure = (section: EffortSection, key: string) => effortsError ?? efforts.unreadable[`${section}/${key}`]

  /** The effort kept under `key` of `section`; throws when it cannot be read. */
  const effortOf = (section: EffortSection, key: string): string | undefined => {
    const failure = effortFailure(section, key)
    if (failure !== undefined) throw new CallError(failure, '推理强度配置读不出来')
    return section === 'profiles' ? efforts.profiles[key] : efforts.clis[key as HarnessCli]
  }

  /** Keeps `effort` under `key` of `section`, or none, in the options file, leaving every key this version does not know as it is. */
  const keepEffort = (section: EffortSection, key: string, effort: string | undefined) => {
    const kept = section === 'profiles' ? efforts.profiles[key] : efforts.clis[key as HarnessCli]
    if (kept === effort && effortFailure(section, key) === undefined) return
    const held: Record<string, unknown> = isRecord(efforts.raw[section]) ? { ...efforts.raw[section] } : {}
    const entry: Record<string, unknown> = isRecord(held[key]) ? { ...held[key] } : {}
    if (effort === undefined) delete entry['effort']
    else entry['effort'] = effort
    if (Object.keys(entry).length === 0) delete held[key]
    else held[key] = entry
    const next = { ...efforts.raw, schemaVersion: OPTIONS_VERSION, [section]: held }
    persist(configHome, optionsFile, next)
    efforts = parseEfforts(next)
    effortsError = undefined
  }

  const profileWithEffort = (profile: PrivateModelProfile): HarnessModelProfile => {
    const effort = efforts.profiles[profileKey(profile.provider, profile.baseUrl)]
    return { ...publicProfile(profile), ...(effort === undefined ? {} : { effort }) }
  }

  const publicSettings = (): HarnessModelSettings => {
    const current = profileWithEffort(activeProfile(value))
    const effortError = effortsError ?? Object.values(efforts.unreadable)[0]
    return {
      ...current,
      profiles: value.profiles.map(profileWithEffort),
      subscription: {
        ...subscription,
        efforts: { ...efforts.clis },
        ...(subscriptionError === undefined ? {} : { error: subscriptionError }),
      },
      ...(loadError === undefined ? {} : { error: loadError }),
      ...(effortError === undefined ? {} : { effortError }),
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
    subscriptionRevision += 1
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
      keepEffort('profiles', nextKey, next.effort)
      if (subscription.active !== null || subscriptionError !== undefined) choose({ ...subscription, active: null })
      return publicSettings()
    },
    /** A number that changes each time the subscription choice is saved. */
    subscriptionRevision: () => subscriptionRevision,
    /**
     * Makes subscription CLI `cli` the model source, running `model` at reasoning effort `effort`, or
     * at the CLI's own default without one; the API profiles stay as they are. Throws `invalid` for
     * an effort the CLI does not take.
     */
    updateSubscription(input: HarnessUpdateSubscriptionParams): HarnessModelSettings {
      const { cli, model, effort } = HarnessUpdateSubscriptionParamsSchema.parse(input)
      if (effort !== undefined && !CLI_EFFORTS[cli](effort)) throw new CallError('invalid', `${cli} 不接受推理强度 ${effort}`)
      keepEffort('clis', cli, effort)
      choose({ active: cli, models: { ...subscription.models, [cli]: model } })
      return publicSettings()
    },
    async runtime(): Promise<HarnessRuntimeModel> {
      if (subscriptionError !== undefined) {
        throw new CallError(subscriptionError, '订阅配置读不出来')
      }
      if (subscription.active !== null) {
        const model = subscription.models[subscription.active]
        const effort = effortOf('clis', subscription.active)
        return {
          source: 'cli', cli: subscription.active, ...(model === '' ? {} : { model }), ...(effort === undefined ? {} : { effort }),
        }
      }
      const current = activeProfile(value)
      const effort = effortOf('profiles', profileKey(current.provider, current.baseUrl))
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
        ...(effort === undefined ? {} : { effort }),
      }
    },
    planModel() {
      const cli = subscription.active
      if (cli !== null) {
        const effort = efforts.clis[cli]
        return {
          provider: SUBSCRIPTION_LABELS[cli], name: subscription.models[cli] || '默认模型', configured: true, billable: false,
          cli, ...(effort === undefined ? {} : { effort }),
        }
      }
      const settings = publicSettings()
      return {
        provider: PROVIDERS[settings.provider].label,
        name: settings.model || '未配置',
        configured: settings.configured && subscriptionError === undefined,
        billable: !isLocalNoAuth(settings),
        ...(settings.effort === undefined ? {} : { effort: settings.effort }),
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

/**
 * The reasoning efforts options file content `raw` holds. Keys, profiles of providers and CLIs this
 * version does not know are ignored; an entry whose effort this version cannot pass on is set aside
 * with why: `newer-version` for a level word its provider or CLI does not take here, `invalid` for
 * anything else. Throws for a section that is not an object.
 */
function parseEfforts(raw: Record<string, unknown>): StoredEfforts {
  const stored: StoredEfforts = { ...noEfforts(), raw }
  const entries = (section: EffortSection) => {
    const held = raw[section] ?? {}
    if (!isRecord(held)) throw new Error(`${section} 不是对象`)
    return Object.entries(held)
  }
  /** The effort `entry` keeps, if any, or why it cannot be read when it is malformed or `accepts` refuses it. */
  const effortIn = (entry: unknown, accepts: (effort: string) => boolean): { effort?: string } | { failure: CallFailure } => {
    if (!isRecord(entry)) return { failure: 'invalid' }
    const effort = entry['effort']
    if (effort === undefined) return {}
    if (!HarnessEffortSchema.safeParse(effort).success) return { failure: 'invalid' }
    return accepts(effort as string) ? { effort: effort as string } : { failure: 'newer-version' }
  }
  for (const [key, entry] of entries('profiles')) {
    const levels = (HARNESS_API_EFFORTS as Partial<Record<string, readonly string[]>>)[key.split(':')[0]!]
    if (levels === undefined) continue
    const read = effortIn(entry, (effort) => levels.includes(effort))
    if ('failure' in read) stored.unreadable[`profiles/${key}`] = read.failure
    else if (read.effort !== undefined) stored.profiles[key] = read.effort
  }
  for (const [key, entry] of entries('clis')) {
    if (!HarnessCliSchema.safeParse(key).success) continue
    const cli = key as HarnessCli
    const read = effortIn(entry, CLI_EFFORTS[cli])
    if ('failure' in read) stored.unreadable[`clis/${key}`] = read.failure
    else if (read.effort !== undefined) stored.clis[cli] = read.effort
  }
  return stored
}

/**
 * Reads the reasoning efforts in options file `file`, or none when there is none. Throws
 * `newer-version` for a schema version this version does not know, and `invalid` for a file it
 * cannot read otherwise.
 */
function readEfforts(file: string): StoredEfforts {
  if (!existsSync(file)) return noEfforts()
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
    if (!isRecord(parsed)) throw new Error('不是对象')
    if (parsed['schemaVersion'] !== OPTIONS_VERSION) throw new CallError('newer-version', '版本不受支持')
    return parseEfforts(parsed)
  } catch (error) {
    throw new CallError(
      callFailure(error) === 'newer-version' ? 'newer-version' : 'invalid',
      `推理强度配置无效：${error instanceof Error ? error.message : String(error)}`, { cause: error },
    )
  }
}
