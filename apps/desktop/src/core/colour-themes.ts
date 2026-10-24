import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { BUILT_IN_COLOUR_THEMES, COLOUR_THEME_SCHEMA } from '../shared/colour-theme.js'
import {
  ColourThemeModulesSchema, ColourThemeSchema, type ColourTheme, type ColourThemeFile, type ColourThemeProblem,
} from '../shared/contract.js'
import { CallError } from './call-error.js'
import { writeJson } from './vault/writer.js'

const BUILT_IN = new Set(BUILT_IN_COLOUR_THEMES.map((theme) => theme.id))
const THEME_KEYS = new Set(ColourThemeSchema.keyof().options)
const MODULE_KEYS = new Set(ColourThemeModulesSchema.keyof().options)

const folderOf = (configHome: string) => join(configHome, 'themes')

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Reads the theme file `name` at `path` on its own. */
function readThemeFile(path: string, name: string): ColourThemeFile {
  const unreadable = (reason: ColourThemeProblem): ColourThemeFile => ({ state: 'unreadable', file: name, reason })
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    return unreadable('unreadable')
  }
  const raw = parsed(text)
  if (raw === undefined) return unreadable('syntax')
  const schema = isObject(raw) ? raw['schema'] : undefined
  if (typeof schema === 'string' && schema.startsWith('meridian.theme.') && schema !== COLOUR_THEME_SCHEMA) {
    return unreadable('version')
  }
  const result = ColourThemeSchema.safeParse(raw)
  if (!result.success) return unreadable('format')
  if (`${result.data.id}.json` !== name) return unreadable('id')
  if (BUILT_IN.has(result.data.id)) return unreadable('built-in')
  return { state: 'readable', file: name, theme: result.data }
}

/**
 * Lists every `.json` file in `<configHome>/themes` by file name, each read on its own: one that
 * cannot be used is reported with its reason and never hides the others.
 * @returns The files in file-name order; empty when the folder does not exist.
 */
export function listColourThemes(configHome: string): ColourThemeFile[] {
  const folder = folderOf(configHome)
  if (!existsSync(folder)) return []
  return readdirSync(folder).filter((name) => name.endsWith('.json')).sort()
    .map((name) => readThemeFile(join(folder, name), name))
}

/** `text` parsed as JSON, or undefined when it is not JSON. */
function parsed(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** The keys of `value` that are not in `known`, when it is an object. */
const unknownKeys = (value: unknown, known: Set<string>): Record<string, unknown> =>
  isObject(value) ? Object.fromEntries(Object.entries(value).filter(([key]) => !known.has(key))) : {}

/**
 * Writes `theme` to `<configHome>/themes/<id>.json`. When it replaces a file, the keys this version
 * does not know, at the top and in each mode, stay as that file had them.
 * @throws CallError `refused` for a built-in theme's id.
 */
export function saveColourTheme(configHome: string, theme: ColourTheme): void {
  if (BUILT_IN.has(theme.id)) throw new CallError('refused', `内置主题 ${theme.id} 不能另存为文件`)
  const file = join(folderOf(configHome), `${theme.id}.json`)
  const replaced = existsSync(file) ? parsed(readFileSync(file, 'utf8')) : undefined
  const kept = (mode: 'light' | 'dark') => unknownKeys(isObject(replaced) ? replaced[mode] : undefined, MODULE_KEYS)
  writeJson(file, {
    ...theme, ...unknownKeys(replaced, THEME_KEYS),
    light: { ...theme.light, ...kept('light') }, dark: { ...theme.dark, ...kept('dark') },
  }, join(configHome, '.tmp'))
}

/**
 * Deletes `<configHome>/themes/<id>.json`.
 * @throws CallError `refused` for a built-in theme's id, `not-found` when there is no such file.
 */
export function deleteColourTheme(configHome: string, id: string): void {
  if (BUILT_IN.has(id)) throw new CallError('refused', `内置主题 ${id} 不能删除`)
  const file = join(folderOf(configHome), `${id}.json`)
  if (!existsSync(file)) throw new CallError('not-found', `没有主题文件 ${id}.json`)
  rmSync(file)
}
