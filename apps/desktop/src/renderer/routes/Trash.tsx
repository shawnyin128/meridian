import { Fragment, useCallback, useEffect, useState } from 'react'
import type { TrashEntry } from '../../shared/contract.js'
import { TRASH_RETENTION_DAYS } from '../../shared/vocabulary.js'
import { trash } from '../ipc.js'
import { useMessages } from '../messages/useMessages.js'
import { useToast, useToday, useVaultRevision } from '../shell/AppShell.js'
import { Icon } from '../components/icons.js'
import { ConfirmDialog } from '../components/ConfirmDialog.js'
import { EmptyState } from '../components/EmptyState.js'
import { StructuredList, StructuredRow } from '../components/StructuredList.js'
import {
  PageBody, PageError, PageFooter, PageHeader, PageShell, PageTitle, SectionHeading,
} from '../components/PageShell.js'
import { D1, dnum } from '../../shared/dates.js'
import { useVaultWrite } from '../hooks/useVaultWrite.js'
import './shell.css'
import './Trash.css'

/**
 * The order of grouping. The order array of the demo is the paper push, paper, and project. The attachments are not in the array and follow the ordered ones.
 * After; the idea follows the project, and attachments remain at the end.
 */
const KINDS: TrashEntry['kind'][] = ['inbox', 'paper', 'project', 'idea', 'attachment']

/** The title in the recovery banner is cut to this length, the same as the demo. */
const TITLE_IN_BANNER = 18

/**
 * One has a few days left before it is automatically cleared. `deletedAt` is the epoch millisecond of the deletion time, `today` is Curry’s today,
 * Both take the same clock. The day of deletion is counted as the entire retention period, and items that have expired are counted as 0 - the library will not list such entries.
 */
export const daysLeft = (deletedAt: number, today: string) =>
  Math.ceil((deletedAt + TRASH_RETENTION_DAYS * D1 - dnum(today) * D1) / D1)

/** "Empty Trash" and its second confirmation. The copy and button are taken from the demo's confirmPop, and the mask, focus and Escape belong to Radix. */
function ClearButton({ count, onClear }: { count: number; onClear: () => void }) {
  const m = useMessages()
  return (
    <ConfirmDialog
      trigger={<button className="btn plain tdel">{m.trash.clear}</button>}
      title={m.trash.confirmClear(count)}
      confirmLabel={m.trash.confirmClearLabel} onConfirm={onClear}
    />
  )
}

/**
 * Trash: A safety net for full app deletion. Entries are grouped by type, and each entry can be restored to its original location or completely deleted;
 * The first set is titled the entrance to empty the entire barrel. Entries are retrieved through trash.list and the deleted content itself is not held in this screen.
 */
export function Trash() {
  const m = useMessages()
  const [entries, setEntries] = useState<TrashEntry[]>([])
  const [error, setError] = useState<string | null>(null)

  const toast = useToast()
  const today = useToday()
  const { revision } = useVaultRevision()
  const reportError = useCallback((e: Error) => setError(e.message), [])
  const write = useVaultWrite()

  useEffect(() => {
    void trash.list().then(setEntries).catch(reportError)
  }, [revision, reportError])

  const restore = (entry: TrashEntry) => {
    void write(trash.restore(entry.id),
      { note: m.trash.restored(entry.title.slice(0, TITLE_IN_BANNER)) })
  }

  const purge = (id: string) => {
    void write(trash.purge(id), { note: m.trash.purged, notify: toast })
  }

  const clear = () => {
    void write(trash.clear(), { note: m.trash.cleared, notify: toast })
  }

  const groups = KINDS
    .map((kind) => ({ kind, items: entries.filter((e) => e.kind === kind) }))
    .filter((g) => g.items.length > 0)

  return (
    <PageShell>
      <PageHeader><PageTitle>{m.trash.title(entries.length)}</PageTitle></PageHeader>

      <PageError error={error} />

      <PageBody>
        {groups.length === 0
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
          : groups.map((g, i) => (
            <Fragment key={g.kind}>
              <SectionHeading className={i === 0 ? 'flexh' : undefined}>
                {m.trash.kinds[g.kind]} · {g.items.length}
                {/* The demo only places the clear button on the title of the first group */}
                {i === 0 ? <ClearButton count={entries.length} onClear={clear} /> : null}
              </SectionHeading>
              <StructuredList className="tgroup">
                {g.items.map((entry) => (
                  <StructuredRow className="trow" key={entry.id}>
                    <span className="tt2">{entry.title}</span>
                    <span className="tm2">{m.trash.autoClear(daysLeft(entry.deletedAt, today))}</span>
                    <button
                      className="btn" disabled={!entry.restorable}
                      onClick={() => restore(entry)}
                    >{m.common.restore}</button>
                    <button className="btn tdel" onClick={() => purge(entry.id)}>{m.common.deletePermanently}</button>
                  </StructuredRow>
                ))}
              </StructuredList>
            </Fragment>
          ))}
      </PageBody>

      {/* The retention period description of demo stays at the bottom of the view and does not move with the length of the content; the entire bar does not appear when the bucket is empty. */}
      {entries.length > 0
        ? (
          <PageFooter bare>
            <div className="thint">{m.trash.retentionNote(TRASH_RETENTION_DAYS)}</div>
          </PageFooter>
        )
        : null}
    </PageShell>
  )
}
