import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { zh } from '../renderer/messages/zh/index.js'

const RENDERER = join(import.meta.dirname, '..', 'renderer')

/** Every renderer source file as `path` and text, stylesheet comments removed. */
const FILES = readdirSync(RENDERER, { recursive: true, encoding: 'utf8' })
  .filter((path) => /\.(css|tsx)$/.test(path) && !/\.test\./.test(path))
  .map((path) => ({ path, text: readFileSync(join(RENDERER, path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '') }))

const emptyCss = FILES.find((file) => file.path.endsWith('EmptyState.css'))!.text
const sectionRule = emptyCss.match(/\.empty-state--section(?:,[^{]*)?\{([^}]*)\}/)![1]!

/** The empty-state copy each list or section shows, by catalog path. */
const EMPTY = {
  'changelog.empty': zh.changelog.empty,
  'chat.empty': zh.chat.empty,
  'feed.empty': zh.feed.empty,
  'ideas.emptyGroup.open': zh.ideas.emptyGroup.open,
  'ideas.emptyGroup.active': zh.ideas.emptyGroup.active,
  'ideas.emptyGroup.done': zh.ideas.emptyGroup.done,
  'inbox.empty.discoveryNone': zh.inbox.empty.discoveryNone,
  'inbox.empty.discoveryNoSeeds': zh.inbox.empty.discoveryNoSeeds,
  'inbox.empty.watch': zh.inbox.empty.watch,
  'later.empty': zh.later.empty,
  'trash.empty': zh.trash.empty,
  'reader.emptyReading': zh.reader.emptyReading,
  'papers.researchMap.empty': zh.papers.researchMap.empty,
  'papers.reading.empty': zh.papers.reading.empty,
  'papers.understanding.empty': zh.papers.understanding.empty,
  'project.conclusions.empty': zh.project.conclusions.empty,
  'project.plan.noTasks': zh.project.plan.noTasks,
  'project.plan.noMilestones': zh.project.plan.noMilestones,
  'project.plan.noteEmpty': zh.project.plan.noteEmpty,
  'project.attachments.empty': zh.project.attachments.empty,
  'project.links.empty': zh.project.links.empty,
  'research.list.empty': zh.research.list.empty,
  'project.noLinkedIdeas': zh.project.noLinkedIdeas,
  'project.remarkEmpty': zh.project.remarkEmpty,
  'project.graph.empty': zh.project.graph.empty,
  'settings.archived.empty': zh.settings.archived.empty,
  'wiki.noPapers': zh.wiki.noPapers,
  'wiki.noDirectPapers': zh.wiki.noDirectPapers,
  'wiki.claims.form.noConclusions': zh.wiki.claims.form.noConclusions,
  'wiki.claims.form.noOthers': zh.wiki.claims.form.noOthers,
  'research.panel.noRecords': zh.research.panel.noRecords,
  'research.panel.paperCount(0)': zh.research.panel.paperCount(0),
  'wiki.noBody': zh.wiki.noBody,
  'wiki.noChildren': zh.wiki.noChildren,
  'wiki.queue.empty': zh.wiki.queue.empty,
  'wiki.tidy.empty': zh.wiki.tidy.empty,
  'watches.empty': zh.watches.empty('主题'),
  'shell.search.noHits': zh.shell.search.noHits,
}

describe('空态', () => {
  it('分节空态与上面的标题齐平、高一行列表行，切换同一位置的标签页时不跳', () => {
    expect(sectionRule).toContain('min-height:var(--row-list-h)')
    expect(sectionRule).not.toMatch(/padding/)
  })

  it('选项列表里的空态和分节空态一样高一行，字从选项的字开始的地方开始', () => {
    /** The declarations of every rule of `css` whose selector list names `selector`. */
    const declared = (css: string, selector: string) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, selectors]) => selectors!.split(',').map((one) => one.trim()).includes(selector)).map(([, , body]) => body).join(';')
    const menu = FILES.find((file) => file.path.endsWith('ActionMenu.css'))!.text
    const padding = (body: string) => body.match(/(?:^|;)\s*padding:([^;]*)/)?.[1]
    expect(padding(declared(menu, '.mi'))).toBe('0 var(--row-menu-pad)')
    expect(padding(declared(emptyCss, '.empty-state--option'))).toBe(padding(declared(menu, '.mi')))
    expect(declared(emptyCss, '.empty-state--option')).toContain('min-height:var(--row-list-h)')
  })

  it('标签页里列表的每一行和空着的标签页一样，都是一行列表行高', () => {
    const tabbed = FILES.find((file) => file.path.endsWith('TabbedSection.css'))?.text ?? ''
    const rowRule = tabbed.match(/\.tabbed-section-panel>\.structured-list \.structured-row\{([^}]*)\}/)?.[1] ?? ''
    expect(rowRule).toContain('min-height:var(--row-list-h)')
  })

  it('没有哪一页再手搭空态', () => {
    const handBuilt = FILES.flatMap(({ path, text }) => ['direction-empty', 'paper-wiki-review-empty', 'rgempty', 'className="lm"']
      .filter((mark) => text.includes(mark)).map((mark) => `${path}: ${mark}`))
    expect(handBuilt).toEqual([])
  })

  it('空态都用同一个句式：还没有……或没有找到……，不带句号', () => {
    const off = Object.entries(EMPTY).filter(([, text]) => !/^(还没有|没有找到)/.test(text) || text.endsWith('。'))
    expect(off).toEqual([])
  })
})
