import { TOPIC_KIND } from '../../shared/topic-proposal.js'
import { wiki } from '../ipc.js'
import { useMessages } from '../messages/useMessages.js'
import { TagChips } from './TagChips.js'

/** The titles of the Wiki's topic pages, fetched anew each time an input opens so they are always its current pages. */
const wikiTopics = (): Promise<string[]> => wiki.cards().then((cards) => cards.filter((card) => card.kind === TOPIC_KIND).map((card) => card.title))

/**
 * The topics of a paper or a project, edited the same way wherever they show: a chip per topic,
 * whose × hands it to `onRemove`, then the `+` that adds one, offering the Wiki's topic pages the
 * list lacks; a title no page has is offered as new. With `onReplace`, clicking a chip edits it in
 * place. `onAdd`, `onRemove` and `onReplace` return whether the write completed. What is typed is
 * kept as a draft of `keep`, and `reveal` places the `+`; see `TagChips`.
 */
export function TopicChips({ topics, keep, onAdd, onRemove, onReplace, onError, reveal }: {
  topics: string[]
  keep: readonly string[]
  onAdd: (value: string) => Promise<boolean>
  onRemove: (value: string) => Promise<boolean>
  onReplace?: (from: string, to: string) => Promise<boolean>
  onError: (e: Error) => void
  reveal?: 'rest' | 'hover'
}) {
  const m = useMessages()
  return (
    <TagChips
      values={topics} vocabulary={wikiTopics} onAdd={onAdd} onRemove={onRemove} onError={onError} keep={keep} reveal={reveal}
      {...(onReplace === undefined ? {} : { onReplace })}
      labels={{ add: m.papers.tags.add, remove: m.papers.tags.remove, existing: m.papers.tags.existingTopics }}
    />
  )
}
