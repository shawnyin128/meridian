import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { BUILT_IN_COLOUR_THEMES } from '../shared/colour-theme.js'
import type { ColourTheme } from '../shared/contract.js'
import { deleteColourTheme, listColourThemes, saveColourTheme } from './colour-themes.js'

const temporary: string[] = []

/** A fresh config home whose themes folder holds `files`, by file name. */
function configHome(files: Record<string, string> = {}): string {
  const home = mkdtempSync(join(tmpdir(), 'meridian-themes-'))
  temporary.push(home)
  if (Object.keys(files).length > 0) mkdirSync(join(home, 'themes'))
  for (const [name, text] of Object.entries(files)) writeFileSync(join(home, 'themes', name), text)
  return home
}

afterEach(() => {
  for (const home of temporary.splice(0)) rmSync(home, { recursive: true, force: true })
})

const cinnabar = BUILT_IN_COLOUR_THEMES.find((theme) => theme.id === 'cinnabar')!
const mine: ColourTheme = { ...cinnabar, id: 'mine', name: '我的主题', basedOn: 'cinnabar' }
const json = (value: unknown) => JSON.stringify(value)

describe('配置目录里的主题文件', () => {
  it('没有 themes 文件夹时一个自定义主题也没有', () => {
    expect(listColourThemes(configHome())).toEqual([])
  })

  it('每个 .json 文件单独读:能读的带上主题并丢掉不认识的键,读不了的各自说明原因,别的文件照常', () => {
    const home = configHome({
      'mine.json': json({ ...mine, fonts: 'serif', light: { ...mine.light, glow: '#ffffff' } }),
      'broken.json': '{"schema": "meridian.theme.v1",',
      'future.json': json({ ...mine, id: 'future', schema: 'meridian.theme.v2' }),
      'pale.json': json({ ...mine, id: 'pale', light: { ...mine.light, accent: 'red' } }),
      'other.json': json(mine),
      'cinnabar.json': json(cinnabar),
      'notes.txt': 'not a theme',
    })
    mkdirSync(join(home, 'themes', 'folder.json'))

    expect(listColourThemes(home)).toEqual([
      { state: 'unreadable', file: 'broken.json', reason: 'syntax' },
      { state: 'unreadable', file: 'cinnabar.json', reason: 'built-in' },
      { state: 'unreadable', file: 'folder.json', reason: 'unreadable' },
      { state: 'unreadable', file: 'future.json', reason: 'version' },
      { state: 'readable', file: 'mine.json', theme: mine },
      { state: 'unreadable', file: 'other.json', reason: 'id' },
      { state: 'unreadable', file: 'pale.json', reason: 'format' },
    ])
  })

  it('保存写到 themes/<id>.json,再读回来是同一个主题;覆盖时留下这个版本不认识的键', () => {
    const home = configHome({ 'mine.json': json({ ...mine, fonts: 'serif', dark: { ...mine.dark, glow: '#000000' } }) })
    const edited: ColourTheme = {
      schema: mine.schema, id: mine.id, name: '改过的主题', light: { ...mine.light, accent: '#8a3a2e' }, dark: mine.dark,
    }

    saveColourTheme(home, edited)

    expect(listColourThemes(home)).toEqual([{ state: 'readable', file: 'mine.json', theme: edited }])
    const written = JSON.parse(readFileSync(join(home, 'themes', 'mine.json'), 'utf8'))
    expect([written.fonts, written.dark.glow, written.basedOn]).toEqual(['serif', '#000000', undefined])
  })

  it('不能用内置主题的 id 保存或删除', () => {
    const home = configHome()
    expect(() => saveColourTheme(home, cinnabar)).toThrow(expect.objectContaining({ reason: 'refused' }))
    expect(() => deleteColourTheme(home, 'default')).toThrow(expect.objectContaining({ reason: 'refused' }))
  })

  it('删除只删掉那一个文件;没有这个文件时报找不到', () => {
    const home = configHome({ 'mine.json': json(mine), 'other.json': json({ ...mine, id: 'other' }) })
    deleteColourTheme(home, 'mine')
    expect(listColourThemes(home).map((entry) => entry.file)).toEqual(['other.json'])
    expect(() => deleteColourTheme(home, 'mine')).toThrow(expect.objectContaining({ reason: 'not-found' }))
  })
})
