import { describe, expect, it } from 'vitest'
import { createFormat } from '../lib/format.js'
import { en } from './en/index.js'
import { zh } from './zh/index.js'

type Node = Record<string, unknown>

/** Every text of a catalog by key path, a function's text written with placeholder arguments. */
const texts = (node: Node, prefix = ''): [string, string][] => Object.entries(node).flatMap(([key, value]) => {
  const path = prefix === '' ? key : `${prefix}.${key}`
  if (typeof value === 'object' && value !== null) return texts(value as Node, path)
  if (typeof value === 'function') return [[path, String((value as (...args: unknown[]) => unknown)('X', 'X', 'X'))]]
  return [[path, String(value)]]
})

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
  // The title of every ConfirmDialog in the App and its consequence line, absent where the title says it all.
  const confirmations = (m: typeof zh): [string, string | undefined][] => [
    [m.trash.confirmClear, m.trash.confirmClearLoss(2)],
    [m.trash.confirmPurge('Draft trees'), undefined],
    [m.changelog.confirmDelete, m.changelog.confirmDeleteLoss],
    [m.changelog.confirmClearArchived(2), m.changelog.confirmClearArchivedLoss],
    [m.watches.confirmRemove('speculative decoding'), m.watches.confirmRemoveLoss],
    [m.settings.storage.resetTitle, undefined],
    [m.settings.storage.backupDeleteTitle('9月15日 18:28'), m.settings.storage.backupDeleteLoss],
    [m.settings.appearance.editor.leaveTitle, undefined],
    [m.settings.appearance.editor.deleteTitle('青瓷'), m.settings.appearance.editor.deleteLoss],
  ]

  for (const [language, catalog] of [['zh', zh], ['en', en]] as const) {
    it(`${language}:标题只问一句,后果只在丢掉了标题没说的东西时写一行短语,不成句`, () => {
      for (const [title, consequence] of confirmations(catalog)) {
        expect(title, title).toMatch(/^[^。.？?!！]+[？?]$/)
        if (consequence !== undefined) expect(consequence, title).toMatch(/^[^。.，,；;!！]+$/)
      }
    })
  }
})

