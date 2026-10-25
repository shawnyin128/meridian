// @vitest-environment jsdom
import { act, useState } from 'react'
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

const api = vi.hoisted(() => ({ save: vi.fn(async () => {}), refresh: vi.fn(async () => {}) }))
vi.mock('../../ipc.js', () => ({ colourThemes: { save: api.save } }))

const { ThemeEditor } = await import('./ThemeEditor.js')

const theme = (id: string) => BUILT_IN_COLOUR_THEMES.find((candidate) => candidate.id === id)!
const cinnabar = theme('cinnabar')
const luodian = theme('luodian')
const celadon: ColourTheme = { ...luodian, id: 'celadon', name: '青瓷', basedOn: 'luodian', light: { ...luodian.light, accent: '#3f7a6a' } }
const readable = (of: ColourTheme): ColourThemeFile => ({ state: 'readable', file: `${of.id}.json`, theme: of })

/** Holds the theme files as the shell would, so a case can change them as a file edited outside the App. */
const shell: { setFiles: (files: ColourThemeFile[]) => void } = { setFiles: () => {} }

function Host({ editing, initial, onBack, onDirtyChange }: {
  editing: ColourTheme | null; initial: ColourThemeFile[]; onBack: () => void; onDirtyChange: (dirty: boolean) => void
}) {
  const [files, setFiles] = useState(initial)
  shell.setFiles = setFiles
  return (
    <MessagesProvider>
      <ColourThemeFilesContext.Provider value={{ files, refresh: api.refresh }}>
        <ModalDialog open onOpenChange={() => {}} size="wide" className="setdlg">
          <ThemeEditor theme={editing} onBack={onBack} onDirtyChange={onDirtyChange} />
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
  const onDirtyChange = vi.fn()

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
    api.save.mockClear()
    api.refresh.mockClear()
    onBack.mockClear()
    onDirtyChange.mockClear()
  })

  afterEach(() => { act(() => root.unmount()) })

  const open = (editing: ColourTheme | null, files: ColourThemeFile[] = []) =>
    act(async () => { root.render(<Host editing={editing} initial={files} onBack={onBack} onDirtyChange={onDirtyChange} />) })

  it('新主题从当前的外观主题开始;保存写进 themes/<id>.json 并套用,id 由名字生成、不和已有文件重名,页面留在编辑页', async () => {
    window.localStorage.setItem(COLOUR_THEME_STORAGE_KEY, 'cinnabar')
    await open(null, [{ state: 'unreadable', file: 'my-theme.json', reason: 'syntax' }])
    expect(buttonOf('保存').disabled).toBe(true)

    await type($<HTMLInputElement>('input[aria-label="名称"]'), ' My Theme ')
    await paint('accent', '#2f6fbf')
    await click(buttonOf('保存'))

    const saved: ColourTheme = {
      schema: 'meridian.theme.v1', id: 'my-theme-2', name: 'My Theme', basedOn: 'cinnabar',
      light: { ...cinnabar.light, accent: '#2f6fbf' }, dark: cinnabar.dark,
    }
    expect(api.save).toHaveBeenCalledWith(saved)
    expect(api.refresh).toHaveBeenCalled()
    expect(window.localStorage.getItem(COLOUR_THEME_STORAGE_KEY)).toBe('my-theme-2')
    expect(document.documentElement.dataset.colourTheme).toBe('my-theme-2')
    expect($('#meridian-colour-theme').textContent).toContain('--accent:#2f6fbf')
    expect([buttonOf('保存').getAttribute('aria-label'), buttonOf('保存').querySelector('.cki') !== null, buttonOf('保存').disabled])
      .toEqual(['已保存', true, true])
    expect($<HTMLInputElement>('input[aria-label="名称"]').value).toBe('My Theme')

    await type($<HTMLInputElement>('input[aria-label="名称"]'), 'Renamed')
    await click(buttonOf('保存'))
    expect(api.save).toHaveBeenLastCalledWith({ ...saved, name: 'Renamed' })
  })

  it('告诉宿主有没有没保存的修改:改了就有,改回原样或保存后就没有;返回键只交给宿主', async () => {
    await open(celadon, [readable(celadon)])
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
    await paint('ground', '#f1f6f4')
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)
    await type(hex(), celadon.light.ground)
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)

    await paint('ground', '#f1f6f4')
    await click($('button[aria-label="返回"]'))
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(document.querySelector('[role="alertdialog"]')).toBeNull()
    await click(buttonOf('保存'))
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
  })

  it('换「基于」的主题,浅色和深色两套颜色都换成它的', async () => {
    await open(celadon, [readable(celadon)])
    await paint('accent', '#2f6fbf')
    await pick('基于', '朱漆')
    expect(hex().value).toBe(cinnabar.light.accent.toUpperCase())
    await click(buttonOf('深色'))
    expect(hex().value).toBe(cinnabar.dark.accent.toUpperCase())
    await click(buttonOf('保存'))
    expect(api.save).toHaveBeenCalledWith({ ...celadon, basedOn: 'cinnabar', light: cinnabar.light, dark: cinnabar.dark })
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

  it('编辑时主题文件在 App 外改了:没改过就重读文件;改过就留下修改,标出文件已改,保存后标记消失', async () => {
    await open(celadon, [readable(celadon)])
    await click(module('accent'))
    await act(async () => { shell.setFiles([readable({ ...celadon, light: { ...celadon.light, accent: '#336655' } })]) })
    expect(hex().value).toBe('#336655')
    expect(document.body.textContent).not.toContain('文件已在 App 外修改')

    await type(hex(), '#2f6fbf')
    await act(async () => { shell.setFiles([readable({ ...celadon, light: { ...celadon.light, accent: '#112233' } })]) })
    expect(hex().value).toBe('#2F6FBF')
    expect(document.body.textContent).toContain('文件已在 App 外修改')

    await click(buttonOf('保存'))
    expect(api.save).toHaveBeenCalledWith({ ...celadon, light: { ...celadon.light, accent: '#2f6fbf' } })
    expect(document.body.textContent).not.toContain('文件已在 App 外修改')
  })
})
