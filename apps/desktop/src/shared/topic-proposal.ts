import type { Proposal, WikiAggregationCard, WikiHome } from './contract.js'
import { slugOf } from './slug.js'
import { PAPER_PAGE } from './vocabulary.js'

export const TOPIC_KIND = 'topic'

/** Topic identity ignores casing and whitespace while preserving its displayed title. */
export const topicTitleKey = (title: string): string => title.toLowerCase().replace(/\s+/gu, '')

/** Returns the directory declared for topic aggregations. */
export function topicDir(home: WikiHome): string {
  const kind = home.kinds.find((item) => item.key === TOPIC_KIND)
  if (kind === undefined) throw new Error('这个库的 Wiki 没有主题这一种')
  return kind.dir
}

/**
 * The op that creates a top-level topic page titled `title` under `dir`, with an id no page in
 * `taken` holds, which it adds to `taken`. Throws for a title with no letter or digit.
 */
function newTopicPage(title: string, dir: string, taken: Set<string>): Extract<Proposal['ops'][number], { op: 'createAggregation' }> {
  const slug = slugOf(title)
  if (slug === '') throw new Error('名字里得有字母或数字')
  let id = `${dir}/${slug}`
  for (let n = 2; taken.has(id); n += 1) id = `${dir}/${slug}-${n}`
  taken.add(id)
  return { op: 'createAggregation', kind: TOPIC_KIND, id, title, parents: [], columns: [], describe: '' }
}

/**
 * Builds the proposal that creates a top-level topic page for each of `titles` that no topic page in
 * `cards` carries, titles matching as topicTitleKey has them; null when every title has one. `dir`
 * is asked for only when a page is to be created. Throws for a title with no letter or digit, and
 * when `dir` throws.
 */
export function newTopicPages(titles: readonly string[], cards: WikiAggregationCard[], dir: () => string): Proposal | null {
  const held = new Set(cards.filter((card) => card.kind === TOPIC_KIND).map((card) => topicTitleKey(card.title)))
  const missing = [...new Map(titles.filter((title) => !held.has(topicTitleKey(title)))
    .map((title) => [topicTitleKey(title), title])).values()]
  if (missing.length === 0) return null
  const into = dir()
  const taken = new Set(cards.map((card) => card.id))
  return {
    source: 'user',
    title: `新建主题「${missing.join('」「')}」`,
    ops: missing.map((title) => newTopicPage(title, into, taken)),
  }
}

/** Builds the proposal that makes a paper belong to exactly the supplied topic titles. */
export function topicProposal(
  paperId: string, short: string, held: string[], next: string[],
  cards: WikiAggregationCard[], dir: string,
): Proposal | null {
  const wanted = [...new Map(next.map((title) => title.trim()).filter(Boolean)
    .map((title) => [topicTitleKey(title), title])).values()]
  const wantedKeys = new Set(wanted.map(topicTitleKey))
  const heldKeys = new Set(held.map(topicTitleKey))
  const removed = held.filter((title) => !wantedKeys.has(topicTitleKey(title)))
  const added = wanted.filter((title) => !heldKeys.has(topicTitleKey(title)))
  if (removed.length === 0 && added.length === 0) return null
  const paper = `${PAPER_PAGE}${paperId}`
  const topics = cards.filter((card) => card.kind === TOPIC_KIND)
  const taken = new Set(cards.map((card) => card.id))
  const ops: Proposal['ops'] = []
  for (const title of removed) {
    const target = topics.find((card) => topicTitleKey(card.title) === topicTitleKey(title))
    if (target === undefined) throw new Error(`Wiki 里没有叫「${title}」的主题`)
    ops.push({ op: 'removeMembership', paper, in: target.id })
  }
  for (const title of added) {
    let target = topics.find((card) => topicTitleKey(card.title) === topicTitleKey(title))?.id
    if (target === undefined) {
      const created = newTopicPage(title, dir, taken)
      target = created.id
      ops.push(created)
    }
    ops.push({ op: 'setMembership', paper, in: target, cells: {} })
  }
  const title = removed.length === 0 && added.length === 1
    ? `把 ${short} 加进 ${added[0]}`
    : `改 ${short} 的主题`
  return { source: 'user', title, ops }
}
