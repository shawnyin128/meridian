import { Fragment, useCallback, useEffect, useState } from 'react'
import type { ChangeEntry } from '../../shared/contract.js'
import { HUMAN_PRODUCER, NOTES_PROPOSAL } from '../../shared/vocabulary.js'
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
import { PaperText } from '../components/paper/PaperText.js'
import { AgentLabel } from '../components/SourceLabel.js'
import {
  PageBody, PageError, PageHeader, PageShell, PageTitle, SectionHeading,
} from '../components/PageShell.js'
import { StructuredList, StructuredRow } from '../components/StructuredList.js'
import './shell.css'
import './Changelog.css'

/** The separator between the parts of the grey line; the same string splits `meta` and joins the parts. */
const SEP = ' · '

/**
 * What is left of the grey line under the title once its leading relative date is dropped: `meta`
 * after the first separator. When the whole `meta` is the date, with no separator, this is ''.
 */
export function metaBelowHeading(meta: string): string {
  const at = meta.indexOf(SEP)
  return at < 0 ? '' : meta.slice(at + SEP.length)
}

/** The end of the grey line under the title: undone, cannot be undone, or a prompt to open the entry. */
const hint = (entry: ChangeEntry, state: Catalog['changelog']['state']): string => {
  if (entry.undone) return state.undone
  return entry.undoable ? state.openToSee : state.notUndoable
}

/**
 * Who made a change: nothing for the user's own, otherwise the agent label, naming the notes or the
 * experiment an agent's proposal came from.
 */
function ChangeSource({ source }: { source: ChangeEntry['source'] }) {
  const m = useMessages()
  if (source === HUMAN_PRODUCER) return null
  if (source === 'Meridian') return <AgentLabel className="src" />
  const from = m.changelog.proposalSource
  return <AgentLabel className="src" source={source === NOTES_PROPOSAL ? from.notes : from.lab} />
}

function DeleteChangeButton({ entry, onDelete }: {
  entry: ChangeEntry
  onDelete: (id: string) => void
}) {
  const m = useMessages()
  return (
    <ConfirmDialog
      trigger={(
        <button className="btn danger sm" onClick={(event) => event.stopPropagation()}>
          {m.common.delete}
        </button>
      )}
      title={m.changelog.confirmDelete} description={m.changelog.confirmDeleteDescription}
      confirmLabel={m.changelog.confirmDeleteLabel} onConfirm={() => onDelete(entry.id)}
    />
  )
}

function ClearArchivedButton({ count, onClear }: { count: number; onClear: () => void }) {
  const m = useMessages()
  return (
    <ConfirmDialog
      trigger={<button className="btn danger sm">{m.changelog.clearArchived}</button>}
      title={m.changelog.confirmClearArchived(count)} description={m.changelog.confirmClearArchivedDescription}
      confirmLabel={m.changelog.confirmClearArchivedLabel} onConfirm={onClear}
    />
  )
}

/**
 * Recent Changes: every change to the vault, where it came from and what it changed. Two sections,
 * current and archived, are each split by day; the date is the day's heading and is not repeated in
 * the entries' grey lines. Clicking an entry expands its diff, independently of the other entries.
 * The screen title and the sidebar count only unarchived entries. Each entry has its own Undo, which
 * writes the entity back to how it was before this change and leaves archiving as it is. Entries come
 * from changelog.list; this screen does not hold the vault.
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

  // An undo is often rejected (the entity changed again after this change), so the reason shows as a
  // toast instead of becoming a page-wide error.
  const undo = (id: string) => {
    void changelog.undo(id).then(() => {
      bump()
      banner(m.changelog.undoneNote)
    }).catch((e: Error) => toast(e.message))
  }

  // Archiving one entry shows no banner: the entry moving down into the Archived section is the feedback.
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
  // The screen title and "Archive all" count only the unarchived entries.
  const unread = fresh.length

  const row = (c: ChangeEntry) => (
    <StructuredRow
      composite className={open.has(c.id) ? 'crow open' : 'crow'} key={c.id} onActivate={() => toggle(c.id)}
    >
      <div className="chead">
        {/* Its click bubbles to the row, which owns the toggle; this button is the keyboard path to it. */}
        <button className="cbody" type="button" aria-expanded={open.has(c.id)}>
          <span className="ct"><PaperText text={c.title} /><ChangeSource source={c.source} /></span>
          <span className="cm">{[metaBelowHeading(c.meta), hint(c, m.changelog.state)].filter((s) => s !== '').join(SEP)}</span>
        </button>
        <div className="cact">
          <DeleteChangeButton entry={c} onDelete={deleteChange} />
          {c.archived ? null : (
            <button
              className="btn ghost sm carch"
              onClick={(e) => { e.stopPropagation(); archive(c.id) }}
            >{m.common.archive}</button>
          )}
          {c.undoable ? (
            <button
              className="btn ghost sm cundo"
              onClick={(e) => { e.stopPropagation(); undo(c.id) }}
            >{m.common.undo}</button>
          ) : null}
        </div>
      </div>
      <DiffLines lines={c.diff} />
    </StructuredRow>
  )

  /**
   * Entries in a section: consecutive entries of the same day form a group under a small grey day
   * heading, each group a separate embedded list so its own divider rules stay local to that day. The
   * order is as given by `changelog.list`, without rearrangement.
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
            className="btn sm archall" disabled={unread === 0}
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
