import { papers } from '../ipc.js'
import { useMessages } from '../messages/useMessages.js'
import { TagChips } from './TagChips.js'

/** The vault's topics, fetched anew each time an input opens so they are always its current values. */
const vaultTopics = (): Promise<string[]> => papers.facets('topics').then((facets) => facets.map((facet) => facet.value))

/**
 * A paper's topics, edited the same way in the paper table and the detail panel: a chip per topic,
 * whose × hands it to `onRemove`, then the `+` that adds one, offering the vault's topics the paper
 * lacks. `onAdd` and `onRemove` return whether the write completed. What is typed is kept as a
 * draft of `keep`, and `reveal` places the `+`; see `TagChips`.
 */
export function PaperTopics({ topics, keep, onAdd, onRemove, onError, reveal }: {
  topics: string[]
  keep: readonly string[]
  onAdd: (value: string) => Promise<boolean>
  onRemove: (value: string) => Promise<boolean>
  onError: (e: Error) => void
  reveal?: 'rest' | 'hover'
}) {
  const m = useMessages()
  return (
    <TagChips
      values={topics} vocabulary={vaultTopics} onAdd={onAdd} onRemove={onRemove} onError={onError} keep={keep} reveal={reveal}
      labels={{ add: m.papers.tags.add, remove: m.papers.tags.remove, existing: m.papers.tags.existingTopics }}
    />
  )
}
