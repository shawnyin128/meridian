import { Fragment, useCallback, useEffect, useState } from 'react'
import type { ChangeEntry } from '../../shared/contract.js'
import { changelog } from '../ipc.js'
import type { Catalog } from '../messages/catalog.js'
import { useMessages } from '../messages/useMessages.js'
import { useBanner, useToast, useToday, useVaultRevision } from '../shell/AppShell.js'
import { useFormat } from '../lib/format.js'
import { useVaultWrite } from '../hooks/useVaultWrite.js'
import { ConfirmDialog } from '../components/ConfirmDialog.js'
import { DayHeading } from '../components/DayHeading.js'
import { DiffLines } from '../components/DiffLines.js'
import { EmptyState } from '../components/EmptyState.js'
import {
  PageBody, PageError, PageHeader, PageShell, PageTitle, SectionHeading,
} from '../components/PageShell.js'
import { StructuredList, StructuredRow } from '../components/StructuredList.js'
import './shell.css'
import './Changelog.css'

/** The separation between the two paragraphs in the gray characters is the same string as the splicing part. */
const SEP = ' · '

/**
 * In the gray line under the title, remove the relative date at the beginning and what is left: `meta` after the first separator.
 * The entire `meta` is the date, and if there is no separator, it will be an empty string.
 */
export function metaBelowHeading(meta: string): string {
  const at = meta.indexOf(SEP)
  return at < 0 ? '' : meta.slice(at + SEP.length)
}

/** The second half of the line of gray text under the title: Those that have been withdrawn are said to have been withdrawn, those that cannot be withdrawn are said to be irrevocable, and the rest are requested to be clicked. */
const hint = (entry: ChangeEntry, state: Catalog['changelog']['state']): string => {
  if (entry.undone) return state.undone
  return entry.undoable ? state.openToSee : state.notUndoable
}

function DeleteChangeButton({ entry, onDelete }: {
  entry: ChangeEntry
  onDelete: (id: string) => void
}) {
  const m = useMessages()
  return (
    <ConfirmDialog
      trigger={(
        <button className="btn plain tdel" onClick={(event) => event.stopPropagation()}>
          {m.common.delete}
        </button>
      )}
      title={m.changelog.confirmDelete}
      confirmLabel={m.changelog.confirmDeleteLabel} onConfirm={() => onDelete(entry.id)}
    />
  )
}

function ClearArchivedButton({ count, onClear }: { count: number; onClear: () => void }) {
  const m = useMessages()
  return (
    <ConfirmDialog
      trigger={<button className="btn plain tdel">{m.changelog.clearArchived}</button>}
      title={m.changelog.confirmClearArchived(count)}
      confirmLabel={m.changelog.confirmClearArchivedLabel} onConfirm={onClear}
    />
  )
}

/**
 * Recent changes: Every change in the library, its origin and what was changed. The two sections are divided according to filing and filing, and each section is divided into segments according to day.
 * The date is written in the subtitle at the beginning of the paragraph and will not be repeated in the gray text of the entry; click one to expand its diff, and the expanded entries will be different from each other.
 * Impact; The numbers in the screen header and sidebar are only those that are not archived. Each entry has its own undo entry. Undo writes that entity back to this transaction.
 * The way it was before, it will not affect whether it is archived or not. The entries are retrieved from changelog.list, and this screen does not hold the library.
 */
