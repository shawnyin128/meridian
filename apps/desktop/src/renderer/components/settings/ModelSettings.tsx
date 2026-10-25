import { useEffect, useState } from 'react'
import type {
  HarnessCli, HarnessModelConnectionCheckResult, HarnessModelProfile, HarnessModelProtocol,
  HarnessModelProvider, HarnessModelSettings, HarnessSubscriptionStatus,
} from '../../../shared/contract.js'
import { harness } from '../../ipc.js'
import { useScreenLoad } from '../../hooks/useScreenLoad.js'
import { errorLabel, reasonLabel } from '../../lib/failure-label.js'
import { useMessages } from '../../messages/useMessages.js'
import { ChoicePicker } from '../FieldPickers.js'
import { FieldRow, FieldRows, FormInput } from '../FormControls.js'
import { InlineMessage } from '../InlineMessage.js'
import { LoadingPlaceholder } from '../LoadingPlaceholder.js'
import { PageError } from '../PageShell.js'
import { TabbedSection } from '../TabbedSection.js'
import { Tag } from '../Tag.js'
import {
  ServiceActions, ServiceCard, ServiceClearKeyButton, ServiceConnectionStatus, ServiceError,
  ServiceFoot, ServiceSavedKey, ServiceStatusPill,
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

type CompatibleTemplateId = 'choose' | 'deepseek' | 'openrouter' | 'ollama' | 'lm-studio' | 'custom'
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

/** Structural, language-neutral data for each template. Copy comes from the catalog by template id. */
const COMPATIBLE_TEMPLATES: Record<Exclude<CompatibleTemplateId, 'choose' | 'custom'>, {
  protocol: Extract<HarnessModelProtocol, 'responses' | 'chat-completions'>
  protocolLabel: string
  baseUrl: string
  authentication: 'api-key' | 'none'
}> = {
  deepseek: {
    protocol: 'chat-completions',
    protocolLabel: 'Chat Completions API',
    baseUrl: 'https://api.deepseek.com',
    authentication: 'api-key',
  },
  openrouter: {
    protocol: 'chat-completions',
    protocolLabel: 'Chat Completions API',
    baseUrl: 'https://openrouter.ai/api/v1',
    authentication: 'api-key',
  },
  ollama: {
    protocol: 'responses',
    protocolLabel: 'Responses API',
    baseUrl: 'http://127.0.0.1:11434/v1',
    authentication: 'none',
  },
  'lm-studio': {
    protocol: 'responses',
    protocolLabel: 'Responses API',
    baseUrl: 'http://127.0.0.1:1234/v1',
    authentication: 'none',
  },
}

const compatibleTemplateFor = (
  baseUrl: string,
  protocol: HarnessModelProtocol,
  authentication: 'api-key' | 'none',
): CompatibleTemplateId => {
  const normalized = baseUrl.replace(/\/+$/, '')
  const match = Object.entries(COMPATIBLE_TEMPLATES).find(([, template]) => (
    template.baseUrl === normalized
    && template.protocol === protocol
    && template.authentication === authentication
  ))
  return match?.[0] as CompatibleTemplateId | undefined ?? 'custom'
}

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, '')

const profileFor = (
  settings: HarnessModelSettings | null,
  provider: HarnessModelProvider,
  baseUrl?: string,
): HarnessModelProfile | undefined => settings?.profiles.find((profile) => (
  profile.provider === provider
  && (provider !== 'openai-compatible' || baseUrl === undefined
    || normalizeBaseUrl(profile.baseUrl) === normalizeBaseUrl(baseUrl))
))

type ConnectionCheckState = { state: 'idle' | 'testing' } | HarnessModelConnectionCheckResult

