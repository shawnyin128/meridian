import type { WikiBacklink } from '../../shared/contract.js'
import { PAPER_PAGE } from '../../shared/vocabulary.js'
import { CallError } from '../call-error.js'
import type { WikiData } from './model.js'
import { isPaper, labelOf, titleOf } from './model.js'

/**
 * What refers to Wiki pages from outside the Wiki: every project with its name, the ids of the papers
 * it links and the pages its relations name; every idea with its title and the pages its relations
 * name; every chat with its title, the id of the paper it reads and the text of each message the user
 * sent in it.
 */
export type BacklinkContext = {
  projects: { id: string; name: string; papers: string[]; pages: string[] }[]
  ideas: { id: string; title: string; pages: readonly string[] }[]
  chats: { id: string; title: string; paper?: string | undefined; sent: string[] }[]
}

/** A body link `[[target]]`, `[[target#^claim]]` or `[[target|label]]`; group 1 is the target up to the label. */
const BODY_LINK = /\[\[([^\]|\n]+)(?:\|[^\]\n]+)?\]\]/g

/** Whether `text` opens with `@name` followed by white space or nothing, ignoring case. */
const mentions = (text: string, name: string): boolean => {
  const head = text.trimStart().toLowerCase()
  const at = `@${name.toLowerCase()}`
  return head.startsWith(at) && (head.length === at.length || /\s/.test(head[at.length]!))
}

/**
 * Returns what refers to Wiki page `id`, each once, in this order: the other pages whose body links to
 * it (a link to one of its claims counts), aggregations by kind in schema order before papers, each
 * kind by page id; the projects whose relations name it or, for a paper page, that link the paper; the
 * ideas whose relations name it; and the chats that read a paper page or in which the user sent a
 * message opening with an `@` mention of the page's title (or a paper's short title). Throws a
 * `not-found` CallError if the Wiki has no page `id`.
 */
export function wikiBacklinks(data: WikiData, id: string, context: BacklinkContext): WikiBacklink[] {
  const page = data.pages[id]
  if (page === undefined) throw new CallError('not-found', `wiki 页不存在：${id}`)
  const paper = isPaper(page) ? id.slice(PAPER_PAGE.length) : undefined
  const names = isPaper(page) ? [page.fm.title, ...(page.fm.short === undefined ? [] : [page.fm.short])] : [page.fm.title]
  const kinds = Object.keys(data.kinds)
  const rank = (other: string): number => {
    const held = data.pages[other]!
    return isPaper(held) ? kinds.length : kinds.indexOf(held.kind)
  }

  const pages = Object.keys(data.pages).sort()
    .filter((other) => other !== id
      && [...data.pages[other]!.body.matchAll(BODY_LINK)].some((m) => m[1]!.split('#')[0] === id))
    .sort((a, b) => rank(a) - rank(b))
    .map((other): WikiBacklink => {
      const held = data.pages[other]!
      const title = labelOf(data, other)
      const full = titleOf(data, other)
      const kindLabel = isPaper(held) ? undefined : data.kinds[held.kind]?.label
      return {
        kind: 'page', id: other, title,
        ...(full === title ? {} : { fullTitle: full }),
        ...(kindLabel === undefined ? {} : { kindLabel }),
      }
    })
  const projects = context.projects
    .filter((p) => p.pages.includes(id) || (paper !== undefined && p.papers.includes(paper)))
    .map((p): WikiBacklink => ({ kind: 'project', id: p.id, title: p.name }))
  const ideas = context.ideas
    .filter((idea) => idea.pages.includes(id))
    .map((idea): WikiBacklink => ({ kind: 'idea', id: idea.id, title: idea.title }))
  const chats = context.chats
    .filter((chat) => (paper !== undefined && chat.paper === paper)
      || chat.sent.some((text) => names.some((name) => mentions(text, name))))
    .map((chat): WikiBacklink => ({ kind: 'chat', id: chat.id, title: chat.title }))
  return [...pages, ...projects, ...ideas, ...chats]
}
