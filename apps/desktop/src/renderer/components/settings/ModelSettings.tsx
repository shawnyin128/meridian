import { useEffect, useState } from 'react'
import type {
  HarnessModelConnectionCheckResult, HarnessModelProfile, HarnessModelProtocol,
  HarnessModelProvider, HarnessModelSettings,
} from '../../../shared/contract.js'
import { harness } from '../../ipc.js'
import { useMessages } from '../../messages/useMessages.js'
import { FormInput, FormSelect } from '../FormControls.js'
import {
  ServiceActions, ServiceCard, ServiceClearKeyButton, ServiceConnectionStatus, ServiceError, ServiceField,
  ServiceFoot, ServiceSavedKey, ServiceStatus,
} from './ServiceCard.js'

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

export function ModelSettings() {
  const m = useMessages()
  const [settings, setSettings] = useState<HarnessModelSettings | null>(null)
  const [provider, setProvider] = useState<HarnessModelProvider>('openai')
  const [protocol, setProtocol] = useState<HarnessModelProtocol>(PROVIDERS.openai.protocol)
  const [baseUrl, setBaseUrl] = useState(PROVIDERS.openai.baseUrl)
  const [model, setModel] = useState('')
  const [authentication, setAuthentication] = useState<'api-key' | 'none'>('api-key')
  const [compatibleTemplate, setCompatibleTemplate] = useState<CompatibleTemplateId>('choose')
  const [apiKey, setApiKey] = useState('')
  const [editingApiKey, setEditingApiKey] = useState(false)
  const [clearApiKey, setClearApiKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
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

  useEffect(() => {
    void harness.modelSettings().then((next) => {
      setSettings(next)
      setProvider(next.provider)
      setProtocol(next.protocol)
      setBaseUrl(next.baseUrl)
      setModel(next.model)
      setAuthentication(next.authentication)
      setCompatibleTemplate(next.provider === 'openai-compatible'
        ? compatibleTemplateFor(next.baseUrl, next.protocol, next.authentication)
        : 'choose')
    }).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : String(caught)))
  }, [])

  useEffect(() => {
    setConnectionCheck({ state: 'idle' })
  }, [provider, protocol, baseUrl, model, authentication, apiKey, clearApiKey])

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
    setError(null)
    try {
      const next = await harness.updateModelSettings({
        provider, protocol, baseUrl, model, authentication,
        ...(apiKey.trim() === '' ? {} : { apiKey }),
        ...(clearApiKey ? { clearApiKey: true } : {}),
      })
      setSettings(next)
      showProfile(next)
      setConnectionCheck({ state: 'idle' })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setSaving(false)
    }
  }

  const testConnection = async () => {
    setConnectionCheck({ state: 'testing' })
    try {
      setConnectionCheck(await harness.checkModelConnection())
    } catch {
      setConnectionCheck({
        state: 'failed', reason: 'unavailable',
        detail: m.settings.model.connection.unexpectedDetail,
        modelCalls: 0, maxOutputTokens: 1,
      })
    }
  }

  if (settings === null) return <div className="storage-loading">{m.settings.model.loading}</div>

  const selected = { ...PROVIDERS[provider], ...m.settings.model.providers[provider] }
  const selectedCompatibleTemplate = compatibleTemplate !== 'choose' && compatibleTemplate !== 'custom'
    ? { ...COMPATIBLE_TEMPLATES[compatibleTemplate], ...m.settings.model.templates[compatibleTemplate] }
    : null
  const compatibleTemplatePending = provider === 'openai-compatible' && compatibleTemplate === 'choose'
  const modelPlaceholder = selectedCompatibleTemplate?.modelPlaceholder ?? selected.modelPlaceholder
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
  const canTestConnection = settings.configured && activeSelection
    && apiKey.trim() === '' && !clearApiKey
  const connectionStatus = connectionCheck.state === 'connected'
    ? m.settings.model.connection.connected
    : connectionCheck.state === 'failed'
      ? m.settings.model.connection.failures[connectionCheck.reason]
      : null

  return (
    <ServiceCard className="model-settings-card">
      <ServiceStatus
        title={selected.label}
        description={selected.description}
        configured={savedSelection && savedProfile?.configured === true}
        configuredLabel={m.settings.model.configured}
        notConfiguredLabel={m.settings.model.notConfigured}
      />
      <ServiceField label={m.settings.model.fields.providerLabel}>
        <FormSelect appearance="field" aria-label={m.settings.model.fields.providerLabel} value={provider}
          onChange={(event) => selectProvider(event.target.value as HarnessModelProvider)}>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="google-gemini">Google Gemini</option>
          <option value="openai-compatible">{m.settings.model.providers['openai-compatible'].label}</option>
        </FormSelect>
      </ServiceField>
      {provider === 'openai-compatible' ? (
        <>
          <ServiceField label={m.settings.model.templates.chooseLabel}>
            <FormSelect appearance="field" aria-label={m.settings.model.templates.chooseAria} value={compatibleTemplate}
              onChange={(event) => selectCompatibleTemplate(event.target.value as CompatibleTemplateId)}>
              <option value="choose">{m.settings.model.templates.choosePlaceholder}</option>
              <option value="deepseek">{m.settings.model.templates.deepseek.label}</option>
              <option value="openrouter">{m.settings.model.templates.openrouter.label}</option>
              <option value="ollama">{m.settings.model.templates.ollama.label}</option>
              <option value="lm-studio">{m.settings.model.templates['lm-studio'].label}</option>
              <option value="custom">{m.settings.model.templates.custom}</option>
            </FormSelect>
          </ServiceField>
          {compatibleTemplate === 'custom' ? (
            <>
              <ServiceField label={m.settings.model.fields.protocolLabel}>
                <FormSelect appearance="field" aria-label={m.settings.model.fields.protocolAria} value={protocol}
                  onChange={(event) => setProtocol(event.target.value as HarnessModelProtocol)}>
                  <option value="responses">Responses API</option>
                  <option value="chat-completions">Chat Completions API</option>
                </FormSelect>
              </ServiceField>
              <ServiceField label={m.settings.model.fields.baseUrlLabel}>
                <FormInput appearance="field" aria-label={m.settings.model.fields.baseUrlAria} value={baseUrl}
                  placeholder={m.settings.model.providers['openai-compatible'].baseUrlPlaceholder}
                  onChange={(event) => setBaseUrl(event.target.value)} />
              </ServiceField>
              <ServiceField label={m.settings.model.fields.authLabel}>
                <FormSelect appearance="field" aria-label={m.settings.model.fields.authAria} value={authentication}
                  onChange={(event) => setAuthentication(event.target.value as 'api-key' | 'none')}>
                  <option value="api-key">{m.settings.model.fields.apiKeyLabel}</option>
                  <option value="none">{m.settings.model.fields.authNoneOption}</option>
                </FormSelect>
              </ServiceField>
            </>
          ) : selectedCompatibleTemplate === null ? (
            <p className="model-template-help">{m.settings.model.templates.help}</p>
          ) : (
            <div className="model-template-summary" aria-label={m.settings.model.templates.summaryAria}>
              <span>{selectedCompatibleTemplate.protocolLabel} · {selectedCompatibleTemplate.authenticationLabel}</span>
              <code>{selectedCompatibleTemplate.baseUrl}</code>
            </div>
          )}
        </>
      ) : (
        <div className="model-protocol" aria-label={m.settings.model.fields.protocolAria}>
          <span>{m.settings.model.fields.protocolLabel}</span><strong>{selected.protocolLabel}</strong>
        </div>
      )}
      {compatibleTemplatePending ? null : (
        <>
          <ServiceField label={m.settings.model.fields.modelIdLabel}>
            <FormInput appearance="field" aria-label={m.settings.model.fields.modelIdAria} value={model}
              placeholder={modelPlaceholder} onChange={(event) => setModel(event.target.value)} />
          </ServiceField>
          {authentication === 'api-key' ? (
            <ServiceField label={m.settings.model.fields.apiKeyLabel}>
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
                  placeholder={m.settings.model.apiKeyPlaceholder}
                  onBlur={() => { if (apiKey === '') setEditingApiKey(false) }}
                  onChange={(event) => {
                    setApiKey(event.target.value)
                    setEditingApiKey(true)
                    setClearApiKey(false)
                  }} />
              )}
            </ServiceField>
          ) : null}
        </>
      )}
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
          {authentication === 'api-key' && savedKeyAvailable ? (
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
          <button
            className="btn" disabled={!canTestConnection || saving || connectionCheck.state === 'testing'}
            title={canTestConnection
              ? m.settings.model.connection.cost
              : m.settings.model.connection.saveFirst}
            onClick={() => { void testConnection() }}
          >
            {connectionCheck.state === 'testing'
              ? m.settings.model.connection.testing
              : m.settings.model.connection.action}
          </button>
          <button className="btn pri" disabled={saving || compatibleTemplatePending}
            onClick={() => { void save() }}>
            {saving ? m.settings.model.saving : m.settings.model.save}
          </button>
        </ServiceActions>
      </ServiceFoot>
      {settings.error === undefined ? null : (
        <ServiceError>{m.settings.model.errorHint(settings.error)}</ServiceError>
      )}
      {error === null ? null : <ServiceError>{error}</ServiceError>}
    </ServiceCard>
  )
}
