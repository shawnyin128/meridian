import { Fragment, useCallback, useEffect, useState } from 'react'
import type { TrashEntry } from '../../shared/contract.js'
import { TRASH_RETENTION_DAYS } from '../../shared/vocabulary.js'
import { trash } from '../ipc.js'
import { useMessages } from '../messages/useMessages.js'
import { useToast, useToday, useVaultRevision } from '../shell/AppShell.js'
import { Icon } from '../components/icons.js'
import { ConfirmDialog } from '../components/ConfirmDialog.js'
import { EmptyState } from '../components/EmptyState.js'
import { PaperText } from '../components/paper/PaperText.js'
import { plainTitle } from '../components/paper/paper-text.js'
import { StructuredList, StructuredRow } from '../components/StructuredList.js'
import { TitleNote } from '../components/TitleNote.js'
import {
  PageBody, PageError, PageFooter, PageHeader, PageShell, PageTitle, SectionHeading,
} from '../components/PageShell.js'
import { D1, dnum } from '../../shared/dates.js'
import { useVaultWrite } from '../hooks/useVaultWrite.js'
import './shell.css'
import './Trash.css'

/**
 * The order of the groups. The demo's order array was Inbox, papers, projects, with attachments
 * outside it, after the ordered kinds; ideas follow projects, and attachments stay last.
 */
const KINDS: TrashEntry['kind'][] = ['inbox', 'paper', 'project', 'idea', 'attachment']
/** The kinds whose title is a paper title. */
const PAPER_KINDS: ReadonlySet<TrashEntry['kind']> = new Set(['inbox', 'paper'])
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
      trigger={<button className="btn plain tdel">{m.trash.clear}</button>}
      title={m.trash.confirmClear} description={m.trash.confirmClearDescription(count)}
      confirmLabel={m.trash.confirmClearLabel} onConfirm={onClear}
    />
  )
}

/**
 * Trash: the safety net for every deletion in the app. Entries are grouped by kind, and each can be
 * restored to where it was or deleted permanently; the first group's heading holds "Empty trash".
 * Entries come from trash.list; this screen does not hold the deleted content itself.
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
      { note: <TitleNote message={m.trash.restored} title={plainOf(entry)} /> })
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
                    <span className="tt2">{PAPER_KINDS.has(entry.kind) ? <PaperText text={entry.title} /> : entry.title}</span>
                    <span className="tm2">{m.trash.autoClear(daysLeft(entry.deletedAt, today))}</span>
                    <button
                      className="btn" disabled={!entry.restorable}
                      onClick={() => restore(entry)}
                    >{m.common.restore}</button>
                    <ConfirmDialog
                      trigger={<button className="btn tdel">{m.common.deletePermanently}</button>}
                      title={m.trash.confirmPurge(plainOf(entry))} description={m.trash.confirmPurgeDescription}
                      confirmLabel={m.trash.confirmPurgeLabel} onConfirm={() => purge(entry.id)}
                    />
                  </StructuredRow>
                ))}
              </StructuredList>
            </Fragment>
          ))}
      </PageBody>

      {/* As in the demo, the retention note stays at the bottom of the view; an empty trash shows no bar. */}
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
