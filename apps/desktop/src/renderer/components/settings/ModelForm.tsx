import { useEffect, useRef, useState } from 'react'
import type {
  HarnessCli, HarnessModelConnectionCheckResult, HarnessModelEfforts, HarnessModelEntry, HarnessModelProfile,
  HarnessModelProtocol, HarnessModelProvider, HarnessModelSettings, HarnessModelSourceInput, HarnessSubscriptionStatus,
} from '../../../shared/contract.js'
import { HARNESS_API_EFFORTS } from '../../../shared/contract.js'
import { harness } from '../../ipc.js'
import { useScreenLoad } from '../../hooks/useScreenLoad.js'
import { errorLabel } from '../../lib/failure-label.js'
import { COMPATIBLE_TEMPLATES, compatibleTemplateAt, type CompatibleTemplate, profileKey, trimBaseUrl } from '../../lib/model-source.js'
import { useMessages } from '../../messages/useMessages.js'
import { ChoicePicker } from '../FieldPickers.js'
import { FieldRow, FieldRows, FormInput } from '../FormControls.js'
import { InlineMessage } from '../InlineMessage.js'
import { LoadingPlaceholder } from '../LoadingPlaceholder.js'
import { TabbedSection } from '../TabbedSection.js'
import { Tag } from '../Tag.js'
import {
  ServiceActions, ServiceClearKeyButton, ServiceConnectionStatus, ServiceError, ServiceFoot, ServiceSavedKey,
  ServiceStatusPill,
} from './ServiceCard.js'
import { Button } from '../Button.js'
import { CommandTray } from '../CommandTray.js'
import { CommitActions } from '../CommitActions.js'
import { SubscriptionModelField } from './SubscriptionModelField.js'

/** Structural, language-neutral data for each provider. Copy comes from the catalog by provider id. */
const PROVIDERS: Record<HarnessModelProvider, {
  protocol: HarnessModelProtocol
  protocolLabel: string
  baseUrl: string
  authentication: 'api-key' | 'none'
}> = {
  openai: {
    protocol: 'responses',
    protocolLabel: 'Responses API',
    baseUrl: 'https://api.openai.com/v1',
    authentication: 'api-key',
  },
  anthropic: {
    protocol: 'messages',
    protocolLabel: 'Messages API',
    baseUrl: 'https://api.anthropic.com',
    authentication: 'api-key',
  },
  'google-gemini': {
    protocol: 'generate-content',
    protocolLabel: 'generateContent API',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    authentication: 'api-key',
  },
  'openai-compatible': {
    protocol: 'responses',
    protocolLabel: 'Responses API',
    baseUrl: '',
    authentication: 'api-key',
  },
}

type CompatibleTemplateId = 'choose' | CompatibleTemplate | 'custom'
const TEMPLATE_CHOICES: readonly CompatibleTemplateId[] = ['choose', 'deepseek', 'openrouter', 'ollama', 'lm-studio', 'custom']
const PROVIDER_CHOICES: readonly HarnessModelProvider[] = ['openai', 'anthropic', 'google-gemini', 'openai-compatible']
const PROVIDER_NAMES: Record<Exclude<HarnessModelProvider, 'openai-compatible'>, string> = {
  openai: 'OpenAI', anthropic: 'Anthropic', 'google-gemini': 'Google Gemini',
}
/** The card's tabs: the API providers, and the subscriptions a CLI runs on. */
type ModelTab = 'api' | 'subscription'
const CLI_CHOICES: readonly HarnessCli[] = ['claude', 'codex']
/** The CLI each subscription runs on, by its product name. */
const CLI_NAMES: Record<HarnessCli, string> = { claude: 'Claude Code', codex: 'Codex' }
/** The command that signs each CLI in with the user's subscription, which the user runs in a terminal. */
const SIGN_IN_COMMANDS: Record<HarnessCli, string> = { claude: 'claude auth login', codex: 'codex login' }
/** The protocols an OpenAI-compatible service may speak, by their API names. */
const COMPATIBLE_PROTOCOLS: readonly HarnessModelProtocol[] = ['responses', 'chat-completions']
const AUTHENTICATIONS = ['api-key', 'none'] as const
const NO_EFFORTS: HarnessModelEfforts = { levels: [] }

