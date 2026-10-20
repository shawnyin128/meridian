import { describe, expect, it } from 'vitest'
import { en } from './en/index.js'
import { zh } from './zh/index.js'

type Node = Record<string, unknown>

/** Every key path in a catalog, with the kind of value at the leaf. */
function shape(node: Node, prefix = ''): string[] {
  return Object.entries(node).flatMap(([key, value]) => {
    const path = prefix === '' ? key : `${prefix}.${key}`
    if (typeof value === 'object' && value !== null) return shape(value as Node, path)
    if (typeof value === 'function') return [`${path}:fn(${value.length})`]
    return [`${path}:text`]
  }).sort()
}

describe('两个语言的消息目录', () => {
  it('键与参数个数完全一致', () => {
    expect(shape(en as unknown as Node)).toEqual(shape(zh as unknown as Node))
  })

  it('没有空字符串占位', () => {
    const empty = [...shape(zh as unknown as Node), ...shape(en as unknown as Node)]
      .filter((path) => path.endsWith(':text'))
    expect(empty.length).toBeGreaterThan(0)
    for (const catalog of [zh, en]) {
      const walk = (node: Node, prefix = ''): void => {
        for (const [key, value] of Object.entries(node)) {
          const path = prefix === '' ? key : `${prefix}.${key}`
          if (typeof value === 'object' && value !== null) walk(value as Node, path)
          else if (typeof value === 'string') expect(value, path).not.toBe('')
        }
      }
      walk(catalog as unknown as Node)
    }
  })
})

describe('确认框的文案', () => {
  // The title and the consequence line of every ConfirmDialog in the App, as each screen passes them.
  const confirmations = (m: typeof zh) => [
    [m.trash.confirmClear, m.trash.confirmClearDescription(2)],
    [m.trash.confirmPurge('Draft trees'), m.trash.confirmPurgeDescription],
    [m.changelog.confirmDelete, m.changelog.confirmDeleteDescription],
    [m.changelog.confirmClearArchived(2), m.changelog.confirmClearArchivedDescription],
    [m.watches.confirmRemove('speculative decoding'), m.watches.confirmRemoveDescription],
    [m.settings.storage.resetTitle, m.settings.storage.resetDescription],
    [m.settings.storage.backupDeleteTitle('9月15日 18:28'), m.settings.storage.backupDeleteDescription],
  ] as const

  for (const [language, catalog] of [['zh', zh], ['en', en]] as const) {
    it(`${language}:标题只问一句,后果写在自己那一行`, () => {
      for (const [title, consequence] of confirmations(catalog)) {
        expect(title, title).toMatch(/^[^。.？?!！]+[？?]$/)
        expect(consequence.trim(), title).not.toBe('')
      }
    })
  }
})

describe('一个概念一个词', () => {
  /** Every text of the zh catalog by key path, a function's text written with placeholder arguments. */
  const texts = (node: Node, prefix = ''): [string, string][] => Object.entries(node).flatMap(([key, value]) => {
    const path = prefix === '' ? key : `${prefix}.${key}`
    if (typeof value === 'object' && value !== null) return texts(value as Node, path)
    if (typeof value === 'function') return [[path, String((value as (...args: unknown[]) => unknown)('X', 'X', 'X'))]]
    return [[path, String(value)]]
  })
  /** The key paths of the project and research screens' texts that hold `word`. */
  const using = (word: string): string[] => texts({ project: zh.project, research: zh.research } as unknown as Node)
    .filter(([, text]) => text.includes(word)).map(([path]) => path)

  it('当前科研路径只叫当前科研路径', () => {
    expect([...using('active path'), ...using('研究路径')]).toEqual([])
  })

  it('项目的记录叫科研记录,不叫进展,也不叫动态屏的名字动态', () => {
    expect([...using('进展'), ...using(zh.feed.title)]).toEqual([])
  })

  it('信号的标题只叫需要注意', () => {
    expect(using('需要决策')).toEqual([])
  })

  it('打开一样东西只叫打开', () => {
    expect(using('跳转')).toEqual([])
  })

  it('计划里加任务或里程碑只叫添加', () => {
    expect([zh.project.plan.newAction, zh.project.plan.taskCreated, zh.research.overview.milestonePopTitle(true, 'X')]
      .filter((text) => !text.includes('添加'))).toEqual([])
  })

  it('保存只叫保存;选中文字后加批注的那一项按它落到的高亮与批注叫批注', () => {
    expect(Object.values(zh.reader.notes)).not.toContain('保存笔记')
    expect(zh.chat.saveIdeaLabel).toBe('保存为想法')
    expect(zh.reader.selection.note).toBe('批注')
    expect(zh.reader.rail.tabs.highlights).toContain(zh.reader.selection.note)
  })
})
