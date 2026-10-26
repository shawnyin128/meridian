import type {
  HarnessModelEntry, HarnessModelProfile, HarnessModelProtocol, HarnessModelProvider, HarnessModelSourceGroup,
} from '../../shared/contract.js'
import type { Catalog } from '../messages/catalog.js'

/** The products the official API providers are named by. */
const PROVIDER_NAMES: Record<Exclude<HarnessModelProvider, 'openai-compatible'>, string> = {
  openai: 'OpenAI', anthropic: 'Anthropic', 'google-gemini': 'Google Gemini',
}

/** A connection template of an OpenAI-compatible service. */
export type CompatibleTemplate = 'deepseek' | 'openrouter' | 'ollama' | 'lm-studio'

/**
 * Structural, language-neutral data for each connection template: the product it is named by, whether
 * it runs on this machine, and how it is reached. Copy comes from the catalog by template id.
 */
export const COMPATIBLE_TEMPLATES: Record<CompatibleTemplate, {
  name: string
  local: boolean
  protocol: Extract<HarnessModelProtocol, 'responses' | 'chat-completions'>
  protocolLabel: string
  baseUrl: string
  authentication: 'api-key' | 'none'
}> = {
  deepseek: {
    name: 'DeepSeek',
    local: false,
    protocol: 'chat-completions',
    protocolLabel: 'Chat Completions API',
    baseUrl: 'https://api.deepseek.com',
    authentication: 'api-key',
  },
  openrouter: {
    name: 'OpenRouter',
    local: false,
    protocol: 'chat-completions',
    protocolLabel: 'Chat Completions API',
    baseUrl: 'https://openrouter.ai/api/v1',
    authentication: 'api-key',
  },
  ollama: {
    name: 'Ollama',
    local: true,
    protocol: 'responses',
    protocolLabel: 'Responses API',
    baseUrl: 'http://127.0.0.1:11434/v1',
    authentication: 'none',
  },
  'lm-studio': {
    name: 'LM Studio',
    local: true,
    protocol: 'responses',
    protocolLabel: 'Responses API',
    baseUrl: 'http://127.0.0.1:1234/v1',
    authentication: 'none',
  },
}

/** Base URL `url` without its trailing slashes, as base URLs are compared. */
export const trimBaseUrl = (url: string): string => url.replace(/\/+$/, '')

/** The connection template whose base URL is `baseUrl`, trailing slashes aside, or undefined for none. */
export function compatibleTemplateAt(baseUrl: string): CompatibleTemplate | undefined {
  const trimmed = trimBaseUrl(baseUrl)
  return (Object.keys(COMPATIBLE_TEMPLATES) as CompatibleTemplate[]).find((id) => COMPATIBLE_TEMPLATES[id].baseUrl === trimmed)
}

/** The key Core keeps API profile `profile` under: its provider, or a compatible service's base URL. */
export const profileKey = (profile: Pick<HarnessModelProfile, 'provider' | 'baseUrl'>): string => (
  profile.provider === 'openai-compatible' ? `openai-compatible:${trimBaseUrl(profile.baseUrl)}` : profile.provider
)

/** The host names of this machine, as a URL's hostname gives them. */
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]']

/**
 * The name the model list and the chat's source picker give model source `group`: the subscription's;
 * a compatible service's connection template, its host without `api.`, `www.` or the port for one
 * elsewhere, or its port for one on this machine; or the provider's API.
 */
export function modelSourceLabel(m: Catalog, group: HarnessModelSourceGroup): string {
  const copy = m.settings.model.list
  if (group.source.kind === 'cli') return m.settings.model.subscriptions[group.source.cli].label
  if (group.provider !== 'openai-compatible' && group.provider !== undefined) return copy.apiSource(PROVIDER_NAMES[group.provider])
  const baseUrl = group.source.profile.slice('openai-compatible:'.length)
  const template = compatibleTemplateAt(baseUrl)
  if (template !== undefined) {
    const { name, local } = COMPATIBLE_TEMPLATES[template]
    return local ? copy.localSource(name) : copy.apiSource(name)
  }
  const url = new URL(baseUrl)
  return LOCAL_HOSTS.includes(url.hostname)
    ? copy.localService(url.port === '' ? (url.protocol === 'https:' ? '443' : '80') : url.port)
    : copy.apiSource(url.hostname.replace(/^(api|www)\./, ''))
}

/** The name a configured model shows by wherever one is named: its ID as configured, or the default model for a CLI's own default. */
export function modelEntryLabel(m: Catalog, entry: Pick<HarnessModelEntry, 'model'>): string {
  return entry.model === '' ? m.settings.model.list.defaultModel : entry.model
}
