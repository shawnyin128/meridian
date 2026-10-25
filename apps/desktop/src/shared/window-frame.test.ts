// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** The parts of the jsdom window this test reads; the tsconfig of shared code carries no DOM types. */
type Node = object
type Window = {
  document: { head: { innerHTML: string }; body: { innerHTML: string }; querySelector(selector: string): Node }
  getComputedStyle(element: Node): { overflowX: string; opacity: string }
}
const { document, getComputedStyle } = globalThis as unknown as Window

const stylesheet = (path: string) => readFileSync(join(import.meta.dirname, '..', 'renderer', path), 'utf8')

describe('窗口框架的滚动区', () => {
  it('时间线只在真能横向滚动时才留出滚动条的轨道', () => {
    document.head.innerHTML = ['components/ScrollArea.css', 'components/timeline/TimelineBoard.css']
      .map((path) => `<style>${stylesheet(path)}</style>`).join('')
    document.body.innerHTML = '<div class="gantt"><div class="gsplit"><div class="scroll-area scroll-area--x scroll-area--fill gwrap"></div></div></div>'
    expect(getComputedStyle(document.querySelector('.gwrap')).overflowX).toBe('auto')
  })

  it('面板的标题栏和页面的标题栏一样高、一样的内边距，两条底线连成一条', () => {
    const css = stylesheet('components/PageShell.css').replace(/\/\*[\s\S]*?\*\//g, '')
    const pane = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, selector]) => selector!.trim() === '.desk-head--pane')
      .flatMap(([, , body]) => body!.split(';').map((declaration) => declaration.split(':')[0]!.trim()).filter(Boolean))
    expect(pane.filter((property) => /^(height|padding|border|box-sizing)/.test(property))).toEqual([])
  })

  it('内容自己滚动的页面主体照样留出滚动条的位置，栏和会滚动的页面主体对齐', () => {
    const css = ['components/ScrollArea.css', 'components/PageShell.css'].map(stylesheet).join('\n')
    const gutter = (selector: string) => new RegExp(`${selector.replace('.', '\\.')}\\{[^}]*scrollbar-gutter:stable`).test(css)
    expect([gutter('.scroll-area--gutter'), gutter('.desk-body--fill')]).toEqual([true, true])
  })

  it('导航行只有一种高度：侧栏、设置的分类和主题编辑器的模块都用 NavRow 的行高，别的样式表不改它', () => {
    const sheets = readdirSync(join(import.meta.dirname, '..', 'renderer'), { recursive: true, encoding: 'utf8' }).filter((path) => path.endsWith('.css'))
    const sized = sheets.flatMap((path) => [...stylesheet(path).replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, selector, body]) => /\.(nav-row|srow)(?![\w-])/.test(selector!) && /(?:^|;)\s*(min-|max-)?height:/.test(body!))
      .map(([, selector]) => `${path}  ${selector!.trim()}`))
    expect(sized).toEqual(['components/NavRow.css  .nav-row'])
    for (const path of ['shell/Sidebar.tsx', 'routes/Settings.tsx', 'components/settings/ThemeEditor.tsx']) {
      expect(stylesheet(path), path).not.toMatch(/className="[^"]*\bsrow\b/)
    }
  })

  it('钉在侧栏底下的行和滚动的行留出同样的滚动条位置，右边对齐', () => {
    expect(stylesheet('components/NavPane.tsx')).toMatch(/<ScrollArea axis="y" fill gutter className="nav-pane-rows">/)
    const pinned = stylesheet('components/NavPane.css').replace(/\/\*[\s\S]*?\*\//g, '').match(/\.nav-pane-pinned\{([^}]*)\}/)?.[1] ?? ''
    expect([/scrollbar-gutter:stable/.test(pinned), /overflow:hidden/.test(pinned)]).toEqual([true, true])
    expect(stylesheet('shell/Sidebar.tsx')).toMatch(/pinned=\{\(\s*<>\s*<UpdateRow \/>[\s\S]*?data-desk="trash"/)
  })

  it('侧栏各级的折叠箭头不悬停也看得见', () => {
    document.head.innerHTML = ['components/IconButton.css', 'components/FoldCaret.css', 'components/FoldToggle.css', 'components/NavRow.css',
      'components/NavSection.css']
      .map((path) => `<style>${stylesheet(path)}</style>`).join('')
    const caret = '<span class="fold-caret is-closed"></span>'
    document.body.innerHTML = '<div class="nav-pane">'
      + `<div class="nav-section-head" data-sect="inbox"><button class="fold-toggle">收件${caret}</button></div>`
      + `<div class="nav-row" id="rowInboxAll"><button class="nav-row-label">论文推送</button><button class="icbtn xs fold-toggle">${caret}</button></div>`
      + `<button class="fold-toggle nav-row nav-row--indent-1" data-disc="topics">关注·主题${caret}</button></div>`
    for (const selector of ['[data-sect] .fold-caret', '#rowInboxAll .fold-caret', '[data-disc] .fold-caret']) {
      expect(getComputedStyle(document.querySelector(selector)).opacity, selector).toBe('1')
    }
  })
})
