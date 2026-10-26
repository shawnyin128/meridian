import type { HarnessModelEntry, HarnessModelProfile, HarnessModelProvider, HarnessModelSourceGroup } from '../../shared/contract.js'
import type { Catalog } from '../messages/catalog.js'

/** The products the official API providers are named by. */
const PROVIDER_NAMES: Record<Exclude<HarnessModelProvider, 'openai-compatible'>, string> = {
  openai: 'OpenAI', anthropic: 'Anthropic', 'google-gemini': 'Google Gemini',
}

/** The key Core keeps API profile `profile` under: its provider, or a compatible service's base URL. */
export const profileKey = (profile: Pick<HarnessModelProfile, 'provider' | 'baseUrl'>): string => (
  profile.provider === 'openai-compatible' ? `openai-compatible:${profile.baseUrl.replace(/\/+$/, '')}` : profile.provider
)

/**
 * The name the model list and the chat's source chip give model source `group`: the subscription's,
 * a compatible service's host, or the provider's API.
 */
export function modelSourceLabel(m: Catalog, group: HarnessModelSourceGroup): string {
  if (group.source.kind === 'cli') return m.settings.model.subscriptions[group.source.cli].label
  if (group.provider === 'openai-compatible' || group.provider === undefined) return group.host ?? group.source.profile
  return m.settings.model.list.apiSource(PROVIDER_NAMES[group.provider])
}

/** The name a configured model shows by wherever one is named: its ID as configured, or the default model for a CLI's own default. */
export function modelEntryLabel(m: Catalog, entry: Pick<HarnessModelEntry, 'model'>): string {
  return entry.model === '' ? m.settings.model.list.defaultModel : entry.model
}