export function Changelog() {
  const m = useMessages()
  const [entries, setEntries] = useState<ChangeEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())

  const today = useToday()
  const fmt = useFormat()
  const banner = useBanner()
  const toast = useToast()
  const { revision, bump } = useVaultRevision()
  const reportError = useCallback((e: Error) => setError(e.message), [])
  const write = useVaultWrite()

  useEffect(() => {
    void changelog.list().then(setEntries).catch(reportError)
  }, [revision, reportError])

  const toggle = (id: string) => setOpen((shown) => {
    const next = new Set(shown)
    if (!next.delete(id)) next.add(id)
    return next
  })

  // It is common for cancellations to be rejected (the entity has been modified again after this transaction), and the reasons should be displayed on the screen instead of turning into a one-screen error report.
  const undo = (id: string) => {
    void changelog.undo(id).then(() => {
      bump()
      banner(m.changelog.undoneNote)
    }).catch((e: Error) => toast(e.message))
  }

  // If a single article is archived and no banner appears: the article that falls into one or two sections below will be counted as one. This is feedback.
  const archive = (id: string) => {
    void write(changelog.archive(id))
  }

  const archiveAll = (count: number) => {
    void write(changelog.archiveAll(), { note: m.changelog.archivedNote(count), notify: toast })
  }

  const deleteChange = (id: string) => {
    void write(changelog.delete(id), { note: m.changelog.deletedNote, notify: toast })
  }

  const clearArchived = (count: number) => {
    void write(changelog.clearArchived(), { note: m.changelog.clearedArchivedNote(count), notify: toast })
  }

  const fresh = entries.filter((c) => !c.archived)
  const filed = entries.filter((c) => c.archived)
  // The number in the screen header and "All Archives" only refer to the entire file that has not been viewed.
  const unread = fresh.length

  const row = (c: ChangeEntry) => (
    <StructuredRow
      composite className={open.has(c.id) ? 'crow open' : 'crow'} key={c.id} onActivate={() => toggle(c.id)}
    >
      <div className="chead">
        {/* Its click bubbles to the row, which owns the toggle; this button is the keyboard path to it. */}
        <button className="cbody" type="button" aria-expanded={open.has(c.id)}>
          <span className="ct">{c.title}<span className="src">{c.source}</span></span>
          <span className="cm">{[metaBelowHeading(c.meta), hint(c, m.changelog.state)].filter((s) => s !== '').join(SEP)}</span>
        </button>
        <div className="cact">
          <DeleteChangeButton entry={c} onDelete={deleteChange} />
          {c.archived ? null : (
            <button
              className="btn plain carch"
              onClick={(e) => { e.stopPropagation(); archive(c.id) }}
            >{m.common.archive}</button>
          )}
          {c.undoable ? (
            <button
              className="btn plain cundo"
              onClick={(e) => { e.stopPropagation(); undo(c.id) }}
            >{m.common.undo}</button>
          ) : null}
        </div>
      </div>
      <DiffLines lines={c.diff} />
    </StructuredRow>
  )

  /**
   * Entries in a section: the same day is connected into a paragraph, with a line of small gray text at the
   * beginning of the paragraph, each paragraph a separate embedded list so its own divider rules stay local
   * to that day. The order is as given by `changelog.list`, without rearrangement.
   */
  const section = (list: ChangeEntry[]) => {
    const days: { date: string; entries: ChangeEntry[] }[] = []
    for (const c of list) {
      const current = days.at(-1)
      if (current !== undefined && current.date === c.date) current.entries.push(c)
      else days.push({ date: c.date, entries: [c] })
    }
    return days.map((day, at) => (
      <Fragment key={`${day.date}-${at}`}>
        <DayHeading>{fmt.dayHead(day.date, today)}</DayHeading>
        <StructuredList variant="embedded" maxVisibleRows="all">{day.entries.map(row)}</StructuredList>
      </Fragment>
    ))
  }

  return (
    <PageShell>
      <PageHeader>
        <PageTitle>{m.changelog.title(unread)}</PageTitle>
      </PageHeader>

      <PageError error={error} />

      <PageBody>
        <SectionHeading className="flexh">{m.changelog.unarchivedHeading}
          <button
            className="btn plain archall" disabled={unread === 0}
            onClick={() => archiveAll(unread)}
          >{m.changelog.archiveAll}</button>
        </SectionHeading>
        {fresh.length === 0 ? <EmptyState variant="section">{m.changelog.empty}</EmptyState> : section(fresh)}

        {filed.length === 0 ? null : (
          <>
            <SectionHeading className="flexh">{m.changelog.archivedHeading}
              <ClearArchivedButton count={filed.length} onClear={() => clearArchived(filed.length)} />
            </SectionHeading>
            {section(filed)}
          </>
        )}
      </PageBody>
    </PageShell>
  )
}
