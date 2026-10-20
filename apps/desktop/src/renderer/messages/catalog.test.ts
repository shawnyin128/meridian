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

describe('提示、标签和占位只说结果', () => {
  // The notices, labels and placeholders the copy audit shortened: each states its result or name in
  // one clause, with no explanation after it.
  const results = (m: typeof zh) => [
    m.changelog.undoneNote, m.chat.ideaSavedNote, m.inbox.notices.duplicateToast, m.inbox.notices.remembered,
    m.papers.parse.addedFixable, m.papers.notices.remarkSaved, m.papers.columnMenu.noOptionsHint,
    m.research.list.createdNote, m.research.list.createdFeedNote('Draft trees'), m.settings.archived.unarchived,
    m.watches.notices.added, m.watches.notices.updated, m.watches.notices.resumed, m.watches.notices.pausedNote,
    m.watches.notices.removed, m.watches.projectLabel, m.watches.focusPlaceholder, m.wiki.ingest.discarded,
  ]

  it('zh:一句之内，没有间隔号、逗号或句号后的解释', () => {
    for (const text of results(zh)) expect(text, text).not.toMatch(/[·，。；：]/)
  })

  it('en: one clause, with no separator or sentence after it', () => {
    for (const text of results(en)) expect(text, text).not.toMatch(/ · |[.;:]\s|[.;:]$/)
  })
})
