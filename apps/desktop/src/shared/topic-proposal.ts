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
      const slug = slugOf(title)
      if (slug === '') throw new Error('名字里得有字母或数字')
      target = `${dir}/${slug}`
      for (let n = 2; taken.has(target); n += 1) target = `${dir}/${slug}-${n}`
      taken.add(target)
      ops.push({
        op: 'createAggregation', kind: TOPIC_KIND, id: target, title,
        parents: [], columns: [], describe: '',
      })
    }
    ops.push({ op: 'setMembership', paper, in: target, cells: {} })
  }
  const title = removed.length === 0 && added.length === 1
    ? `把 ${short} 加进 ${added[0]}`
    : `改 ${short} 的主题`
  return { source: 'user', title, ops }
}