/** The model settings card; `onCopy` puts a command on the clipboard and resolves whether it did. */
export function ModelSettings({ onCopy }: { onCopy: (text: string) => Promise<boolean> }) {
  const m = useMessages()
  const [settings, setSettings] = useState<HarnessModelSettings | null>(null)
  const [provider, setProvider] = useState<HarnessModelProvider>('openai')
  const [protocol, setProtocol] = useState<HarnessModelProtocol>(PROVIDERS.openai.protocol)
  const [baseUrl, setBaseUrl] = useState(PROVIDERS.openai.baseUrl)
  const [model, setModel] = useState('')
  const [authentication, setAuthentication] = useState<'api-key' | 'none'>('api-key')
  const [tab, setTab] = useState<ModelTab>('api')
  // The subscription the subscription tab shows.
  const [cli, setCli] = useState<HarnessCli>('claude')
  const [cliModel, setCliModel] = useState('')
  const [cliStatus, setCliStatus] = useState<HarnessSubscriptionStatus | null>(null)
  const [statusReads, setStatusReads] = useState(0)
  const [compatibleTemplate, setCompatibleTemplate] = useState<CompatibleTemplateId>('choose')
  const [apiKey, setApiKey] = useState('')
  const [editingApiKey, setEditingApiKey] = useState(false)
  const [clearApiKey, setClearApiKey] = useState(false)
  const [saving, setSaving] = useState(false)
  // Whether the last save succeeded; Save shows its check as it turns true.
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const { error, failure, load } = useScreenLoad(['subscription'])
  const [connectionCheck, setConnectionCheck] = useState<ConnectionCheckState>({ state: 'idle' })

  const resetCredentialDraft = () => {
    setApiKey('')
    setEditingApiKey(false)
    setClearApiKey(false)
  }

  const showProfile = (profile: HarnessModelProfile) => {
    setProvider(profile.provider)
    setProtocol(profile.protocol)
    setBaseUrl(profile.baseUrl)
    setModel(profile.model)
    setAuthentication(profile.authentication)
    setCompatibleTemplate(profile.provider === 'openai-compatible'
      ? compatibleTemplateFor(profile.baseUrl, profile.protocol, profile.authentication)
      : 'choose')
    resetCredentialDraft()
  }

  useEffect(() => load('settings', harness.modelSettings(), (next) => {
    setSettings(next)
    setProvider(next.provider)
    setProtocol(next.protocol)
    setBaseUrl(next.baseUrl)
    setModel(next.model)
    setAuthentication(next.authentication)
    setCompatibleTemplate(next.provider === 'openai-compatible'
      ? compatibleTemplateFor(next.baseUrl, next.protocol, next.authentication)
      : 'choose')
    const active = next.subscription.active
    setTab(active === null ? 'api' : 'subscription')
    setCli(active ?? 'claude')
    setCliModel(next.subscription.models[active ?? 'claude'])
  }), [load])

  useEffect(() => {
    if (tab !== 'subscription') return
    return load('subscription', harness.subscriptionStatus(cli), setCliStatus)
  }, [tab, cli, statusReads, load])

  useEffect(() => {
    setConnectionCheck({ state: 'idle' })
  }, [tab, provider, protocol, baseUrl, model, authentication, apiKey, clearApiKey, cli, cliModel])

  const selectCli = (next: HarnessCli) => {
    if (next !== cli) setCliStatus(null)
    setCli(next)
    setCliModel(settings?.subscription.models[next] ?? '')
  }

  const selectProvider = (next: HarnessModelProvider) => {
    const saved = profileFor(settings, next)
    if (saved !== undefined) {
      showProfile(saved)
      return
    }
    const preset = PROVIDERS[next]
    setProvider(next)
    setProtocol(preset.protocol)
    setBaseUrl(preset.baseUrl)
    setAuthentication(preset.authentication)
    setModel('')
    setCompatibleTemplate('choose')
    resetCredentialDraft()
  }

  const selectCompatibleTemplate = (next: CompatibleTemplateId) => {
    setCompatibleTemplate(next)
    if (next === 'choose') {
      setProtocol(PROVIDERS['openai-compatible'].protocol)
      setBaseUrl('')
      setAuthentication(PROVIDERS['openai-compatible'].authentication)
      setModel('')
    } else if (next === 'custom') {
      const saved = settings?.profiles.find((profile) => (
        profile.provider === 'openai-compatible'
        && compatibleTemplateFor(profile.baseUrl, profile.protocol, profile.authentication) === 'custom'
      ))
      if (saved !== undefined) {
        showProfile(saved)
      } else {
        setProtocol(PROVIDERS['openai-compatible'].protocol)
        setBaseUrl('')
        setAuthentication(PROVIDERS['openai-compatible'].authentication)
        setModel('')
      }
    } else {
      const template = COMPATIBLE_TEMPLATES[next]
      const saved = profileFor(settings, 'openai-compatible', template.baseUrl)
      setProtocol(template.protocol)
      setBaseUrl(template.baseUrl)
      setAuthentication(template.authentication)
      setModel(saved?.model ?? '')
    }
    resetCredentialDraft()
  }

  const save = async () => {
    setSaving(true)
    setSaved(false)
    setSaveError(null)
    try {
      const next = tab === 'api'
        ? await harness.updateModelSettings({
          provider, protocol, baseUrl, model, authentication,
          ...(apiKey.trim() === '' ? {} : { apiKey }),
          ...(clearApiKey ? { clearApiKey: true } : {}),
        })
        : await harness.updateSubscription({ cli, model: cliModel })
      setSaved(true)
      setSettings(next)
      if (tab === 'api') showProfile(next)
      else setCliModel(next.subscription.models[cli])
      setConnectionCheck({ state: 'idle' })
    } catch (caught) {
      setSaveError(errorLabel(m, caught))
    } finally {
      setSaving(false)
    }
  }

  const testConnection = async () => {
    setConnectionCheck({ state: 'testing' })
    try {
      setConnectionCheck(await harness.checkModelConnection())
      if (tab === 'subscription') setStatusReads((reads) => reads + 1)
    } catch {
      setConnectionCheck({
        state: 'failed', reason: 'unavailable',
        detail: m.settings.model.connection.unexpectedDetail,
        modelCalls: 0, maxOutputTokens: 1,
      })
    }
  }

  if (settings === null) {
    return error === null ? <LoadingPlaceholder shape="cards" count={1} /> : <PageError variant="section" error={error} />
  }

  const selected = { ...PROVIDERS[provider], ...m.settings.model.providers[provider] }
  const subscriptionSaved = settings.subscription.active === cli && cliModel.trim() === settings.subscription.models[cli]
  const selectedCompatibleTemplate = compatibleTemplate !== 'choose' && compatibleTemplate !== 'custom'
    ? { ...COMPATIBLE_TEMPLATES[compatibleTemplate], ...m.settings.model.templates[compatibleTemplate] }
    : null
  const compatibleTemplatePending = provider === 'openai-compatible' && compatibleTemplate === 'choose'
  const savedProfile = profileFor(settings, provider, baseUrl)
  const savedKeyAvailable = savedProfile?.apiKeyConfigured === true
  const savedSelection = savedProfile !== undefined
    && protocol === savedProfile.protocol
    && authentication === savedProfile.authentication
    && model === savedProfile.model
  const showingSavedApiKey = savedKeyAvailable && !editingApiKey && !clearApiKey
  const activeSelection = provider === settings.provider
    && protocol === settings.protocol
    && normalizeBaseUrl(baseUrl) === normalizeBaseUrl(settings.baseUrl)
    && model === settings.model
    && authentication === settings.authentication
  const canTestConnection = tab === 'subscription'
    ? subscriptionSaved
    : settings.configured && activeSelection && settings.subscription.active === null
      && settings.subscription.error === undefined && apiKey.trim() === '' && !clearApiKey
  const connectionStatus = connectionCheck.state === 'connected'
    ? connectionCheck.modelCalls === 0
      ? m.settings.model.connection.connectedNoModelCall
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
            options={CLI_CHOICES} onPick={selectCli} label={(option) => m.settings.model.subscriptions[option].label}
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
              value={cliModel} models={cliStatus?.state === 'found' ? cliStatus.models : []} onChange={setCliModel}
            />
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
          options={PROVIDER_CHOICES} onPick={selectProvider}
          label={(option) => (option === 'openai-compatible' ? m.settings.model.providers[option].label : PROVIDER_NAMES[option])}
        />
      </FieldRow>
      {provider === 'openai-compatible' ? (
        <>
          <FieldRow label={m.settings.model.templates.chooseLabel}>
            <ChoicePicker
              appearance="field" aria-label={m.settings.model.templates.chooseAria} value={compatibleTemplate}
              options={TEMPLATE_CHOICES} onPick={selectCompatibleTemplate}
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
                  placeholder={m.settings.model.providers['openai-compatible'].baseUrlPlaceholder}
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
    <ServiceCard className="model-settings-card">
      <TabbedSection
        level="group" label={m.settings.model.tabs.label} value={tab} onChange={setTab}
        heading={tab === 'api' ? selected.label : m.settings.model.subscriptions[cli].label}
        actions={(
          <ServiceStatusPill
            configured={tab === 'api' ? savedSelection && savedProfile?.configured === true : subscriptionSaved}
            configuredLabel={m.settings.model.configured} notConfiguredLabel={m.settings.model.notConfigured}
          />
        )}
        tabs={[
          { value: 'api', label: m.settings.model.tabs.api, content: apiPanel },
          { value: 'subscription', label: m.settings.model.tabs.subscription, content: subscriptionPanel },
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
            place="foot" saving={saving} done={saved}
            canSave={tab === 'subscription' ? statusFailure === null && cliStatus?.state === 'found' : !compatibleTemplatePending}
            saveLabel={m.settings.model.save} busyLabel={m.settings.model.saving}
            onSave={() => { void save() }}
          />
        </ServiceActions>
      </ServiceFoot>
      {settings.error === undefined ? null : (
        <ServiceError>{reasonLabel(m, settings.error)}</ServiceError>
      )}
      {settings.subscription.error === undefined ? null : (
        <ServiceError>{reasonLabel(m, settings.subscription.error)}</ServiceError>
      )}
      {saveError === null ? null : <ServiceError>{saveError}</ServiceError>}
    </ServiceCard>
  )
}
