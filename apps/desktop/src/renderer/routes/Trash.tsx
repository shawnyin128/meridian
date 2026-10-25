import { useEffect, useState } from 'react'
import type { TrashEntry } from '../../shared/contract.js'
import { TRASH_RETENTION_DAYS } from '../../shared/vocabulary.js'
import { trash } from '../ipc.js'
import { useMessages } from '../messages/useMessages.js'
import { useToday, useVaultRevision } from '../shell/AppShell.js'
import { Icon, IconRestore, IconTrash } from '../components/icons.js'
import { IconButton } from '../components/IconButton.js'
import { ConfirmDialog } from '../components/ConfirmDialog.js'
import { EmptyState } from '../components/EmptyState.js'
import { FadeText } from '../components/FadeText.js'
import { Group, GroupedList } from '../components/GroupedList.js'
import { LoadingPlaceholder } from '../components/LoadingPlaceholder.js'
import { PaperText } from '../components/paper/PaperText.js'
import { plainTitle } from '../components/paper/paper-text.js'
import { Item } from '../components/Item.js'
import { List } from '../components/List.js'
import { TitleNote } from '../components/TitleNote.js'
import {
  PageBody, PageError, PageHeader, PageShell, PageTitle,
} from '../components/PageShell.js'
import { D1, dnum } from '../../shared/dates.js'
import { useScreenLoad } from '../hooks/useScreenLoad.js'
import { useVaultWrite } from '../hooks/useVaultWrite.js'
import { Button } from '../components/Button.js'
import './shell.css'

/**
 * The order of the groups: the order of each kind's row in the sidebar, top to bottom. Attachments
 * have no row there and come last.
 */
const KINDS: TrashEntry['kind'][] = ['inbox', 'later', 'chat', 'paper', 'project', 'idea', 'attachment']
/** The kinds whose title is, or for a chat can be, a paper title. */
const PAPER_KINDS: ReadonlySet<TrashEntry['kind']> = new Set(['inbox', 'later', 'paper', 'chat'])
const plainOf = (entry: TrashEntry): string => (PAPER_KINDS.has(entry.kind) ? plainTitle(entry.title) : entry.title)

/**
 * Days left before an entry is cleared automatically. `deletedAt` is the deletion time in epoch
 * milliseconds and `today` the vault's today; both come from the same clock. An entry deleted today
 * has the whole retention period left, and an expired one counts as 0: the vault no longer lists
 * such entries.
 */
export const daysLeft = (deletedAt: number, today: string) =>
  Math.ceil((deletedAt + TRASH_RETENTION_DAYS * D1 - dnum(today) * D1) / D1)

/** "Empty Trash" and its second confirmation. The copy and button are taken from the demo's confirmPop, and the mask, focus and Escape belong to Radix. */
function ClearButton({ count, onClear }: { count: number; onClear: () => void }) {
  const m = useMessages()
  return (
    <ConfirmDialog
      trigger={<Button size="regular" tone="danger">{m.trash.clear}</Button>}
      title={m.trash.confirmClear} description={m.trash.confirmClearDescription(count)}
      confirmLabel={m.trash.confirmClearLabel} onConfirm={onClear}
    />
  )
}

/**
 * Trash: the safety net for every deletion in the app. Entries are grouped by kind, and each can be
 * restored to where it was or deleted permanently; the page header holds "Empty trash".
 * Entries come from trash.list; this screen does not hold the deleted content itself.
 */
export function Trash() {
  const m = useMessages()
  const [entries, setEntries] = useState<TrashEntry[] | null>(null)

  const today = useToday()
  const { revision } = useVaultRevision()
  const { error, load } = useScreenLoad()
  const write = useVaultWrite()

  useEffect(() => load('entries', trash.list(), setEntries), [revision, load])

  const restore = (entry: TrashEntry) => {
    void write(trash.restore(entry.id),
      { note: <TitleNote message={m.trash.restored} title={plainOf(entry)} /> })
  }

  const purge = (id: string) => {
    void write(trash.purge(id), { note: m.trash.purged })
  }

  const clear = () => {
    void write(trash.clear(), { note: m.trash.cleared })
  }

  const held = entries ?? []
  const groups = KINDS
    .map((kind) => ({ kind, items: held.filter((e) => e.kind === kind) }))
    .filter((g) => g.items.length > 0)

  return (
    <PageShell>
      <PageHeader actions={groups.length === 0 ? undefined : <ClearButton count={held.length} onClear={clear} />}>
        <PageTitle count={held.length}>{m.trash.title}</PageTitle>
      </PageHeader>

      <PageError error={error} />

      <PageBody>
        {entries === null
          ? (error === null ? <LoadingPlaceholder shape="rows" /> : null)
          : groups.length === 0
          ? (
            <EmptyState
              variant="page"
              icon={(
                <Icon sw={1.4}>
                  <path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" />
                </Icon>
              )}
            >
              {m.trash.empty}
            </EmptyState>
          )
          : (
            <GroupedList>
              {groups.map((g) => (
                <Group key={g.kind} title={m.trash.kinds[g.kind]} count={g.items.length}>
                  <List variant="embedded" rows="all" className="tgroup">
                    {g.items.map((entry) => (
                      <Item
                        className="trow" key={entry.id}
                        title={<FadeText className="tt2">{PAPER_KINDS.has(entry.kind) ? <PaperText text={entry.title} /> : entry.title}</FadeText>}
                        trailing={<span className="tm2">{m.trash.autoClear(daysLeft(entry.deletedAt, today))}</span>}
                        actions={(
                          <>
                            <IconButton
                              label={m.common.restore} size="nested" disabled={!entry.restorable} onClick={() => restore(entry)}
                              note={entry.restorable
                                ? undefined
                                : entry.kind === 'paper' ? m.trash.paperTaken : entry.kind === 'chat' ? m.trash.chatTaken : m.trash.projectGone}
                            ><IconRestore /></IconButton>
                            <ConfirmDialog
                              trigger={(
                                <IconButton label={m.common.deletePermanently} size="nested" tone="danger"><IconTrash /></IconButton>
                              )}
                              title={m.trash.confirmPurge(plainOf(entry))} description={m.trash.confirmPurgeDescription}
                              confirmLabel={m.trash.confirmPurgeLabel} onConfirm={() => purge(entry.id)}
                            />
                          </>
                        )}
                      />
                    ))}
                  </List>
                </Group>
              ))}
            </GroupedList>
          )}
      </PageBody>
    </PageShell>
  )
}