describe('占位文字和命令的省略号', () => {
  const catalogs = { zh: texts(zh as unknown as Node), en: texts(en as unknown as Node) }
  /** Whether the key at `path` is a field's placeholder or a picker's empty value. */
  const placeholder = (path: string) => /(^|\.)(placeholder|[a-z]+Placeholder|[a-z]+Pick)$/.test(path)
  // The busy states shown while something runs, the only texts that still end in an ellipsis.
  const BUSY = [
    'common.loading', 'common.saving', 'chat.thinking', 'inbox.discovering', 'inbox.check.checking', 'papers.upload.importing', 'papers.publication.filling',
    'project.workspace.adding', 'watches.suggesting',
    'settings.storage.checkingDirectory', 'settings.storage.resetting', 'settings.storage.backupSwitching',
    'settings.storage.backupDeleting', 'settings.model.saving', 'settings.model.connection.testing',
    'settings.extensions.plugin.checking', 'settings.extensions.app.checking', 'settings.extensions.app.downloading',
    'settings.delivery.saving', 'settings.discovery.refreshing', 'wiki.ingest.discarding', 'wiki.ingest.writing',
  ]

  it('每个占位文字只说出它那一栏的名字：不叫人输入、粘贴或选择，不举例，不写可选，不提问', () => {
    const off = catalogs.zh.filter(([path, text]) => placeholder(path)
      && /^(输入|粘贴|选择|选一|例如)|[（(]可|[？?]|…$/.test(text))
    const offEn = catalogs.en.filter(([path, text]) => placeholder(path)
      && /^(Type|Paste|Enter|Choose|Select|e\.g\.)|\(optional\)|\?|…$/i.test(text))
    expect([...off, ...offEn]).toEqual([])
  })

  it('命令不以省略号结尾，打开对话框、文件选择或编辑器的也不；只有进行中的状态以省略号结尾，两种语言都是', () => {
    for (const language of ['zh', 'en'] as const) {
      const trailing = catalogs[language].filter(([, text]) => /(…|\.\.\.)$/.test(text)).map(([path]) => path)
      expect(trailing.filter((path) => !BUSY.includes(path)), language).toEqual([])
      expect(BUSY.filter((path) => !trailing.includes(path)), language).toEqual([])
    }
  })
})

describe('英文的大小写', () => {
  // Names that keep their capitals inside a sentence: products, services, formats and Meridian's own surfaces.
  const PROPER = new Set([
    'Meridian', 'App', 'Wiki', 'Paper', 'Lab', 'Skill', 'Skills', 'MCP', 'Harness', 'PDF', 'PDFs', 'API', 'AI', 'ID', 'IDs', 'URL',
    'SSH', 'JSON', 'arXiv', 'Semantic', 'Scholar', 'OpenAI', 'ChatGPT', 'Anthropic', 'Claude', 'Code', 'Codex', 'Google', 'Gemini', 'DeepSeek',
    'OpenRouter', 'Ollama', 'LM', 'Studio', 'Responses', 'Chat', 'Completions', 'GitHub', 'Markdown', 'Transformer', 'I',
  ])
  // Texts that are content, not UI copy: the agent prompts and the sample paper the theme editor previews.
  const CONTENT = [/^settings\.extensions\.tutorial\.groups\.\d+\.examples\.\d+\.prompt$/, /^settings\.appearance\.editor\.preview\./]

  it('en: one capitalization style, sentence case: inside a segment only names keep a capital', () => {
    const off = texts(en as unknown as Node).filter(([path, text]) => !CONTENT.some((pattern) => pattern.test(path))
      && text.split(/ · |: |\. |[“"(]|\? /).some((segment) => (segment.match(/[A-Za-z][A-Za-z'’-]*/g) ?? []).slice(1)
        // NaN is a number argument the sample fills with text, not a word of the copy.
        .some((word) => /^[A-Z][a-z]/.test(word) && word !== 'NaN' && !PROPER.has(word.replace(/[’']s$/, '').split('-')[0]!))))
    expect(off).toEqual([])
  })
})

describe('一个概念一个词', () => {
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
    expect([
      zh.project.plan.newAction, zh.research.overview.milestonePopTitle(true),
      zh.research.overview.newMilestoneOn('X'),
    ].filter((text) => !text.includes('添加'))).toEqual([])
  })

  it('建一列只叫新建列,阅读状态只叫阅读状态', () => {
    expect([zh.papers.columnHeader.addColumn, zh.wiki.aggregation.addColumn]).toEqual(['新建列', '新建列'])
    expect([zh.papers.columns.st, zh.papers.groupNames.readState, zh.papers.metadata.fields.readState])
      .toEqual(['阅读状态', '阅读状态', '阅读状态'])
  })

  it('保存只叫保存;选中文字后加批注的那一项按它落到的高亮与批注叫批注', () => {
    expect(Object.values(zh.reader.notes)).not.toContain('保存笔记')
    expect(zh.chat.saveIdeaLabel).toBe('保存为想法')
    expect(zh.reader.selection.note).toBe('批注')
    expect(zh.reader.rail.tabs.highlights).toContain(zh.reader.selection.note)
  })
})

describe('一个对象一个词', () => {
  // Each object's word in each language, and the key paths of the texts that name that object (#185).
  const WORDS = {
    finding: { zh: '结论', en: /finding/i },
    experimentConclusion: { zh: '实验结论', en: /experiment conclusion/i },
    keyword: { zh: '关键词', en: /keyword/i },
    toRead: { zh: '待读', en: /to read/i },
    readLater: { zh: '稍后阅读', en: /later/i },
    topic: { zh: '主题', en: /topic/i },
  } as const
  type Item = keyof typeof WORDS
  const KEYS: Record<Item, string[]> = {
    finding: [
      'wiki.claims.heading', 'wiki.claims.add', 'wiki.claims.addShort', 'wiki.claims.actionsLabel',
      'wiki.claims.form.text', 'wiki.claims.form.textPlaceholder', 'wiki.claims.form.basisLabel',
      'wiki.claims.form.outcomes.split', 'wiki.claims.form.splitText', 'wiki.claims.proposals.add', 'wiki.claims.proposals.revise',
      'wiki.claims.proposals.conflict', 'wiki.claims.proposals.resolve', 'wiki.claims.proposals.retract', 'wiki.queue.kinds.addClaim',
      'wiki.queue.kinds.reviseClaim', 'wiki.queue.kinds.retractClaim', 'wiki.queue.outcomes.revised', 'wiki.queue.outcomes.split',
      'wiki.queue.outcomes.retracted', 'project.conclusions.text', 'chat.conflictTitle', 'chat.conflictQuestion',
    ],
    experimentConclusion: [
      'project.recordModes.conclusions', 'project.conclusions.heading',
      'project.signals.kind.conflict', 'project.signals.reason.conflictCount', 'project.signals.pulse.conflict',
      'wiki.claims.form.conclusion', 'wiki.claims.form.conclusionPick', 'wiki.queue.unverified',
      'wiki.queue.grounds.experiment', 'wiki.paperCardFooter', 'papers.reading.conclusions',
    ],
    keyword: [
      'shell.nav.watchTopics', 'shell.watchKind.topic', 'watches.topicSuggestions', 'watches.addAllTopics',
    ],
    toRead: ['papers.readState.later'],
    readLater: [
      'shell.nav.later', 'shell.crumbs.later', 'later.title', 'later.removed', 'inbox.actions.readLater',
    ],
    topic: [
      'papers.columns.topics', 'papers.groupNames.topics', 'papers.toolbar.searchPlaceholder', 'papers.tags.add',
      'papers.tags.existingTopics', 'papers.tags.remove', 'papers.notices.topicAdded', 'papers.metadata.fields.topics',
      'papers.researchMap.reason.topic', 'project.identity.topic', 'project.identity.topicUpdated',
      'project.identity.noTopic', 'project.identity.allTopics', 'project.identity.filterTopic',
    ],
  }
  /** Texts that name a project's experiment conclusion and the finding it becomes in the Wiki. */
  const BOTH = ['project.conclusions.writeProposal', 'settings.extensions.tutorial.groups.1.examples.2.prompt']
  const catalogs = { zh: new Map(texts(zh as unknown as Node)), en: new Map(texts(en as unknown as Node)) }
  /** The text at `path` in `language`'s catalog; a path that names no text fails the test. */
  const at = (language: 'zh' | 'en', path: string): string => {
    const text = catalogs[language].get(path)
    expect(text, `${language} ${path}`).toBeDefined()
    return text!
  }
  /** Whether zh `text` holds `item`'s word, a finding's word counted only outside the experiment conclusion's. */
  const holdsZh = (text: string, item: Item): boolean => (item === 'finding'
    ? text.replaceAll(WORDS.experimentConclusion.zh, '').includes(WORDS.finding.zh)
    : text.includes(WORDS[item].zh))
  /** Whether en `text` holds `item`'s word, a finding's word also when it says conclusion outside experiment conclusion. */
  const holdsEn = (text: string, item: Item): boolean => (item === 'finding'
    ? WORDS.finding.en.test(text) || /conclusion/i.test(text.replace(/experiment conclusions?/gi, ''))
    : WORDS[item].en.test(text))
  const items = Object.keys(WORDS) as Item[]

  for (const item of items) {
    it(`${item}:每个键用它自己的词,不用别的对象的词`, () => {
      for (const path of KEYS[item]) {
        const [zhText, enText] = [at('zh', path), at('en', path)]
        expect(holdsZh(zhText, item), `zh ${path}: ${zhText}`).toBe(true)
        expect(holdsEn(enText, item), `en ${path}: ${enText}`).toBe(true)
        for (const other of items.filter((o) => o !== item)) {
          expect(holdsZh(zhText, other), `zh ${path} says ${other}: ${zhText}`).toBe(false)
          expect(holdsEn(enText, other), `en ${path} says ${other}: ${enText}`).toBe(false)
        }
      }
    })
  }

  it('同时说到实验结论和它写进 Wiki 成为的结论时,各用各的词', () => {
    for (const path of BOTH) {
      for (const item of ['experimentConclusion', 'finding'] as const) {
        expect(holdsZh(at('zh', path), item), `zh ${path}`).toBe(true)
        expect(holdsEn(at('en', path), item), `en ${path}`).toBe(true)
      }
    }
  })

  it('关注页的文字不说主题', () => {
    for (const language of ['zh', 'en'] as const) {
      const watch = [...catalogs[language]].filter(([path]) => path.startsWith('watches.') || path.startsWith('shell.watchKind.'))
      expect(watch.filter(([, text]) => holdsZh(text, 'topic') || holdsEn(text, 'topic'))).toEqual([])
    }
  })

  it('项目的主题和论文的主题是同一个词,哪里都不再说领域', () => {
    expect([...catalogs.zh].filter(([, text]) => text.includes('领域'))).toEqual([])
    expect([...catalogs.en].filter(([, text]) => /\bareas?\b/i.test(text))).toEqual([])
  })

  it('新词只出现在它的对象的键上', () => {
    for (const item of ['experimentConclusion', 'keyword', 'toRead'] as const) {
      const holding = [...catalogs.zh].filter(([, text]) => text.includes(WORDS[item].zh)).map(([path]) => path)
      expect(holding.filter((path) => !KEYS[item].includes(path) && !BOTH.includes(path)), item).toEqual([])
    }
  })
})

describe('标签后的数', () => {
  it('标题的文案只是标签，· N 由标题组件写在后面', () => {
    expect([zh.project.conclusions.tasks, zh.project.conclusions.experiments, en.project.conclusions.tasks])
      .toEqual(['任务', '实验记录', 'Tasks'])
  })
})

describe('引用数', () => {
  for (const [language, catalog] of [['zh', zh], ['en', en]] as const) {
    it(`${language}:作者候选、建议的作者和论文卡片都按同一个数字格式写`, () => {
      const shown = createFormat(language).number(12_345)
      expect(shown).toBe('12,345')
      expect([
        catalog.watches.candidateInfo(46, 12_345, 19), catalog.watches.suggestedAuthorInfo(2, 19, 12_345),
        catalog.papers.card.citations(12_345),
      ].map((text) => text.includes(shown))).toEqual([true, true, true])
    })
  }
})

describe('关注页上的数', () => {
  for (const [language, catalog] of [['zh', zh], ['en', en]] as const) {
    it(`${language}:论文数、引用数和 h-index 都按同一个数字格式写`, () => {
      const shown = createFormat(language).number(12_345)
      expect([
        catalog.watches.candidateInfo(12_345, 12_345, 12_345), catalog.watches.suggestedAuthorInfo(12_345, 12_345, 12_345),
        catalog.watches.suggestionBasis(12_345), catalog.watches.relatedPapers(12_345),
      ].map((text) => [text.split(shown).length - 1, text.includes('12345')])).toEqual([[3, false], [3, false], [1, false], [1, false]])
    })
  }
})

describe('提示、标签和占位只说结果', () => {
  // The notices, labels and placeholders the copy audit shortened: each states its result or name in
  // one clause, with no explanation after it.
  const results = (m: typeof zh) => [
    m.chat.ideaSavedNote, m.inbox.notices.duplicateToast, m.inbox.notices.remembered,
    m.research.list.createdFeedNote('Draft trees'),
    m.watches.projectLabel, m.watches.focusPlaceholder, m.wiki.ingest.discarded,
    m.common.trashed, m.inbox.notices.dismissed, m.inbox.notices.dismissedAll, m.papers.notices.topicAdded,
    m.papers.notices.updated, m.papers.notices.optionRenamed, m.papers.notices.columnTypeChanged,
    m.papers.metadata.updated(m.papers.metadata.fields.title),
  ]

  it('zh:一句之内，没有间隔号、逗号或句号后的解释', () => {
    for (const text of results(zh)) expect(text, text).not.toMatch(/[·，。；：]/)
  })

  it('en: one clause, with no separator or sentence after it', () => {
    for (const text of results(en)) expect(text, text).not.toMatch(/ · |[.;:]\s|[.;:]$/)
  })
})
