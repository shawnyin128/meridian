import type { PaperReading, PaperRow, ResearchIdea, SearchAnchor, SearchHit, Task } from '../shared/contract.js'
import { PAPER_PAGE, SEARCH_LIMIT } from '../shared/vocabulary.js'
import type { WikiAggregationRecord, WikiData } from './wiki/index.js'

/** The vault entities a search reads, as a store holds them in memory. */
export type SearchData = {
  wiki: WikiData
  projects: Iterable<{ id: string; name: string; status: string; topic: string; tasks: readonly Task[] }>
  chats: Iterable<{ id: string; title: string; paperId?: string | undefined; messages: readonly unknown[] }>
  papers: Iterable<PaperRow>
  readings: Iterable<PaperReading>
  ideas: Iterable<ResearchIdea>
  /** Read-later entries whose paper is not in the vault. */
  later: Iterable<{ id: string; title: string; authors: string; venue: string }>
}

/** A text of an entity other than its title, and where a match in it lands. */
type Text = { text: string; anchor?: SearchAnchor }

/** One searchable entity: the hit it becomes, the title it is matched by first, and its other texts. */
type Entry = { hit: SearchHit; title: string; texts: Text[] }

/** How many match qualities a title has; a match outside the title ranks after all of them. */
const TITLE_RANKS = 3

/** How many characters a snippet keeps before the match, and how many it keeps in all. */
const SNIPPET_LEAD = 30
const SNIPPET_CHARS = 160

/** A letter of a script that puts spaces between words, or a digit. */
const WORD = /[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{N}]/u

/** Whether a word starts at `at` in `text`: no word character runs into it from the left. */
const startsWord = (text: string, at: number): boolean =>
  at === 0 || !WORD.test(text[at - 1]!) || !WORD.test(text[at]!)

/**
 * The non-blank lines of Markdown `text` as plain text: block markers, bold and code marks and
 * trailing block ids removed, a link shown as its label, or as `titleOf` the page a bare `[[…]]`
 * names, and runs of whitespace collapsed.
 */
