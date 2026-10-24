import type { InboxEntry, InboxStream } from './contract.js'

/**
 * Returns the streams of kind `kind` that list `entry`, each a watch or a project by id with its group
 * label: the one that delivered it first when it is of that kind, then the others in order.
 */
export function listingsOf(
  entry: Pick<InboxEntry, 'kind' | 'watch' | 'project' | 'source' | 'also'>, kind: InboxStream['kind'],
): InboxStream[] {
  const first: InboxStream = {
    kind: entry.kind, id: entry.kind === 'discovery' ? entry.project : entry.watch, source: entry.source,
  }
  return [first, ...(entry.also ?? [])].filter((stream) => stream.kind === kind)
}
