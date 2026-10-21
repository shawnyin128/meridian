import type { Catalog } from '../messages/catalog.js'

/**
 * The Settings categories, one row each in the Settings side list, in its order. Inmail gathers
 * Watches and the projects' Discovery directions; Archived chats manages the chats that were archived.
 */
export const SETTINGS_CATEGORIES = [
  'appearance', 'storage', 'api', 'model', 'research', 'extensions', 'delivery', 'delivery-watch', 'delivery-discovery',
  'archived',
] as const
export type SettingsCategory = typeof SETTINGS_CATEGORIES[number]
/** The catalog key naming each Settings category. */
export const SETTINGS_CATEGORY_LABEL: Record<SettingsCategory, keyof Catalog['settings']['categories']> = {
  appearance: 'appearance',
  storage: 'storage',
  api: 'api',
  model: 'model',
  research: 'research',
  extensions: 'extensions',
  delivery: 'delivery',
  'delivery-watch': 'deliveryWatch',
  'delivery-discovery': 'deliveryDiscovery',
  archived: 'archived',
}