const compatibleTemplateFor = (
  baseUrl: string,
  protocol: HarnessModelProtocol,
  authentication: 'api-key' | 'none',
): CompatibleTemplateId => {
  const template = compatibleTemplateAt(baseUrl)
  return template !== undefined && COMPATIBLE_TEMPLATES[template].protocol === protocol
    && COMPATIBLE_TEMPLATES[template].authentication === authentication ? template : 'custom'
}

const profileFor = (
  settings: HarnessModelSettings | null,
  provider: HarnessModelProvider,
  baseUrl?: string,
): HarnessModelProfile | undefined => settings?.profiles.find((profile) => (
  profile.provider === provider
  && (provider !== 'openai-compatible' || baseUrl === undefined
    || trimBaseUrl(profile.baseUrl) === trimBaseUrl(baseUrl))
))

type ConnectionCheckState = { state: 'idle' | 'testing' } | HarnessModelConnectionCheckResult

/**
 * The reasoning effort picker of a model: each level `efforts` lists, by its own name, where `''`
 * stands for the provider's or CLI's own default. That is the default level `efforts` names, which
 * carries the default mark, or else a default option before the levels.
 */
function EffortField({ value, efforts, onChange }: {
  value: string
  efforts: HarnessModelEfforts
  onChange: (effort: string) => void
}) {
  const m = useMessages()
  const named = efforts.default
  return (
    <ChoicePicker
      appearance="field" aria-label={m.settings.model.fields.effortLabel} value={value} placeholder={value}
      options={named === undefined ? ['', ...efforts.levels] : efforts.levels.map((level) => (level === named ? '' : level))}
      onPick={onChange}
      label={(option) => (option !== '' ? option : named ?? m.settings.model.fields.effortDefault)}
      note={(option) => (option === '' && named !== undefined ? m.settings.model.fields.effortDefault : undefined)}
    />
  )
}

/** The draft fields of an API source, and those of a subscription. */
const DRAFT_API_FIELDS = ['provider', 'protocol', 'baseUrl', 'authentication', 'compatibleTemplate']
const DRAFT_CLI_FIELDS = ['cli', 'cliModel', 'cliEffort']

/** What a new model's form keeps as its draft: every field but the key, which is never kept. */
export type ModelDraft = Partial<{
  tab: ModelTab
  provider: HarnessModelProvider
  protocol: HarnessModelProtocol
  baseUrl: string
  model: string
  effort: string
  authentication: 'api-key' | 'none'
  cli: HarnessCli
  cliModel: string
  cliEffort: string
  compatibleTemplate: CompatibleTemplateId
}>

/**
 * The model settings form: it configures a source not configured yet, offering only the sources
 * `taken`, the ids of those configured already, leaves out (an OpenAI-compatible service is a source
 * per base URL), or, given `entry`, saves that configured source anew, its source fixed. It holds the
 * API and subscription tabs, the service, the source's default model ID, its reasoning effort and the
 * key, a connection check of `entry` as saved, Cancel when there is `onCancel`, and Save. It starts
 * from `kept.draft` over `entry`, a draft's source only while that is still free, and once something
 * changes gives `kept.onChange` what it shows, the key left out. `onSaved` gets the settings the save
 * returned; `onCopy` puts a command on the clipboard and resolves whether it did.
 */
