// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BUILT_IN_COLOUR_THEMES, DEFAULT_COLOUR_THEME, contrastShortfalls, deriveColourTokens, deriveDarkModules,
} from '../../../shared/colour-theme.js'
import type { ColourTheme, ColourThemeFile } from '../../../shared/contract.js'
import { MessagesProvider } from '../../messages/useMessages.js'
import { COLOUR_THEME_STORAGE_KEY } from '../../shell/appearance.js'
import { LANGUAGE_STORAGE_KEY } from '../../shell/language.js'
import { ColourThemeFilesContext } from '../../shell/useColourThemes.js'
import { ModalDialog } from '../ModalDialog.js'

const { ThemeEditor } = await import('./ThemeEditor.js')

const theme = (id: string) => BUILT_IN_COLOUR_THEMES.find((candidate) => candidate.id === id)!
const cinnabar = theme('cinnabar')
const luodian = theme('luodian')
const celadon: ColourTheme = { ...luodian, id: 'celadon', name: '青瓷', basedOn: 'luodian', light: { ...luodian.light, accent: '#3f7a6a' } }
const readable = (of: ColourTheme): ColourThemeFile => ({ state: 'readable', file: `${of.id}.json`, theme: of })

function Host({ editing, files, onBack }: { editing: ColourTheme | null; files: ColourThemeFile[]; onBack: () => void }) {
  return (
    <MessagesProvider>
      <ColourThemeFilesContext.Provider value={files}>
        <ModalDialog open onOpenChange={() => {}} size="wide" className="setdlg">
          <ThemeEditor theme={editing} onBack={onBack} />
        </ModalDialog>
      </ColourThemeFilesContext.Provider>
    </MessagesProvider>
  )
}

/** Sets `input`'s value as typing does, so React sees the change. */
const type = (input: HTMLInputElement, value: string) => act(async () => {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
})
const click = (element: Element) => act(async () => { (element as HTMLElement).click() })
const $ = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector)!
const buttonOf = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === text)!
const hex = () => $<HTMLInputElement>('input[aria-label="色值"]')
const module = (key: string) => $(`[data-module="${key}"]`)
/** Picks `module` in the left column and types `value` into its hex field. */
const paint = async (key: string, value: string) => {
  await click(module(key))
  await type(hex(), value)
}
const marked = () => [...document.querySelectorAll('[data-module]')]
  .filter((row) => row.textContent?.includes('对比度不足')).map((row) => row.getAttribute('data-module'))

/** Picks the option shown as `text` in the picker named `label`. */
async function pick(label: string, text: string): Promise<void> {
  await act(async () => {
    $(`button[aria-label="${label}"]`).dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
  })
  const item = [...document.querySelectorAll('.choice-picker-menu [role="menuitemradio"]')].find((candidate) => candidate.textContent === text)!
  await act(async () => {
    item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    item.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

describe('外观主题编辑页', () => {
  let root: Root
  const onBack = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.clear()
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    document.getElementById('meridian-colour-theme')?.remove()
    delete document.documentElement.dataset.colourTheme
    delete document.documentElement.dataset.theme
    document.body.innerHTML = ''
    root = createRoot(document.body.appendChild(document.createElement('div')))
    onBack.mockClear()
  })

  afterEach(() => { act(() => root.unmount()) })

  const open = (editing: ColourTheme | null, files: ColourThemeFile[] = []) =>
    act(async () => { root.render(<Host editing={editing} files={files} onBack={onBack} />) })

  it('换「基于」的主题,浅色和深色两套颜色都换成它的', async () => {
    await open(celadon, [readable(celadon)])
    await paint('accent', '#2f6fbf')
    await pick('基于', '朱漆')
    expect(hex().value).toBe(cinnabar.light.accent.toUpperCase())
    await click(buttonOf('深色'))
    expect(hex().value).toBe(cinnabar.dark.accent.toUpperCase())
  })

  it('由浅色生成深色:按基于的主题把浅色的修改带到深色,换到深色接着调', async () => {
    window.localStorage.setItem(COLOUR_THEME_STORAGE_KEY, 'cinnabar')
    await open(null)
    await paint('accent', '#2f6fbf')
    await click(buttonOf('由浅色生成深色'))
    expect($('[aria-label="编辑的模式"] [data-state="on"]').textContent).toBe('深色')
    expect(hex().value).toBe(deriveDarkModules({ ...cinnabar.light, accent: '#2f6fbf' }, cinnabar).accent.toUpperCase())
  })

  it('预览框上是这一模式真正推导出的颜色 token', async () => {
    await open(celadon, [readable(celadon)])
    await paint('card', '#fdfaf2')
    const preview = $('.theme-preview')
    const light = deriveColourTokens({ ...celadon.light, card: '#fdfaf2' }, 'light')
    for (const token of ['--card', '--accent-solid', '--bad-text', '--sh-2'] as const) {
      expect(preview.style.getPropertyValue(token), token).toBe(light[token])
    }
    await click(buttonOf('深色'))
    expect(preview.style.getPropertyValue('--accent-solid')).toBe(deriveColourTokens(celadon.dark, 'dark')['--accent-solid'])
  })

  it('对比度不足只标在文字、主题色、错误/警告/完成和阅读高亮上;底色和分隔线不标', async () => {
    await open(null)
    expect(marked()).toEqual([])
    await paint('inkTertiary', '#bbbbbb')
    expect(marked()).toEqual(['inkTertiary'])
    await paint('card', '#000000')
    const expected = new Set(contrastShortfalls({ ...DEFAULT_COLOUR_THEME.light, inkTertiary: '#bbbbbb', card: '#000000' }, 'light')
      .map((shortfall) => shortfall.module))
    expect(new Set(marked())).toEqual(expected)
    expect(marked()).toContain('ink')
    for (const surface of ['ground', 'sidebar', 'card', 'field', 'separator']) expect(marked()).not.toContain(surface)
  })

  it('色板给出五个内置主题在这一模式下这个模块的颜色,点一个就用它', async () => {
    await open(null)
    await click(module('accent'))
    const swatches = [...document.querySelectorAll<HTMLButtonElement>('[aria-label="预设颜色"] button')]
    expect(swatches.map((swatch) => swatch.getAttribute('aria-label'))).toEqual(['默认', '朱漆', '螺钿', '秋叶', '流霞'])
    await click(swatches[2]!)
    expect(hex().value).toBe(luodian.light.accent.toUpperCase())
    await click(module('highlight'))
    expect(document.querySelectorAll('[aria-label="预设颜色"] button')).toHaveLength(1)
  })
})
