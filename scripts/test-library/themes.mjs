import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { writeJson } from './app.mjs'

/** A custom colour theme, Celadon: the built-in luodian theme with a celadon ground and accent. */
export const CELADON = {
  schema: 'meridian.theme.v1', id: 'celadon', name: '青瓷', basedOn: 'luodian',
  light: {
    ground: '#f6f8f5', sidebar: '#eef2ee', card: '#fbfcfa', field: '#eaefea',
    ink: '#1f2426', inkSecondary: '#4c5154', inkTertiary: '#515759', separator: '#dde3de', accent: '#3f7a6a',
    error: '#e0453a', warning: '#b8860b', done: '#028f41', highlight: '#f8d84a',
  },
  dark: {
    ground: '#151c1f', sidebar: '#0c1316', card: '#1a2225', field: '#1e2629',
    ink: '#f3eee4', inkSecondary: '#cac5bb', inkTertiary: '#b7b2a8', separator: '#2b3336', accent: '#5f9a8a',
    error: '#ff453a', warning: '#ffd60a', done: '#30d158', highlight: '#f8d84a',
  },
}

/** Puts CELADON in the config home of test library `out`, as a user who wrote the file by hand would. */
export function seedColourTheme(out) {
  mkdirSync(join(out, 'config', 'themes'), { recursive: true })
  writeJson(join(out, 'config', 'themes', `${CELADON.id}.json`), CELADON)
}