export function ModelForm({ settings, entry, taken, kept, onSaved, onCancel, onCopy }: {
  settings: HarnessModelSettings
  entry?: HarnessModelEntry
  taken: readonly string[]
  kept?: { draft: ModelDraft; onChange: (next: ModelDraft) => void }
  onSaved: (next: HarnessModelSettings) => void
  onCancel?: () => void
  onCopy: (text: string) => Promise<boolean>
}) {
  const m = useMessages()
  const source = entry?.source
  const profile = source?.kind === 'api' ? settings.profiles.find((held) => profileKey(held) === source.profile) : undefined
  const freeProviders = entry === undefined
    ? PROVIDER_CHOICES.filter((option) => option === 'openai-compatible' || !taken.includes(`api:${option}`))
    : PROVIDER_CHOICES.filter((option) => option === profile?.provider)
  const freeClis = entry === undefined ? CLI_CHOICES.filter((option) => !taken.includes(`cli:${option}`))
    : CLI_CHOICES.filter((option) => source?.kind === 'cli' && option === source.cli)
  const stored = kept?.draft ?? {}
  // A draft's source the list took since the draft was kept no longer starts the form.
  const apiFree = stored.provider === undefined || freeProviders.includes(stored.provider)
  const cliFree = stored.cli === undefined || freeClis.includes(stored.cli)
  const draft = Object.fromEntries(Object.entries(stored).filter(([key]) => (apiFree || !DRAFT_API_FIELDS.includes(key))
    && (cliFree || !DRAFT_CLI_FIELDS.includes(key)))) as ModelDraft
  const startProvider = draft.provider ?? profile?.provider ?? freeProviders[0] ?? 'openai'
  const [provider, setProvider] = useState<HarnessModelProvider>(startProvider)
  const [protocol, setProtocol] = useState<HarnessModelProtocol>(draft.protocol ?? profile?.protocol ?? PROVIDERS[startProvider].protocol)
  const [baseUrl, setBaseUrl] = useState(draft.baseUrl ?? profile?.baseUrl ?? PROVIDERS[startProvider].baseUrl)
  const [model, setModel] = useState(draft.model ?? (source?.kind === 'api' ? entry!.model : ''))
  // The reasoning effort the API tab shows, '' for the provider's own default.
  const [effort, setEffort] = useState(draft.effort ?? (source?.kind === 'api' ? entry!.effort ?? '' : ''))
  const [authentication, setAuthentication] = useState<'api-key' | 'none'>(
    draft.authentication ?? profile?.authentication ?? PROVIDERS[startProvider].authentication,
  )
  const [tab, setTab] = useState<ModelTab>(source !== undefined ? (source.kind === 'cli' ? 'subscription' : 'api')
    : draft.tab === 'subscription' && freeClis.length > 0 ? 'subscription' : 'api')
  // The subscription the subscription tab shows.
  const [cli, setCli] = useState<HarnessCli>(draft.cli ?? (source?.kind === 'cli' ? source.cli : freeClis[0] ?? 'claude'))
  const [cliModel, setCliModel] = useState(draft.cliModel ?? (source?.kind === 'cli' ? entry!.model : ''))
  const [cliEffort, setCliEffort] = useState(draft.cliEffort ?? (source?.kind === 'cli' ? entry!.effort ?? '' : ''))
  const [cliStatus, setCliStatus] = useState<HarnessSubscriptionStatus | null>(null)
  const [statusReads, setStatusReads] = useState(0)
  const [compatibleTemplate, setCompatibleTemplate] = useState<CompatibleTemplateId>(draft.compatibleTemplate
    ?? (profile?.provider === 'openai-compatible' ? compatibleTemplateFor(profile.baseUrl, profile.protocol, profile.authentication) : 'choose'))
  const keep = useRef(kept?.onChange)
  keep.current = kept?.onChange
  // The form keeps a draft only once something in it has changed.
  const shown = useRef(false)
  useEffect(() => {
    if (!shown.current) {
      shown.current = true
      return
    }
    keep.current?.({ tab, provider, protocol, baseUrl, model, effort, authentication, cli, cliModel, cliEffort, compatibleTemplate })
  }, [tab, provider, protocol, baseUrl, model, effort, authentication, cli, cliModel, cliEffort, compatibleTemplate])
  const [apiKey, setApiKey] = useState('')
  const [editingApiKey, setEditingApiKey] = useState(false)
  const [clearApiKey, setClearApiKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const { failure, load } = useScreenLoad(['subscription'])
  const [connectionCheck, setConnectionCheck] = useState<ConnectionCheckState>({ state: 'idle' })

  const resetCredentialDraft = () => {
    setApiKey('')
    setEditingApiKey(false)
    setClearApiKey(false)
  }

  const showProfile = (shown: HarnessModelProfile) => {
    setProvider(shown.provider)
    setProtocol(shown.protocol)
    setBaseUrl(shown.baseUrl)
    setAuthentication(shown.authentication)
    setCompatibleTemplate(shown.provider === 'openai-compatible'
      ? compatibleTemplateFor(shown.baseUrl, shown.protocol, shown.authentication)
      : 'choose')
    resetCredentialDraft()
  }

  useEffect(() => {
    if (tab !== 'subscription') return
    return load('subscription', harness.subscriptionStatus(cli), setCliStatus)
  }, [tab, cli, statusReads, load])

  useEffect(() => {
    setConnectionCheck({ state: 'idle' })
  }, [tab, provider, protocol, baseUrl, model, effort, authentication, apiKey, clearApiKey, cli, cliModel, cliEffort])

  const selectCli = (next: HarnessCli) => {
    if (next !== cli) setCliStatus(null)
    setCli(next)
    setCliEffort('')
  }

  /** The reasoning efforts CLI model `name` takes, as the CLI's status lists them. */
  const cliEffortsOf = (name: string) => (cliStatus?.state === 'found'
    ? cliStatus.efforts[name.trim()] ?? cliStatus.efforts[''] ?? NO_EFFORTS
    : NO_EFFORTS)

  const changeCliModel = (next: string) => {
    setCliModel(next)
    const efforts = cliEffortsOf(next)
    if (!efforts.levels.includes(cliEffort) || cliEffort === efforts.default) setCliEffort('')
  }

  const selectProvider = (next: HarnessModelProvider) => {
    const saved = profileFor(settings, next)
    setEffort('')
    if (saved !== undefined) {
      showProfile(saved)
      return
    }
    const preset = PROVIDERS[next]
    setProvider(next)
    setProtocol(preset.protocol)
    setBaseUrl(preset.baseUrl)
    setAuthentication(preset.authentication)
    setCompatibleTemplate('choose')
    resetCredentialDraft()
  }

  const selectCompatibleTemplate = (next: CompatibleTemplateId) => {
    setCompatibleTemplate(next)
    if (next === 'choose') {
      setProtocol(PROVIDERS['openai-compatible'].protocol)
      setBaseUrl('')
      setAuthentication(PROVIDERS['openai-compatible'].authentication)
    } else if (next === 'custom') {
      const saved = settings.profiles.find((held) => (
        held.provider === 'openai-compatible'
        && compatibleTemplateFor(held.baseUrl, held.protocol, held.authentication) === 'custom'
      ))
      if (saved !== undefined) {
        showProfile(saved)
      } else {
        setProtocol(PROVIDERS['openai-compatible'].protocol)
        setBaseUrl('')
        setAuthentication(PROVIDERS['openai-compatible'].authentication)
      }
    } else {
      const template = COMPATIBLE_TEMPLATES[next]
      setProtocol(template.protocol)
      setBaseUrl(template.baseUrl)
      setAuthentication(template.authentication)
    }
    resetCredentialDraft()
  }

  const save = async () => {
    setSaving(true)
    setSaveError(null)
    const saving: HarnessModelSourceInput = tab === 'api'
      ? {
          kind: 'api', provider, protocol, baseUrl, authentication,
          ...(apiKey.trim() === '' ? {} : { apiKey }),
          ...(clearApiKey ? { clearApiKey: true } : {}),
        }
      : { kind: 'cli', cli }
    const chosen = tab === 'api' ? effort : cliEffort
    const params = { source: saving, model: tab === 'api' ? model : cliModel, ...(chosen === '' ? {} : { effort: chosen }) }
    try {
      onSaved(entry === undefined ? await harness.addModel(params) : await harness.updateModel({ id: entry.id, ...params }))
    } catch (caught) {
      setSaveError(errorLabel(m, caught))
    } finally {
      setSaving(false)
    }
  }

  const testConnection = async () => {
    if (entry === undefined) return
    setConnectionCheck({ state: 'testing' })
    try {
      setConnectionCheck(await harness.checkModelConnection(entry.id))
      if (tab === 'subscription') setStatusReads((reads) => reads + 1)
    } catch {
      setConnectionCheck({
        state: 'failed', reason: 'unavailable',
        detail: m.settings.model.connection.unexpectedDetail,
        modelCalls: 0, maxOutputTokens: 1,
      })
    }
  }

  const selected = { ...PROVIDERS[provider], ...m.settings.model.providers[provider] }
  const apiEfforts = HARNESS_API_EFFORTS[provider]
  const selectedCompatibleTemplate = compatibleTemplate !== 'choose' && compatibleTemplate !== 'custom'
    ? { ...COMPATIBLE_TEMPLATES[compatibleTemplate], ...m.settings.model.templates[compatibleTemplate] }
    : null
  const compatibleTemplatePending = provider === 'openai-compatible' && compatibleTemplate === 'choose'
  const savedProfile = profileFor(settings, provider, baseUrl)
  const savedKeyAvailable = savedProfile?.apiKeyConfigured === true
  const showingSavedApiKey = savedKeyAvailable && !editingApiKey && !clearApiKey
  // Whether the form shows `entry` as it is saved, so the connection check checks what the form shows.
  const unchanged = entry !== undefined && (entry.source.kind === 'cli'
    ? tab === 'subscription' && cli === entry.source.cli && cliModel.trim() === entry.model && cliEffort === (entry.effort ?? '')
    : tab === 'api' && profile !== undefined && savedProfile === profile && protocol === profile.protocol
      && authentication === profile.authentication && model.trim() === entry.model && effort === (entry.effort ?? '')
      && apiKey.trim() === '' && !clearApiKey)
  const canTestConnection = unchanged && entry.configured
  const connectionStatus = connectionCheck.state === 'connected'
    ? tab === 'subscription'
      ? m.settings.model.connection.subscriptionConnected
      : m.settings.model.connection.connected
    : connectionCheck.state === 'failed'
      ? m.settings.model.connection.failures[connectionCheck.reason]
      : null
  const statusFailure = failure('subscription')

  const subscriptionPanel = (
    <>
      <FieldRows>
        <FieldRow label={m.settings.model.fields.providerLabel}>
          <ChoicePicker
            appearance="field" aria-label={m.settings.model.fields.providerLabel} value={cli}
            options={freeClis} onPick={selectCli} label={(option) => m.settings.model.subscriptions[option].label}
          />
        </FieldRow>
        <FieldRow label={m.settings.model.subscription.cliLabel}>
          {statusFailure !== null ? (
            <InlineMessage tone="error" variant="line">{statusFailure}</InlineMessage>
          ) : cliStatus === null ? (
            <LoadingPlaceholder shape="ring" holds="text" />
          ) : cliStatus.state === 'missing' ? (
            <InlineMessage tone="warning" variant="line">{m.settings.model.subscription.missing}</InlineMessage>
          ) : cliStatus.state === 'unsupported' ? (
            <InlineMessage tone="warning" variant="line">
              {cliStatus.version === null
                ? m.settings.model.subscription.unsupported
                : `${cliStatus.version} · ${m.settings.model.subscription.unsupported}`}
            </InlineMessage>
          ) : (
            <span>{cliStatus.version === null ? CLI_NAMES[cli] : `${CLI_NAMES[cli]} ${cliStatus.version}`}</span>
          )}
        </FieldRow>
        {statusFailure === null && cliStatus === null ? (
          <FieldRow label={m.settings.model.subscription.signInLabel}>
            <LoadingPlaceholder shape="ring" holds="tag" />
          </FieldRow>
        ) : statusFailure === null && cliStatus?.state === 'found' ? (
          <FieldRow label={m.settings.model.subscription.signInLabel}>
            <Tag state={cliStatus.signIn === 'subscription' ? 'done' : 'warning'}>
              {m.settings.model.subscription.signIn[cliStatus.signIn]}
            </Tag>
          </FieldRow>
        ) : null}
        <FieldRow label={m.settings.model.fields.modelIdLabel}>
          {statusFailure === null && cliStatus === null ? <LoadingPlaceholder shape="ring" holds="field" /> : (
            <SubscriptionModelField
              value={cliModel} models={cliStatus?.state === 'found' ? cliStatus.models : []} onChange={changeCliModel}
            />
          )}
        </FieldRow>
        <FieldRow label={m.settings.model.fields.effortLabel}>
          {statusFailure === null && cliStatus === null ? <LoadingPlaceholder shape="ring" holds="field" /> : (
            <EffortField value={cliEffort} efforts={cliEffortsOf(cliModel)} onChange={setCliEffort} />
          )}
        </FieldRow>
      </FieldRows>
      {statusFailure === null && cliStatus?.state === 'found' && cliStatus.signIn !== 'subscription' ? (
        <CommandTray
          heading={m.settings.model.subscription.signInCommand} command={SIGN_IN_COMMANDS[cli]}
          copyLabel={m.settings.model.subscription.copySignIn(CLI_NAMES[cli])} onCopy={onCopy}
        />
      ) : null}
    </>
  )

  const apiPanel = (
    <FieldRows>
      <FieldRow label={m.settings.model.fields.providerLabel}>
        <ChoicePicker
          appearance="field" aria-label={m.settings.model.fields.providerLabel} value={provider}
          options={freeProviders} onPick={selectProvider}
          label={(option) => (option === 'openai-compatible' ? m.settings.model.providers[option].label : PROVIDER_NAMES[option])}
        />
      </FieldRow>
      {provider === 'openai-compatible' ? (
        <>
          <FieldRow label={m.settings.model.templates.chooseLabel}>
            <ChoicePicker
              appearance="field" aria-label={m.settings.model.templates.chooseAria} value={compatibleTemplate}
              options={entry === undefined ? TEMPLATE_CHOICES.filter((option) => option === 'choose' || option === 'custom'
                || !taken.includes(`api:openai-compatible:${COMPATIBLE_TEMPLATES[option].baseUrl}`)) : [compatibleTemplate]}
              onPick={selectCompatibleTemplate}
              label={(option) => (option === 'choose' ? m.settings.model.templates.choosePlaceholder
                : option === 'custom' ? m.settings.model.templates.custom : m.settings.model.templates[option].label)}
            />
          </FieldRow>
          {compatibleTemplate === 'custom' ? (
            <>
              <FieldRow label={m.settings.model.fields.protocolLabel}>
                <ChoicePicker
                  appearance="field" aria-label={m.settings.model.fields.protocolAria} value={protocol}
                  options={COMPATIBLE_PROTOCOLS} onPick={setProtocol}
                  label={(option) => (option === 'responses' ? 'Responses API' : 'Chat Completions API')}
                />
              </FieldRow>
              <FieldRow label={m.settings.model.fields.baseUrlLabel}>
                <FormInput appearance="field" aria-label={m.settings.model.fields.baseUrlAria} value={baseUrl}
                  disabled={entry !== undefined} placeholder={m.settings.model.providers['openai-compatible'].baseUrlPlaceholder}
                  onChange={(event) => setBaseUrl(event.target.value)} />
              </FieldRow>
              <FieldRow label={m.settings.model.fields.authLabel}>
                <ChoicePicker
                  appearance="field" aria-label={m.settings.model.fields.authAria} value={authentication}
                  options={AUTHENTICATIONS} onPick={setAuthentication}
                  label={(option) => (option === 'api-key'
                    ? m.settings.model.fields.apiKeyLabel : m.settings.model.fields.authNoneOption)}
                />
              </FieldRow>
            </>
          ) : selectedCompatibleTemplate === null ? null : (
            <div className="model-template-summary" aria-label={m.settings.model.templates.summaryAria}>
              <span>{selectedCompatibleTemplate.protocolLabel} · {selectedCompatibleTemplate.authenticationLabel}</span>
              <code>{selectedCompatibleTemplate.baseUrl}</code>
            </div>
          )}
        </>
      ) : (
        <FieldRow label={m.settings.model.fields.protocolLabel}>
          <span aria-label={m.settings.model.fields.protocolAria}>{selected.protocolLabel}</span>
        </FieldRow>
      )}
      {compatibleTemplatePending ? null : (
        <>
          <FieldRow label={m.settings.model.fields.modelIdLabel}>
            <FormInput appearance="field" aria-label={m.settings.model.fields.modelIdAria} value={model}
              placeholder={m.settings.model.fields.modelIdLabel} onChange={(event) => setModel(event.target.value)} />
          </FieldRow>
          {apiEfforts.length === 0 ? null : (
            <FieldRow label={m.settings.model.fields.effortLabel}>
              <EffortField value={effort} efforts={{ levels: [...apiEfforts] }} onChange={setEffort} />
            </FieldRow>
          )}
          {authentication === 'api-key' ? (
            <FieldRow label={m.settings.model.fields.apiKeyLabel}>
              {showingSavedApiKey ? (
                <ServiceSavedKey
                  ariaLabel={m.settings.model.keyStored(savedProfile?.apiKeyLastFour ?? '')}
                  lastFour={savedProfile?.apiKeyLastFour}
                  onClick={() => setEditingApiKey(true)}
                />
              ) : (
                <FormInput appearance="field" aria-label={m.settings.model.fields.apiKeyAria} type="password"
                  value={apiKey} autoFocus={editingApiKey}
                  autoComplete="new-password" spellCheck={false}
                  placeholder={m.settings.model.fields.apiKeyLabel}
                  onBlur={() => { if (apiKey === '') setEditingApiKey(false) }}
                  onChange={(event) => {
                    setApiKey(event.target.value)
                    setEditingApiKey(true)
                    setClearApiKey(false)
                  }} />
              )}
            </FieldRow>
          ) : null}
        </>
      )}
    </FieldRows>
  )
  return (
    <>
      <TabbedSection
        level="group" label={m.settings.model.tabs.label} value={tab} onChange={setTab}
        heading={tab === 'api' ? selected.label : m.settings.model.subscriptions[cli].label}
        actions={entry === undefined ? undefined : (
          <ServiceStatusPill
            configured={entry.configured}
            configuredLabel={m.settings.model.configured} notConfiguredLabel={m.settings.model.notConfigured}
          />
        )}
        tabs={[
          { value: 'api', label: m.settings.model.tabs.api, content: apiPanel, disabled: source?.kind === 'cli' },
          {
            value: 'subscription', label: m.settings.model.tabs.subscription, content: subscriptionPanel,
            disabled: source === undefined ? freeClis.length === 0 : source.kind === 'api',
          },
        ]}
      />
      <ServiceFoot>
        {connectionStatus === null ? null : (
          <ServiceConnectionStatus
            state={connectionCheck.state === 'connected' ? 'connected' : 'failed'}
            message={connectionStatus}
            detail={connectionCheck.state === 'failed' ? connectionCheck.detail : undefined}
            detailLabel={m.settings.model.connection.detailLabel}
          />
        )}
        <ServiceActions>
          {tab === 'api' && authentication === 'api-key' && savedKeyAvailable ? (
            <ServiceClearKeyButton
              pending={clearApiKey}
              label={m.settings.model.clearKey}
              pendingLabel={m.settings.model.clearKeyPending}
              onClick={() => {
                setClearApiKey((current) => !current)
                setApiKey('')
                setEditingApiKey(false)
              }}
            />
          ) : null}
          <Button
            size="regular" disabled={!canTestConnection || saving}
            busy={connectionCheck.state === 'testing'} busyLabel={m.settings.model.connection.testing}
            onClick={() => { void testConnection() }}
          >{m.settings.model.connection.action}</Button>
          <CommitActions
            place="foot" saving={saving} {...(onCancel === undefined ? {} : { onCancel })}
            canSave={tab === 'subscription'
              ? statusFailure === null && cliStatus?.state === 'found'
              : !compatibleTemplatePending && model.trim() !== ''}
            saveLabel={m.settings.model.save} busyLabel={m.settings.model.saving}
            onSave={() => { void save() }}
          />
        </ServiceActions>
      </ServiceFoot>
      {saveError === null ? null : <ServiceError>{saveError}</ServiceError>}
    </>
  )
}
