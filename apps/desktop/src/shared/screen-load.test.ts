import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const RENDERER = join(import.meta.dirname, '..', 'renderer')

/**
 * Every screen, tests excluded, as its path relative to the renderer and its text: each route and
 * Settings pane that calls Core and each source that shows a page error.
 */
const SCREENS = readdirSync(RENDERER, { recursive: true, encoding: 'utf8' })
  .filter((path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path))
  .map((path) => ({ path, source: readFileSync(join(RENDERER, path), 'utf8') }))
  .filter(({ path, source }) => (path.startsWith('routes/') && source.includes("from '../ipc.js'"))
    || (path.startsWith('components/settings/') && source.includes("from '../../ipc.js'"))
    || source.includes('<PageError'))

/** The screens whose error is not a screen load's, each with what its error is. */
const OWN_ERROR: Record<string, string> = {
  'components/PageShell.tsx': 'defines the page error and the page failure that shows one',
  'components/settings/AppearanceSettings.tsx': 'reads nothing; hands a failed theme deletion to Settings',
  'components/settings/ThemeEditor.tsx': 'reads nothing; shows why the last save failed until the next one starts',
  'routes/Settings.tsx': 'shows the error of the Settings category in view',
}

/** A hand-written load error: a caught error put into the screen's own error state. */
const HAND_WRITTEN = [/\.catch\(reportError\)/, /setError\(errorLabel\(/]

describe('屏的读取错误', () => {
  it('屏上不手写读取错误：没有 .catch(reportError)，也没有 setError(errorLabel(', () => {
    const copies = SCREENS.filter(({ path }) => !(path in OWN_ERROR)).flatMap(({ path, source }) => source.split('\n').flatMap((line, at) => (
      HAND_WRITTEN.some((pattern) => pattern.test(line)) ? [`${path}:${at + 1}`] : []
    )))
    expect(copies).toEqual([])
  })

  it('每个屏都从 useScreenLoad 取它的读取和错误', () => {
    expect(SCREENS.filter(({ path, source }) => !(path in OWN_ERROR) && !source.includes('useScreenLoad()'))
      .map(({ path }) => path).sort()).toEqual([])
  })

  it('点名自带错误的文件都还是屏', () => {
    expect(Object.keys(OWN_ERROR).filter((path) => !SCREENS.some((screen) => screen.path === path))).toEqual([])
  })
})
