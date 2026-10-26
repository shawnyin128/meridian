import { randomUUID } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type {
  CallFailure, HarnessAddModelParams, HarnessCli, HarnessCliModel, HarnessModelEntry, HarnessModelProfile,
  HarnessModelProtocol, HarnessModelProvider, HarnessModelSettings, HarnessModelSettingsUpdate, HarnessModelSource,
  HarnessModelSourceGroup, HarnessSubscriptionSettings, HarnessUpdateModelParams,
  HarnessUpdateSubscriptionParams,
} from '../../shared/contract.js'
import {
  HARNESS_API_EFFORTS, HarnessAddModelParamsSchema, HarnessCliSchema, HarnessEffortSchema, HarnessModelProviderSchema,
  HarnessModelSettingsUpdateSchema, HarnessSubscriptionModelSchema, HarnessUpdateModelParamsSchema,
  HarnessUpdateSubscriptionParamsSchema,
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
export const HARNESS_MODELS_FILENAME = 'harness-models.json'
const MODELS_VERSION = 'meridian.harness-models.v1'
const MAX_MODELS = 100
/** The order sources are shown in: the API providers, OpenAI-compatible services by host, then the subscription CLIs. */
const SOURCE_ORDER: readonly string[] = ['openai', 'anthropic', 'google-gemini', 'openai-compatible', 'claude', 'codex']
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

type SubscriptionChoice = Omit<HarnessSubscriptionSettings, 'error'>

type SubscriptionRecord = {
  schemaVersion: typeof SUBSCRIPTION_VERSION
  active: HarnessCli | null
  clis: Record<HarnessCli, { model: string }>
}

const noSubscription = (): SubscriptionChoice => ({ active: null, models: { claude: '', codex: '' } })

/** A configured model as the model list keeps it. */
type ModelRecord = { id: string; source: HarnessModelSource; model: string; effort?: string }

/**
 * One record of the model list file: a model this version reads, with the record as read, keys it
 * does not know included, or a record it cannot read, kept as it was, with why.
 */
type ModelSlot = { entry: ModelRecord; raw: Record<string, unknown> } | { unreadable: unknown; failure: CallFailure }

/**
 * The model list: its records in order, the default model's id, the file as read, and whether the
 * file exists yet; until it does, the list is the one older Apps' choices give.
 */
type ModelList = { slots: ModelSlot[]; defaultModel: string | null; raw: Record<string, unknown>; stored: boolean }

/**
 * What the files older Apps read said was in use when the model list was last saved: the active
 * profile and its model in `harness-model.json`, and the chosen CLI and its model in
 * `harness-subscription.json`.
 */
type Mirrored = { profile: string; profileModel: string; cli: HarnessCli | null; cliModel: string }

/** The model a run asks for: a configured model and its own reasoning effort for it, as a chat chose them. */
export type ModelChoice = { model: string; effort?: string }

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


/** The provider whose profile key `key` is, or undefined for one this version does not know. */
const providerOfKey = (key: string): HarnessModelProvider | undefined => {
  const parsed = HarnessModelProviderSchema.safeParse(key.split(':')[0])
  return parsed.success ? parsed.data : undefined
}

/** Whether a model on `source` can run at reasoning effort `effort`. */
const acceptsEffort = (source: HarnessModelSource, effort: string): boolean => {
  if (source.kind === 'cli') return CLI_EFFORTS[source.cli](effort)
  const provider = providerOfKey(source.profile)
  return provider !== undefined && HARNESS_API_EFFORTS[provider].includes(effort)
}

/** The rank of `source` in the order sources are shown, and the text that orders sources of one rank. */
const sourceOrder = (source: HarnessModelSource): [number, string] => (source.kind === 'cli'
  ? [SOURCE_ORDER.indexOf(source.cli), '']
  : [SOURCE_ORDER.indexOf(providerOfKey(source.profile) ?? ''), source.profile])

const sameSource = (left: HarnessModelSource, right: HarnessModelSource) => (left.kind === 'cli'
  ? right.kind === 'cli' && right.cli === left.cli
  : right.kind === 'api' && right.profile === left.profile)

/**
 * Core owns model profiles and the model list. Main performs OS-backed cryptography; Renderer sees
 * metadata only. The model list lives in `harness-models.json`; while that file is missing it is the
 * list older Apps' choices give: every API profile with a model, every CLI that is chosen or has a
 * model, and the model source in use as the default. Every change to the default keeps
 * `harness-model.json` and `harness-subscription.json` in step for older Apps.
 */
export async function createHarnessModelConfig(configHome: string, vault: CredentialVault) {
  const file = join(configHome, HARNESS_MODEL_CONFIG_FILENAME)
  const subscriptionFile = join(configHome, HARNESS_SUBSCRIPTION_FILENAME)
  const listFile = join(configHome, HARNESS_MODELS_FILENAME)
  let value = defaults()
  let loadError: CallFailure | undefined
  let subscription = noSubscription()
  let subscriptionError: CallFailure | undefined
  let revision = 0
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

  /** The list older Apps' choices give, while no model list file exists. */
  const migratedList = (): ModelList => {
    const entries: ModelRecord[] = [
      ...value.profiles.filter((profile) => profile.model !== '').map((profile): ModelRecord => {
        const key = profileKey(profile.provider, profile.baseUrl)
        return { id: `api:${key}`, source: { kind: 'api', profile: key }, model: profile.model }
      }),
      ...HarnessCliSchema.options.filter((cli) => subscription.active === cli || subscription.models[cli] !== '')
        .map((cli): ModelRecord => ({ id: `cli:${cli}`, source: { kind: 'cli', cli }, model: subscription.models[cli] })),
    ]
    const inUse = subscription.active !== null ? `cli:${subscription.active}` : `api:${value.activeProfile}`
    const defaultModel = entries.find((entry) => entry.id === inUse)?.id ?? entries[0]?.id ?? null
    return { slots: entries.map((entry) => ({ entry, raw: {} })), defaultModel, raw: {}, stored: false }
  }

  let list: ModelList = { slots: [], defaultModel: null, raw: {}, stored: false }
  let listError: CallFailure | undefined
  try {
    list = readModelList(listFile) ?? migratedList()
    for (const slot of list.slots) {
      if ('failure' in slot) console.error(`[harness] 模型列表里有一项读不出来（${slot.failure}）`)
    }
  } catch (error) {
    console.error(`[harness] ${error instanceof Error ? error.message : String(error)}`)
    listError = callFailure(error)
  }

  /** What `harness-model.json` and `harness-subscription.json` say is in use now. */
  const mirroredNow = (): Mirrored => ({
    profile: value.activeProfile,
    profileModel: value.profiles.find((profile) => profileKey(profile.provider, profile.baseUrl) === value.activeProfile)?.model ?? '',
    cli: subscription.active,
    cliModel: subscription.active === null ? '' : subscription.models[subscription.active],
  })

  const entries = () => list.slots.flatMap((slot) => ('entry' in slot ? [slot.entry] : []))
  const entryById = (id: string) => entries().find((entry) => entry.id === id)
  const defaultEntry = () => (list.defaultModel === null ? undefined : entryById(list.defaultModel))
  const profileOf = (key: string) => value.profiles.find((profile) => profileKey(profile.provider, profile.baseUrl) === key)

  /** Whether `entry` can run as set up: an API model's profile exists and has a key or needs none. */
  const runnable = (entry: ModelRecord): boolean => {
    if (entry.source.kind === 'cli') return true
    const profile = profileOf(entry.source.profile)
    return profile !== undefined && entry.model !== '' && (profile.authentication === 'none' || profile.credential !== undefined)
  }

  /**
   * The sources the list's models run on, in the order they are shown, each with its models and the one
   * switching to it picks: the default when the source holds it and it can run, else the source's first
   * model that can run, else its first.
   */
  const groups = (): HarnessModelSourceGroup[] => {
    const sources: HarnessModelSource[] = []
    for (const entry of entries()) if (!sources.some((source) => sameSource(source, entry.source))) sources.push(entry.source)
    return sources.sort((left, right) => {
      const [leftRank, leftText] = sourceOrder(left)
      const [rightRank, rightText] = sourceOrder(right)
      return leftRank - rightRank || leftText.localeCompare(rightText)
    }).map((source) => {
      const models = entries().filter((entry) => sameSource(entry.source, source))
      const held = models.map((entry) => entry.id)
      const chosen = models.find((entry) => entry.id === list.defaultModel)
      const picked = chosen !== undefined && runnable(chosen) ? chosen : models.find(runnable) ?? models[0]!
      const provider = source.kind === 'api' ? providerOfKey(source.profile) : undefined
      return {
        source,
        ...(provider === undefined ? {} : { provider }),
        ...(provider === 'openai-compatible' && source.kind === 'api'
          ? { host: new URL(source.profile.slice('openai-compatible:'.length)).host } : {}),
        entries: held,
        defaultEntry: picked.id,
      }
    })
  }

  const publicEntry = (entry: ModelRecord): HarnessModelEntry => ({ ...entry, configured: runnable(entry) })

  const publicSettings = (): HarnessModelSettings => {
    const chosen = defaultEntry()
    const shown = chosen?.source.kind === 'api' ? profileOf(chosen.source.profile) : undefined
    const current = publicProfile(shown === undefined ? activeProfile(value) : { ...shown, model: chosen!.model })
    const unreadable = list.slots.find((slot): slot is Extract<ModelSlot, { failure: CallFailure }> => 'failure' in slot)
    const modelsError = listError ?? unreadable?.failure
    return {
      ...current,
      configured: chosen !== undefined && runnable(chosen),
      profiles: value.profiles.map(publicProfile),
      subscription: {
        active: chosen === undefined ? subscription.active : chosen.source.kind === 'cli' ? chosen.source.cli : null,
        models: subscription.models,
        ...(subscriptionError === undefined ? {} : { error: subscriptionError }),
      },
      ...(loadError === undefined ? {} : { error: loadError }),
      models: entries().map(publicEntry),
      defaultModel: chosen === undefined ? null : chosen.id,
      sources: groups(),
      ...(modelsError === undefined ? {} : { modelsError }),
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
    revision += 1
  }

  /**
   * Writes the model list, keeping the records this version cannot read and every key it does not
   * know, with what the files older Apps read say is in use.
   */
  const saveList = () => {
    const models = list.slots.map((slot) => {
      if ('failure' in slot) return slot.unreadable
      const record: Record<string, unknown> = { ...slot.raw, id: slot.entry.id, source: slot.entry.source, model: slot.entry.model }
      if (slot.entry.effort === undefined) delete record['effort']
      else record['effort'] = slot.entry.effort
      return record
    })
    persist(configHome, listFile, {
      ...list.raw, schemaVersion: MODELS_VERSION, default: list.defaultModel, models, mirrored: mirroredNow(),
    })
    list = { ...list, stored: true }
    listError = undefined
    revision += 1
  }

  /**
   * Makes `harness-model.json` and `harness-subscription.json` say what the default model is, the way
   * older Apps read them: an API default's profile is active and runs its model, and no CLI is chosen;
   * a CLI default is the chosen CLI, running its model.
   */
  const mirrorDefault = () => {
    const chosen = defaultEntry()
    if (chosen === undefined) return
    if (chosen.source.kind === 'cli') {
      const cli = chosen.source.cli
      if (subscription.active !== cli || subscription.models[cli] !== chosen.model || subscriptionError !== undefined) {
        choose({ active: cli, models: { ...subscription.models, [cli]: chosen.model } })
      }
      return
    }
    const key = chosen.source.profile
    const profile = profileOf(key)
    if (profile !== undefined && (value.activeProfile !== key || profile.model !== chosen.model)) {
      value = {
        ...value,
        activeProfile: key,
        profiles: value.profiles.map((held) => (held === profile ? { ...held, model: chosen.model } : held)),
      }
      persist(configHome, file, value)
    }
    if (subscription.active !== null || subscriptionError !== undefined) choose({ ...subscription, active: null })
  }

  /** Writes the files older Apps read for the default model, then the model list. */
  const commit = () => {
    mirrorDefault()
    saveList()
  }

  /**
   * Saves API connection `input` on its profile, sealing a new key and keeping or clearing the saved
   * one as `input` says, and returns the profile's key. The profile runs `model` once `activate`
   * makes it the active profile, or while it has no model yet.
   */
  const saveProfile = async (input: HarnessModelSettingsUpdate, activate: boolean): Promise<string> => {
    const next = HarnessModelSettingsUpdateSchema.parse(input)
    const normalizedUrl = normalizeBaseUrl(next.baseUrl)
    const nextKey = profileKey(next.provider, normalizedUrl)
    const existing = profileOf(nextKey)
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
      model: activate || existing === undefined || existing.model === '' ? next.model : existing.model,
      authentication: next.authentication,
      ...(credential === undefined ? {} : { credential }),
    }
    const others = value.profiles.filter((profile) => profile !== existing)
    value = {
      schemaVersion: CONFIG_VERSION,
      activeProfile: activate ? nextKey : value.activeProfile,
      profiles: activate || existing === undefined
        ? (activate ? [updated, ...others] : [...value.profiles, updated])
        : value.profiles.map((profile) => (profile === existing ? updated : profile)),
    }
    loadError = undefined
    persist(configHome, file, value)
    return nextKey
  }

  /**
   * The source, model and effort `input` asks to save, its API connection saved on its profile, made
   * the active profile when `activate`. Throws `invalid` for an API model without a model ID and for
   * an effort its source does not take.
   */
  const savedModel = async (input: HarnessAddModelParams, activate: boolean): Promise<Omit<ModelRecord, 'id'>> => {
    const { source: given, model, effort } = input
    const source: HarnessModelSource = given.kind === 'cli'
      ? given
      : { kind: 'api', profile: profileKey(given.provider, normalizeBaseUrl(given.baseUrl)) }
    if (source.kind === 'api' && model === '') throw new CallError('invalid', '没有填模型 ID')
    if (source.kind === 'cli') HarnessSubscriptionModelSchema.parse(model)
    if (effort !== undefined && !acceptsEffort(source, effort)) throw new CallError('invalid', `这个模型不接受推理强度 ${effort}`)
    if (given.kind === 'api') {
      await saveProfile({
        provider: given.provider, protocol: given.protocol, baseUrl: given.baseUrl, authentication: given.authentication, model,
        ...(given.apiKey === undefined ? {} : { apiKey: given.apiKey }),
        ...(given.clearApiKey === undefined ? {} : { clearApiKey: given.clearApiKey }),
      }, activate)
    }
    return { source, model, ...(effort === undefined ? {} : { effort }) }
  }

  /** Makes the model matching `match`, or a new one, the default, as an older App's model choice does. */
  const chooseDefault = (saved: Omit<ModelRecord, 'id'>) => {
    const held = entries().find((entry) => sameSource(entry.source, saved.source) && entry.model === saved.model)
    if (held === undefined && entries().length >= MAX_MODELS) throw new CallError('refused', `最多保存 ${MAX_MODELS} 个模型`)
    const entry: ModelRecord = { id: held?.id ?? randomUUID(), ...saved }
    list = {
      ...list,
      slots: held === undefined
        ? [...list.slots, { entry, raw: {} }]
        : list.slots.map((slot) => ('entry' in slot && slot.entry.id === held.id ? { ...slot, entry } : slot)),
      defaultModel: entry.id,
    }
    commit()
  }

  /**
   * Makes the choice an older App made after the list was last saved the default: when the files it
   * reads no longer say what the list mirrored into them, the chosen CLI's model, or else the active
   * profile's model, becomes the default, added when the list holds no such model. A profile without a
   * model is no choice.
   */
  const adoptOlderChoice = () => {
    const held = list.raw['mirrored']
    if (!list.stored || !isRecord(held) || loadError !== undefined || subscriptionError !== undefined) return
    const now = mirroredNow()
    const cliChanged = now.cli !== held['cli'] || now.cliModel !== held['cliModel']
    const profileChanged = now.profile !== held['profile'] || now.profileModel !== held['profileModel']
    const chosen: Omit<ModelRecord, 'id'> | undefined = cliChanged && now.cli !== null
      ? { source: { kind: 'cli', cli: now.cli }, model: now.cliModel }
      : (cliChanged || profileChanged) && now.profileModel !== '' && providerOfKey(now.profile) !== undefined
        ? { source: { kind: 'api', profile: now.profile }, model: now.profileModel }
        : undefined
    if (chosen === undefined) return
    const kept = entries().find((entry) => sameSource(entry.source, chosen.source) && entry.model === chosen.model)
    if (kept === undefined && entries().length >= MAX_MODELS) return
    const entry: ModelRecord = kept ?? { id: randomUUID(), ...chosen }
    list = { ...list, slots: kept === undefined ? [...list.slots, { entry, raw: {} }] : list.slots, defaultModel: entry.id }
    console.error(`[harness] 采用了旧版 App 选的模型 ${entry.model || entry.id}`)
    commit()
  }

  /** The configured model a run on `choice` uses: its chosen model while that is configured, else the default. */
  const resolve = (choice?: ModelChoice | null) => {
    const chosen = choice === undefined || choice === null ? undefined : entryById(choice.model)
    const entry = chosen ?? defaultEntry()
    if (entry === undefined) return undefined
    const own = chosen !== undefined && choice?.effort !== undefined && acceptsEffort(entry.source, choice.effort) ? choice.effort : undefined
    const effort = own ?? entry.effort
    return { entry, ...(effort === undefined ? {} : { effort }) }
  }

  adoptOlderChoice()

  return {
    settings: publicSettings,
    /**
     * Saves the API connection, model and effort `input` names as the default model, as older Apps'
     * model settings save a profile; without a model ID no model is the default any more.
     */
    async update(input: HarnessModelSettingsUpdate): Promise<HarnessModelSettings> {
      const next = HarnessModelSettingsUpdateSchema.parse(input)
      if (next.model === '') {
        await saveProfile(next, true)
        list = { ...list, defaultModel: null }
        if (subscription.active !== null || subscriptionError !== undefined) choose({ ...subscription, active: null })
        saveList()
        return publicSettings()
      }
      const { model, effort, ...connection } = next
      chooseDefault(await savedModel({ source: { kind: 'api', ...connection }, model, ...(effort === undefined ? {} : { effort }) }, true))
      return publicSettings()
    },
    /** A number that changes each time the model list or the subscription choice is saved. */
    revision: () => revision,
    /**
     * Makes subscription CLI `cli` running `model` at reasoning effort `effort`, or at its own default
     * without one, the default model, as older Apps' subscription choice does. Throws `invalid` for an
     * effort the CLI does not take.
     */
    updateSubscription(input: HarnessUpdateSubscriptionParams): HarnessModelSettings {
      const { cli, model, effort } = HarnessUpdateSubscriptionParamsSchema.parse(input)
      if (effort !== undefined && !CLI_EFFORTS[cli](effort)) throw new CallError('invalid', `${cli} 不接受推理强度 ${effort}`)
      chooseDefault({ source: { kind: 'cli', cli }, model, ...(effort === undefined ? {} : { effort }) })
      return publicSettings()
    },
    /** Adds the model `input` names; the first model added becomes the default. Throws `refused` once the list is full. */
    async addModel(input: HarnessAddModelParams): Promise<HarnessModelSettings> {
      const params = HarnessAddModelParamsSchema.parse(input)
      if (entries().length >= MAX_MODELS) throw new CallError('refused', `最多保存 ${MAX_MODELS} 个模型`)
      const first = defaultEntry() === undefined
      const entry: ModelRecord = { id: randomUUID(), ...await savedModel(params, first) }
      list = { ...list, slots: [...list.slots, { entry, raw: {} }], defaultModel: first ? entry.id : list.defaultModel }
      commit()
      return publicSettings()
    },
    /** Saves model `input.id` anew. Throws `not-found` for a model the list does not hold. */
    async updateModel(input: HarnessUpdateModelParams): Promise<HarnessModelSettings> {
      const { id, ...params } = HarnessUpdateModelParamsSchema.parse(input)
      if (entryById(id) === undefined) throw new CallError('not-found', '这个模型不在列表里')
      const entry: ModelRecord = { id, ...await savedModel(params, list.defaultModel === id) }
      list = { ...list, slots: list.slots.map((slot) => ('entry' in slot && slot.entry.id === id ? { ...slot, entry } : slot)) }
      commit()
      return publicSettings()
    },
    /**
     * Removes model `id`; a removed default leaves the first model left that can run, in source order,
     * the default, or else the first model left.
     */
    removeModel(id: string): HarnessModelSettings {
      if (entryById(id) === undefined) throw new CallError('not-found', '这个模型不在列表里')
      list = { ...list, slots: list.slots.filter((slot) => !('entry' in slot && slot.entry.id === id)) }
      if (list.defaultModel === id) {
        const left = groups().flatMap((group) => group.entries).flatMap((held) => entries().filter((entry) => entry.id === held))
        list = { ...list, defaultModel: (left.find(runnable) ?? left[0])?.id ?? null }
      }
      commit()
      return publicSettings()
    },
    /** Makes model `id` the default. Throws `not-found` for a model the list does not hold. */
    setDefaultModel(id: string): HarnessModelSettings {
      if (entryById(id) === undefined) throw new CallError('not-found', '这个模型不在列表里')
      list = { ...list, defaultModel: id }
      commit()
      return publicSettings()
    },
    /** Whether model `id` is in the list and takes reasoning effort `effort`, when one is given. */
    accepts(id: string, effort?: string): boolean {
      const entry = entryById(id)
      return entry !== undefined && (effort === undefined || acceptsEffort(entry.source, effort))
    },
    /** The id of the model a run on `choice` uses, its chosen model while that is in the list and else the default, or null without one. */
    modelOf(choice?: ModelChoice | null): string | null {
      return resolve(choice)?.entry.id ?? null
    },
    /** Whether a run on `choice` has a model that can run as set up. */
    configured(choice?: ModelChoice | null): boolean {
      const resolved = resolve(choice)
      return resolved !== undefined && runnable(resolved.entry) && (list.stored || subscriptionError === undefined)
    },
    /**
     * The model a run on `choice` uses, its chosen model while that is in the list and else the
     * default, at the chosen effort when that model takes it and else at the model's own. Throws
     * `no-model` without one, and the reason when the subscription choice the list still comes from
     * cannot be read.
     */
    async runtime(choice?: ModelChoice | null): Promise<HarnessRuntimeModel> {
      if (!list.stored && subscriptionError !== undefined) throw new CallError(subscriptionError, '订阅配置读不出来')
      const resolved = resolve(choice)
      if (resolved === undefined) throw new CallError(listError ?? 'no-model', '还没有设置默认模型')
      const { entry, effort } = resolved
      if (entry.source.kind === 'cli') {
        return {
          source: 'cli', cli: entry.source.cli, ...(entry.model === '' ? {} : { model: entry.model }), ...(effort === undefined ? {} : { effort }),
        }
      }
      const key = entry.source.profile
      const current = profileOf(key)
      if (current === undefined) throw new CallError('not-found', '这个模型的 API 配置不存在')
      let apiKey: string | undefined
      if (current.credential !== undefined) {
        const credential = current.credential
        const opened = await vault.open(credential.ciphertext)
        apiKey = opened.secret
        if (opened.replacement !== undefined) {
          const replacement = opened.replacement
          value = {
            ...value,
            profiles: value.profiles.map((profile) => (
              profileKey(profile.provider, profile.baseUrl) === key
                ? { ...profile, credential: { ...credential, ciphertext: replacement } }
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
        model: entry.model,
        authentication: current.authentication,
        ...(apiKey === undefined ? {} : { apiKey }),
        ...(effort === undefined ? {} : { effort }),
      }
    },
    /** The default model as a run's confirmation names it. */
    planModel() {
      const chosen = defaultEntry()
      if (chosen === undefined) return { provider: '未配置', name: '未配置', configured: false, billable: false }
      const effort = chosen.effort === undefined ? {} : { effort: chosen.effort }
      if (chosen.source.kind === 'cli') {
        const cli = chosen.source.cli
        return { provider: SUBSCRIPTION_LABELS[cli], name: chosen.model || '默认模型', configured: true, billable: false, cli, ...effort }
      }
      const profile = profileOf(chosen.source.profile)
      const provider = providerOfKey(chosen.source.profile) ?? 'openai'
      return {
        provider: PROVIDERS[provider].label,
        name: chosen.model,
        configured: runnable(chosen) && (list.stored || subscriptionError === undefined),
        billable: profile === undefined || !isLocalNoAuth(publicProfile(profile)),
        ...effort,
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
 * The model list record `raw` holds, or why it cannot be read: `newer-version` for a source, or an
 * effort word, this version does not know, `invalid` for anything else, `seen` holding the ids of
 * the records before it.
 */
function parseModelRecord(raw: unknown, seen: ReadonlySet<string>): ModelRecord | CallFailure {
  if (!isRecord(raw)) return 'invalid'
  const id = raw['id']
  if (typeof id !== 'string' || id === '' || id.length > 100 || seen.has(id)) return 'invalid'
  const held = raw['source']
  if (!isRecord(held)) return 'invalid'
  let source: HarnessModelSource
  if (held['kind'] === 'cli') {
    const cli = HarnessCliSchema.safeParse(held['cli'])
    if (!cli.success) return typeof held['cli'] === 'string' ? 'newer-version' : 'invalid'
    source = { kind: 'cli', cli: cli.data }
  } else if (held['kind'] === 'api') {
    const profile = held['profile']
    if (typeof profile !== 'string' || profile === '' || profile.length > 300) return 'invalid'
    if (providerOfKey(profile) === undefined) return 'newer-version'
    source = { kind: 'api', profile }
  } else {
    return typeof held['kind'] === 'string' ? 'newer-version' : 'invalid'
  }
  const model = raw['model']
  if (typeof model !== 'string' || model.length > 200) return 'invalid'
  if (source.kind === 'api' ? model.trim() === '' : !HarnessSubscriptionModelSchema.safeParse(model).success) return 'invalid'
  const effort = raw['effort']
  if (effort !== undefined) {
    if (!HarnessEffortSchema.safeParse(effort).success) return 'invalid'
    if (!acceptsEffort(source, effort as string)) return 'newer-version'
  }
  return { id, source, model, ...(effort === undefined ? {} : { effort: effort as string }) }
}

/**
 * Reads the model list in `file`, or null when there is none. Reads it record by record: a record
 * this version cannot read is set aside with why, and the others keep showing; a default naming no
 * model it reads is none. Throws `newer-version` for a schema version this version does not know,
 * and `invalid` for a file it cannot read otherwise.
 */
function readModelList(file: string): ModelList | null {
  if (!existsSync(file)) return null
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
    if (!isRecord(parsed)) throw new Error('不是对象')
    if (parsed['schemaVersion'] !== MODELS_VERSION) throw new CallError('newer-version', '版本不受支持')
    const records = parsed['models'] ?? []
    if (!Array.isArray(records)) throw new Error('models 不是列表')
    const seen = new Set<string>()
    const slots = records.slice(0, MAX_MODELS).map((raw): ModelSlot => {
      const read = parseModelRecord(raw, seen)
      if (typeof read === 'string') return { unreadable: raw, failure: read }
      seen.add(read.id)
      return { entry: read, raw: raw as Record<string, unknown> }
    })
    const chosen = parsed['default']
    return {
      slots,
      defaultModel: typeof chosen === 'string' && seen.has(chosen) ? chosen : null,
      raw: parsed,
      stored: true,
    }
  } catch (error) {
    throw new CallError(
      callFailure(error) === 'newer-version' ? 'newer-version' : 'invalid',
      `模型列表无效：${error instanceof Error ? error.message : String(error)}`, { cause: error },
    )
  }
}
