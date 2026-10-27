import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const RENDERER = join(import.meta.dirname, '..', 'renderer')

/** The declarations of the rule for `selector` in the stylesheet `path`, comments dropped. @throws When no rule names it. */
const declarationsOf = (path: string, selector: string): Map<string, string> => {
  const css = readFileSync(join(RENDERER, path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const rule = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .find(([, selectors]) => selectors!.split(',').map((s) => s.trim()).includes(selector))
  if (rule === undefined) throw new Error(`${path} 里没有 ${selector} 这条规则`)
  return new Map(rule[2]!.split(';').map((part) => part.trim()).filter(Boolean)
    .map((part) => [part.slice(0, part.indexOf(':')).trim(), part.slice(part.indexOf(':') + 1).trim()]))
}

/** The vertical gap one rule sets between the controls it stacks: its row gap, or the margin under the upper control. */
const stackGap = (path: string, selector: string, property: 'row-gap' | 'margin-bottom'): string | undefined => {
  const declarations = declarationsOf(path, selector)
  if (property === 'row-gap') return declarations.get('row-gap') ?? declarations.get('gap')?.split(/\s+(?![^(]*\))/)[0]
  return declarations.get('margin-bottom')
}

describe('叠放的控件', () => {
  /** Every place that stacks controls in a form, a dialog or a popover, with the declaration that spaces them. */
  const STACKS = [
    ['栏位行', 'components/FormControls.css', '.field-rows', 'row-gap'],
    ['就地草稿', 'components/DraftForm.css', '.draft-form', 'row-gap'],
    ['任务的日期和时段', 'components/TaskScheduleField.css', '.schedule-form', 'row-gap'],
    ['推送上限', 'routes/Settings.css', '.delivery-settings-card', 'row-gap'],
    ['关注的建议来源', 'routes/Watches.css', '.watch-suggestion-source', 'margin-bottom'],
    ['阅读器的批注浮层', 'routes/Reader.css', '.selection-tools-body', 'row-gap'],
    ['工作区对话框的类型开关', 'routes/ProjectDetail.css', '.workspace-kinds', 'margin-bottom'],
    ['分组标签区的开关', 'components/TabbedSection.css', '.tabbed-section-heading.section-heading--group', 'margin-bottom'],
  ] as const

  it('表单、对话框和浮层里上下叠放的控件之间都是同一个间距角色 --item-gap', () => {
    expect(STACKS.map(([name, path, selector, property]) => [name, stackGap(path, selector, property)]))
      .toEqual(STACKS.map(([name]) => [name, 'var(--item-gap)']))
  })

  it('分组标签区的开关不再探出标题行,面板从开关下沿算起空出 --item-gap', () => {
    expect(declarationsOf('components/TabbedSection.css', '.tabbed-section-heading.section-heading--group>.section-heading-actions').get('height'))
      .toBe('auto')
    expect(readFileSync(join(RENDERER, 'components/TabbedSection.tsx'), 'utf8')).toMatch(/className="tabbed-section-heading"/)
  })

  it('任务时段浮层的确认按钮也在 --item-gap 下面,不再多垫一层', () => {
    expect(declarationsOf('components/TaskScheduleField.css', '.schedule-actions').has('padding-top')).toBe(false)
  })
})
