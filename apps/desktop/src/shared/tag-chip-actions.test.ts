// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'

/** The parts of the jsdom window this test reads; the tsconfig of shared code carries no DOM types. */
type Window = {
  document: {
    head: { innerHTML: string }
    body: { innerHTML: string }
    querySelectorAll(selector: string): Iterable<{ parentElement: object | null }>
  }
  getComputedStyle(element: object): { opacity: string; pointerEvents: string; position: string; display: string }
}
const { document, getComputedStyle } = globalThis as unknown as Window

/** The stylesheets a removable chip is styled by, in the order the renderer bundle loads them. */
const STYLES = ['../renderer/components/IconButton.css', '../renderer/components/Tag.css', '../renderer/routes/shell.css', '../renderer/components/project/ProjectSections.css']
  .map((path) => readFileSync(join(import.meta.dirname, path), 'utf8'))

// The markup of a relation item and a linked paper in ProjectRelations, and of a project in ProjectChips.
const CHIPS = `
  <div class="wkrel"><span class="rl">Wiki</span><span class="tag tag--chip tag--neutral tagchip" data-wk="topics/knee" draggable="true"><span class="fade-text tagchip-text">树宽收益拐点</span><button class="icbtn xs tagchip-edit"></button><button class="icbtn xs rx"></button></span></div>
  <div class="wkrel"><span class="rl">论文</span><span class="tag tag--chip tag--neutral tagchip" data-paper="p1" draggable="true"><span class="fade-text tagchip-text">EAGLE-2</span><button class="icbtn xs rx"></button></span></div>
  <dl><dd class="paper-meta-projects"><span class="tag tag--chip tag--neutral tagchip" data-project="draft">draft 效率<button class="icbtn xs rx"></button></span></dd></dl>`

describe('chip 上的移除按钮', () => {
  beforeEach(() => {
    document.head.innerHTML = STYLES.map((css) => `<style>${css}</style>`).join('')
    document.body.innerHTML = CHIPS
  })

  it('关联、论文和论文所属项目的 chip 都一样:不用悬停就看得见、点得到,排在 chip 自己那一行里', () => {
    const shown = [...document.querySelectorAll('.tagchip .rx')].map((remove) => {
      const style = getComputedStyle(remove)
      return `${style.opacity} ${style.pointerEvents} ${style.position} ${getComputedStyle(remove.parentElement!).display}`
    })
    expect(shown).toEqual(Array(3).fill('1 auto relative inline-flex'))
  })
})
