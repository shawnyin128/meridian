// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

/** The parts of the jsdom window this test reads; the tsconfig of shared code carries no DOM types. */
type Style = { width: string; paddingRight: string; marginRight: string; getPropertyValue(name: string): string }
type Window = {
  document: { head: { innerHTML: string }; body: { innerHTML: string }; querySelector(selector: string): object | null }
  getComputedStyle(element: object): Style
}
const { document, getComputedStyle } = globalThis as unknown as Window

const RENDERER = join(import.meta.dirname, '..', 'renderer')
/** The stylesheets that style an in-place editor in a property list, in bundle order. */
const SHEETS = [
  'components/FormControls.css', 'routes/shell.css', 'components/PaperMetadata.css',
  'components/paper-table/PaperTable.css', 'components/project/ProjectSections.css', 'routes/Wiki.css',
]

const MULTILINE = 'form-control form-textarea form-control-inline metadata-input multiline'
const LINK_FIELD = 'form-control form-input form-control-inline inedit'

/**
 * A free-text value being edited in the right column of a project or Wiki page, in the head of the
 * paper details and in their metadata list, and the address and name fields of a link being added to
 * a project's relations.
 */
const MARKUP = `<div class="wkside" id="rail-column">
  <div class="wkprops"><div class="pk">当前目标</div><span class="metadata-field"><textarea class="${MULTILINE}" id="rail"></textarea></span></div>
  <div class="wkrel"><span class="rl">链接</span><span class="reladd"><div class="urldraft">
    <input class="${LINK_FIELD}" id="address"><input class="${LINK_FIELD}" id="link-name">
  </div></span></div>
</div>
<div class="pdetail">
  <div class="pd-h"><span class="pd-t"><span class="metadata-field"><textarea class="${MULTILINE}" id="paper-title"></textarea></span></span></div>
  <dl class="paper-meta-list"><dt>作者</dt><dd><span class="metadata-field"><textarea class="${MULTILINE}" id="paper-field"></textarea></span></dd></dl>
</div>`

/**
 * The width FormControls gives an inline editor, which reaches into its negative side margins by its
 * border and padding, so the text inside keeps the width of the text it replaces.
 */
const INLINE = 'calc(100% + 2 * (var(--sp-6) + 1px))'
/** How far an inline editor reaches past the side of its text: its padding and border. */
const REACH = 'calc(var(--sp-6) + 1px)'

describe('就地编辑框的宽度', () => {
  beforeAll(() => {
    document.head.innerHTML = `<style>${SHEETS.map((path) => readFileSync(join(RENDERER, path), 'utf8')).join('\n')}</style>`
    document.body.innerHTML = MARKUP
  })

  const width = (id: string) => getComputedStyle(document.querySelector(`#${id}`)!).width

  it('项目和 Wiki 右栏、论文详情里多行的值进入编辑时,输入框比值宽出两侧的内边距和边框,字的宽度不变', () => {
    expect([width('rail'), width('paper-title'), width('paper-field')]).toEqual([INLINE, INLINE, INLINE])
  })

  it('关联里加链接的地址和显示名两格同样宽出两侧,字和别的就地输入框对齐', () => {
    expect([width('address'), width('link-name')]).toEqual([INLINE, INLINE])
  })

  it('右栏右侧留的余量取对焦环和就地编辑框伸出量里大的那个,编辑框右缘不被切掉', () => {
    const rail = getComputedStyle(document.querySelector('#rail-column')!)
    expect(rail.getPropertyValue('--rail-room')).toBe(`max(var(--ring-room),${REACH})`)
    expect([rail.paddingRight, rail.marginRight]).toEqual(['var(--rail-room)', 'calc(-1 * var(--rail-room))'])
  })
})
