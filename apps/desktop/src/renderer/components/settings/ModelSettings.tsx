import { useEffect, useState } from 'react'
import type {
  HarnessModelConnectionCheckResult, HarnessModelProfile, HarnessModelProtocol,
  HarnessModelProvider, HarnessModelSettings,
} from '../../../shared/contract.js'
import { harness } from '../../ipc.js'
import { useMessages } from '../../messages/useMessages.js'
import { FormButton, FormInput, FormSelect } from '../FormControls.js'

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
    <div className="model-settings-card">
      <div className="model-settings-status">
        <div>
          <strong>{selected.label}</strong>
          <p>{selected.description}</p>
        </div>
        <span className={savedSelection && savedProfile?.configured === true ? 'model-status ready' : 'model-status'}>
          {savedSelection && savedProfile?.configured === true
            ? m.settings.model.configured : m.settings.model.notConfigured}
        </span>
      </div>
      <label className="model-field">
        <span>{m.settings.model.fields.providerLabel}</span>
        <FormSelect appearance="field" aria-label={m.settings.model.fields.providerLabel} value={provider}
          onChange={(event) => selectProvider(event.target.value as HarnessModelProvider)}>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="google-gemini">Google Gemini</option>
          <option value="openai-compatible">{m.settings.model.providers['openai-compatible'].label}</option>
        </FormSelect>
      </label>
      {provider === 'openai-compatible' ? (
        <>
          <label className="model-field">
            <span>{m.settings.model.templates.chooseLabel}</span>
            <FormSelect appearance="field" aria-label={m.settings.model.templates.chooseAria} value={compatibleTemplate}
              onChange={(event) => selectCompatibleTemplate(event.target.value as CompatibleTemplateId)}>
              <option value="choose">{m.settings.model.templates.choosePlaceholder}</option>
              <option value="deepseek">{m.settings.model.templates.deepseek.label}</option>
              <option value="openrouter">{m.settings.model.templates.openrouter.label}</option>
              <option value="ollama">{m.settings.model.templates.ollama.label}</option>
              <option value="lm-studio">{m.settings.model.templates['lm-studio'].label}</option>
              <option value="custom">{m.settings.model.templates.custom}</option>
            </FormSelect>
          </label>
          {compatibleTemplate === 'custom' ? (
            <>
              <label className="model-field">
                <span>{m.settings.model.fields.protocolLabel}</span>
                <FormSelect appearance="field" aria-label={m.settings.model.fields.protocolAria} value={protocol}
                  onChange={(event) => setProtocol(event.target.value as HarnessModelProtocol)}>
                  <option value="responses">Responses API</option>
                  <option value="chat-completions">Chat Completions API</option>
                </FormSelect>
              </label>
              <label className="model-field">
                <span>{m.settings.model.fields.baseUrlLabel}</span>
                <FormInput appearance="field" aria-label={m.settings.model.fields.baseUrlAria} value={baseUrl}
                  placeholder={m.settings.model.providers['openai-compatible'].baseUrlPlaceholder}
                  onChange={(event) => setBaseUrl(event.target.value)} />
              </label>
              <label className="model-field">
                <span>{m.settings.model.fields.authLabel}</span>
                <FormSelect appearance="field" aria-label={m.settings.model.fields.authAria} value={authentication}
                  onChange={(event) => setAuthentication(event.target.value as 'api-key' | 'none')}>
                  <option value="api-key">{m.settings.model.fields.apiKeyLabel}</option>
                  <option value="none">{m.settings.model.fields.authNoneOption}</option>
                </FormSelect>
              </label>
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
          <label className="model-field">
            <span>{m.settings.model.fields.modelIdLabel}</span>
            <FormInput appearance="field" aria-label={m.settings.model.fields.modelIdAria} value={model}
              placeholder={modelPlaceholder} onChange={(event) => setModel(event.target.value)} />
          </label>
          {authentication === 'api-key' ? (
            <div className="model-field">
              <span>{m.settings.model.fields.apiKeyLabel}</span>
              {showingSavedApiKey ? (
                <FormButton appearance="field" className="model-saved-key"
                  aria-label={m.settings.model.keyStored(savedProfile?.apiKeyLastFour ?? '')}
                  onClick={() => setEditingApiKey(true)}>
                  <span className="model-key-mask" aria-hidden="true">••••••••</span>
                  <span className="model-key-tail">{savedProfile?.apiKeyLastFour}</span>
                </FormButton>
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
            </div>
          ) : null}
        </>
      )}
      <div className="model-settings-foot">
        {connectionStatus === null ? null : (
          <div
            className={`model-connection-status ${connectionCheck.state}`}
            role={connectionCheck.state === 'failed' ? 'alert' : 'status'}
          >
            <span>{connectionStatus}</span>
            {connectionCheck.state === 'failed' ? (
              <span className="model-connection-detail">
                {m.settings.model.connection.detailLabel}: {connectionCheck.detail}
              </span>
            ) : null}
          </div>
        )}
        <div className="model-settings-actions">
          {authentication === 'api-key' && savedKeyAvailable ? (
            <button className={clearApiKey ? 'btn model-clear-key on' : 'btn model-clear-key'}
              aria-pressed={clearApiKey}
              onClick={() => {
                setClearApiKey((current) => !current)
                setApiKey('')
                setEditingApiKey(false)
              }}>
              {clearApiKey ? m.settings.model.clearKeyPending : m.settings.model.clearKey}
            </button>
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
        </div>
      </div>
      {settings.error === undefined ? null : (
        <p className="model-settings-error" role="alert">{m.settings.model.errorHint(settings.error)}</p>
      )}
      {error === null ? null : <p className="model-settings-error" role="alert">{error}</p>}
    </div>
  )
}