function plainLines(text: string, titleOf: (id: string) => string): string[] {
  return text.split('\n').map((line) => line
    .replace(/^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)/, '')
    .replace(/\[\[[^\]|\n]+\|([^\]\n]+)\]\]/g, '$1')
    .replace(/\[\[([^\]#\n]+)(?:#[^\]\n]*)?\]\]/g, (_, id: string) => titleOf(id))
    .replace(/\[([^\]\n]+)\]\([^)\n]*\)/g, '$1')
    .replace(/\*\*|`|\s\^[\w-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()).filter((line) => line !== '')
}

/** Every searchable entity in `data`, aggregations first, then projects, chats, papers, ideas, tasks and read-later entries. */
function entries(data: SearchData): Entry[] {
  const pages = data.wiki.pages
  const projects = [...data.projects]
  const names = new Map(projects.map((project) => [project.id, project.name]))
  const readings = new Map([...data.readings].map((reading) => [reading.paperId, reading]))
  const ids = Object.keys(pages).sort()
  const titleOf = (id: string): string => pages[id]?.fm.title ?? id
  /** `texts`, each split into its plain lines, every line landing at `anchor`. */
  const linesOf = (texts: readonly string[], anchor?: SearchAnchor): Text[] => texts
    .flatMap((text) => plainLines(text, titleOf)).map((text) => (anchor === undefined ? { text } : { text, anchor }))
  return [
    ...Object.entries(data.wiki.kinds).flatMap(([key, kind]) => ids.filter((id) => pages[id]!.kind === key).map((id): Entry => {
      const page = pages[id] as WikiAggregationRecord
      return {
        hit: { kind: 'aggregation', target: id, title: `${kind.label}：${page.fm.title}`, meta: 'Wiki' },
        title: page.fm.title,
        texts: linesOf([page.body, ...(page.fm.claims ?? []).map((claim) => claim.text)]),
      }
    })),
    ...projects.map((p): Entry => ({
      hit: { kind: 'project', target: p.id, title: `项目：${p.name}`, meta: `${p.status} · ${p.topic}` }, title: p.name, texts: [],
    })),
    ...[...data.chats].filter((c) => c.paperId === undefined || c.messages.length > 0).map((c): Entry => ({
      hit: { kind: 'chat', target: c.id, title: `对话：${c.title}`, meta: '对话' }, title: c.title, texts: [],
    })),
    ...[...data.papers].map((p): Entry => {
      const reading = readings.get(p.id)
      return {
        hit: { kind: 'paper', target: p.id, title: `论文：${p.title}`, meta: `${p.year ?? ''} ${p.venue}`.trim() },
        title: p.title,
        texts: [
          ...linesOf([(p.authors ?? []).join(', '), pages[PAPER_PAGE + p.id]?.body ?? '']),
          ...(reading?.highlights ?? []).flatMap((h) => linesOf([h.quote, h.note], { highlight: h.id, page: h.page })),
          ...(reading?.notes ?? []).flatMap((n) => linesOf([n.text], { note: n.id, page: n.page })),
        ],
      }
    }),
    ...[...data.ideas].map((idea): Entry => ({
      hit: {
        kind: 'idea', target: idea.id, title: `想法：${idea.title}`,
        meta: idea.project === undefined ? '' : names.get(idea.project) ?? '',
      },
      title: idea.title,
      texts: linesOf([idea.body]),
    })),
    ...projects.flatMap((p) => p.tasks.map((task): Entry => ({
      hit: { kind: 'task', target: p.id, title: `任务：${task.title}`, meta: p.name, anchor: { task: task.id } },
      title: task.title,
      texts: linesOf([task.note ?? '']),
    }))),
    ...[...data.later].map((entry): Entry => ({
      hit: { kind: 'later', target: entry.id, title: `稍后阅读：${entry.title}`, meta: entry.venue },
      title: entry.title,
      texts: linesOf([entry.authors]),
    })),
  ]
}

/**
 * How well `text` holds every one of `terms`, compared lowercased; lower is better: 0 when it
 * starts with `phrase`, 1 when each term starts a word somewhere in it, 2 otherwise. Null when a
 * term is missing.
 */
function quality(text: string, phrase: string, terms: readonly string[]): number | null {
  const lower = text.toLowerCase()
  let words = true
  for (const term of terms) {
    let at = lower.indexOf(term)
    if (at < 0) return null
    while (at >= 0 && !startsWord(lower, at)) at = lower.indexOf(term, at + 1)
    if (at < 0) words = false
  }
  return lower.startsWith(phrase) ? 0 : words ? 1 : 2
}

/**
 * `text`, which holds every one of `terms`, from at most SNIPPET_LEAD characters before the first
 * of them, starting at a word, and at most SNIPPET_CHARS long.
 */
function snippetOf(text: string, terms: readonly string[]): string {
  const lower = text.toLowerCase()
  const at = Math.min(...terms.map((term) => lower.indexOf(term)))
  let start = Math.max(0, at - SNIPPET_LEAD)
  while (start < at && !startsWord(text, start)) start += 1
  return text.slice(start, start + SNIPPET_CHARS).trim()
}

/**
 * Returns at most SEARCH_LIMIT hits for `query` over `data`, one per entity. The query splits at
 * whitespace into terms compared without case, and an entity matches when its title or one line
 * of its other texts holds every term. Title matches rank above all others; within each, a text
 * starting with the whole query ranks first, then one where every term starts a word, then the
 * rest, and equal matches keep the order of `entries`. A hit matched outside its title carries a
 * snippet of the matching line and that line's anchor. Paper hits returned carry `pdf(id)`, which
 * is asked of no other paper. A query that is blank once trimmed matches nothing.
 */
export function searchHits(data: SearchData, query: string, pdf: (id: string) => boolean): SearchHit[] {
  const phrase = query.trim().toLowerCase().replace(/\s+/g, ' ')
  if (phrase === '') return []
  const terms = phrase.split(' ')
  const found: { rank: number; at: number; hit: SearchHit }[] = []
  entries(data).forEach((entry, at) => {
    const titled = quality(entry.title, phrase, terms)
    if (titled !== null) {
      found.push({ rank: titled, at, hit: entry.hit })
      return
    }
    let best: { rank: number; text: Text } | null = null
    for (const text of entry.texts) {
      const rank = quality(text.text, phrase, terms)
      if (rank !== null && (best === null || rank < best.rank)) best = { rank, text }
    }
    if (best === null) return
    found.push({
      rank: TITLE_RANKS + best.rank,
      at,
      hit: { ...entry.hit, snippet: snippetOf(best.text.text, terms), ...(best.text.anchor === undefined ? {} : { anchor: best.text.anchor }) },
    })
  })
  return found.sort((a, b) => a.rank - b.rank || a.at - b.at).slice(0, SEARCH_LIMIT)
    .map(({ hit }) => (hit.kind === 'paper' ? { ...hit, pdf: pdf(hit.target) } : hit))
}
