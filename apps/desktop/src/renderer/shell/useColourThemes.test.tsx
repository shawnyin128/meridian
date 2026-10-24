// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BUILT_IN_COLOUR_THEMES } from '../../shared/colour-theme.js'
import type { ColourTheme, ColourThemeFile } from '../../shared/contract.js'
import {
  COLOUR_THEME_CACHE_KEY, COLOUR_THEME_STORAGE_KEY, initializeAppearance, setColourThemePreference,
} from './appearance.js'
import { useColourThemeFilesPoll } from './useColourThemes.js'

const files = vi.hoisted(() => ({ current: [] as ColourThemeFile[] }))
vi.mock('../ipc.js', () => ({ colourThemes: { list: () => Promise.resolve(files.current) } }))

const luodian = BUILT_IN_COLOUR_THEMES.find((theme) => theme.id === 'luodian')!
const mine: ColourTheme = { ...luodian, id: 'mine', name: '我的主题' }
const readable = (theme: ColourTheme): ColourThemeFile => ({ state: 'readable', file: `${theme.id}.json`, theme })

/** The light canvas colour the applied theme's rules set, or null when only tokens.css applies. */
const canvas = () => /^:root:root\{[^}]*--content:([^;}]+)/.exec(document.getElementById('meridian-colour-theme')?.textContent ?? '')?.[1] ?? null

/** The latest read of the poll, with its refresh, as the shell hands them to Settings. */
const polled = vi.hoisted(() => ({ current: null as ReturnType<typeof useColourThemeFilesPoll> | null }))

function Poll() {
  polled.current = useColourThemeFilesPoll()
  return null
}

describe('自定义主题文件的轮询', () => {
  let root: Root

  beforeEach(() => {
    vi.useFakeTimers()
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.clear()
    document.getElementById('meridian-colour-theme')?.remove()
    delete document.documentElement.dataset.colourTheme
    root = createRoot(document.createElement('div'))
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  })

  afterEach(() => {
    act(() => root.unmount())
    vi.useRealTimers()
  })

  it('选中的是自定义主题时,在 App 外改了它的文件就重新套用;文件不见了先显示默认,选择不丢', async () => {
    window.localStorage.setItem(COLOUR_THEME_STORAGE_KEY, 'mine')
    files.current = [readable(mine)]
    await act(async () => { root.render(<Poll />) })
    expect(canvas()).toBe(mine.light.ground)

    files.current = [readable({ ...mine, light: { ...mine.light, ground: '#f1f6f4' } })]
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(canvas()).toBe('#f1f6f4')

    files.current = []
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(canvas()).toBeNull()
    expect(window.localStorage.getItem(COLOUR_THEME_STORAGE_KEY)).toBe('mine')

    files.current = [readable(mine)]
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(canvas()).toBe(mine.light.ground)
  })

  it('上次套用的自定义主题在启动时、读主题文件之前就套上;它的文件不见了就退回默认并丢掉缓存', async () => {
    setColourThemePreference(mine)
    document.getElementById('meridian-colour-theme')?.remove()
    delete document.documentElement.dataset.colourTheme

    initializeAppearance()
    expect(canvas()).toBe(mine.light.ground)

    files.current = [{ state: 'unreadable', file: 'mine.json', reason: 'syntax' }]
    await act(async () => { root.render(<Poll />) })
    expect(canvas()).toBeNull()
    expect(window.localStorage.getItem(COLOUR_THEME_CACHE_KEY)).toBeNull()
    expect(window.localStorage.getItem(COLOUR_THEME_STORAGE_KEY)).toBe('mine')

    initializeAppearance()
    expect(canvas()).toBeNull()
  })

  it('刷新马上重读主题文件夹,不等下一轮轮询', async () => {
    files.current = []
    await act(async () => { root.render(<Poll />) })
    expect(polled.current!.files).toEqual([])

    files.current = [readable(mine)]
    await act(async () => { await polled.current!.refresh() })
    expect(polled.current!.files).toEqual([readable(mine)])
  })

  it('选中的是内置主题时,自定义主题文件变了也不动当前的颜色', async () => {
    window.localStorage.setItem(COLOUR_THEME_STORAGE_KEY, 'default')
    files.current = [readable(mine)]
    await act(async () => { root.render(<Poll />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(canvas()).toBeNull()
  })
})
