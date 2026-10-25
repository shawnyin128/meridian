import { useEffect, useState } from 'react'
import type { ChangeEntry } from '../../shared/contract.js'
import { HUMAN_PRODUCER, NOTES_PROPOSAL } from '../../shared/vocabulary.js'
import { changelog } from '../ipc.js'
import { errorLabel } from '../lib/failure-label.js'
import type { Catalog } from '../messages/catalog.js'
import { useMessages } from '../messages/useMessages.js'
import { useJump, useNotice, useToday, useVaultRevision } from '../shell/AppShell.js'
import { useFormat } from '../lib/format.js'
import { useScreenLoad } from '../hooks/useScreenLoad.js'
import { useVaultWrite } from '../hooks/useVaultWrite.js'
import { CardTray } from '../components/CardTray.js'
import { ConfirmDialog } from '../components/ConfirmDialog.js'
import { Group, GroupedList } from '../components/GroupedList.js'
import { DiffLines } from '../components/DiffLines.js'
import { EmptyState } from '../components/EmptyState.js'
import { ENTITY_SCREEN, EntityLink } from '../components/EntityLink.js'
import { LoadingPlaceholder } from '../components/LoadingPlaceholder.js'
import { PaperText } from '../components/paper/PaperText.js'
import { AgentLabel } from '../components/SourceLabel.js'
import {
  PageBody, PageError, PageHeader, PageShell, PageTitle, SectionHeading,
} from '../components/PageShell.js'
import { RowActions, StructuredList, StructuredRow } from '../components/StructuredList.js'
import { IconButton } from '../components/IconButton.js'
import { IconArchive, IconTrash, IconUndo } from '../components/icons.js'
import { Button } from '../components/Button.js'
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

/** The end of the grey line under the title: undone, cannot be undone, or nothing for an entry that can be undone. */
const hint = (entry: ChangeEntry, state: Catalog['changelog']['state']): string => {
  if (entry.undone) return state.undone
  return entry.undoable ? '' : state.notUndoable
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

/** A change's title as paper text, the entity it names a link that opens that entity. */
function ChangeTitle({ entry }: { entry: ChangeEntry }) {
  const { open } = useJump()
  const { title, named } = entry
  if (named === undefined) return <PaperText text={title} />
  const screen = ENTITY_SCREEN[named.kind]
  return (
    <>
      <PaperText text={title.slice(0, named.from)} />
      <EntityLink
        kind={named.kind} label={<PaperText text={title.slice(named.from, named.to)} />}
        href={`#${screen}:${named.id}`} onOpen={() => open(screen, named.id)}
      />
      <PaperText text={title.slice(named.to)} />
    </>
  )
}

function DeleteChangeButton({ entry, onDelete }: {
  entry: ChangeEntry
  onDelete: (id: string) => void
}) {
  const m = useMessages()
  return (
    <ConfirmDialog
      trigger={(
        <IconButton label={m.common.delete} size="nested" tone="danger" onClick={(event) => event.stopPropagation()}>
          <IconTrash />
        </IconButton>
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
      trigger={<Button size="compact" tone="danger">{m.changelog.clearArchived}</Button>}
      title={m.changelog.confirmClearArchived(count)} description={m.changelog.confirmClearArchivedDescription}
      confirmLabel={m.changelog.confirmClearArchivedLabel} onConfirm={onClear}
    />
  )
}

/**
 * Recent Changes: every change to the vault, where it came from and what it changed. Two sections,
 * current and archived, are each split by day; the date is the day's heading and is not repeated in
 * the entries' grey lines. Clicking an entry expands its diff, independently of the other entries,
 * and the paper, project or Wiki page its title names opens from that name.
 * The screen title and the sidebar count only unarchived entries. Each entry has its own Undo, which
 * writes the entity back to how it was before this change and leaves archiving as it is. Entries come
 * from changelog.list; this screen does not hold the vault.
 */
export function Changelog() {
  const m = useMessages()
  const [entries, setEntries] = useState<ChangeEntry[] | null>(null)

  const today = useToday()
  const fmt = useFormat()
  const notice = useNotice()
  const { revision, bump } = useVaultRevision()
  const { error, load } = useScreenLoad()
  const write = useVaultWrite()

  useEffect(() => load('entries', changelog.list(), setEntries), [revision, load])

  // An undo is often rejected (the entity changed again after this change), so the reason shows as a
  // refusal notice instead of becoming a page-wide error.
  const undo = (id: string) => {
    void changelog.undo(id).then(() => {
      bump()
      notice.success(m.changelog.undoneNote)
    }).catch((e: unknown) => notice.refusal(errorLabel(m, e)))
  }

  // Archiving one entry shows no notice: the entry moving down into the Archived section is the feedback.
  const archive = (id: string) => {
    void write(changelog.archive(id))
  }

  const archiveAll = (count: number) => {
    void write(changelog.archiveAll(), { note: m.changelog.archivedNote(count) })
  }

  const deleteChange = (id: string) => {
    void write(changelog.delete(id), { note: m.changelog.deletedNote })
  }

  const clearArchived = (count: number) => {
    void write(changelog.clearArchived(), { note: m.changelog.clearedArchivedNote(count) })
  }

  const fresh = (entries ?? []).filter((c) => !c.archived)
  const filed = (entries ?? []).filter((c) => c.archived)
  // The screen title and "Archive all" count only the unarchived entries.
  const unread = fresh.length

  const row = (c: ChangeEntry) => (
    <StructuredRow className="crow" key={c.id}>
      <CardTray
        variant="row" composite
        summary={(
          <>
            <span className="ct"><ChangeTitle entry={c} /><ChangeSource source={c.source} /></span>
            <span className="cm">{[metaBelowHeading(c.meta), hint(c, m.changelog.state)].filter((s) => s !== '').join(SEP)}</span>
          </>
        )}
        action={(
          <RowActions className="cact">
            <DeleteChangeButton entry={c} onDelete={deleteChange} />
            {c.archived ? null : (
              <IconButton
                label={m.common.archive} size="nested" className="carch"
                onClick={(e) => { e.stopPropagation(); archive(c.id) }}
              ><IconArchive /></IconButton>
            )}
            {c.undoable ? (
              <IconButton
                label={m.common.undo} size="nested" className="cundo"
                onClick={(e) => { e.stopPropagation(); undo(c.id) }}
              ><IconUndo /></IconButton>
            ) : null}
          </RowActions>
        )}
      >
        <DiffLines lines={c.lines} />
      </CardTray>
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
    return (
      <GroupedList>
        {days.map((day, at) => (
          <Group key={`${day.date}-${at}`} title={fmt.dayHead(day.date, today)}>
            <StructuredList variant="embedded" maxVisibleRows="all">{day.entries.map(row)}</StructuredList>
          </Group>
        ))}
      </GroupedList>
    )
  }

  return (
    <PageShell>
      <PageHeader>
        <PageTitle count={unread}>{m.changelog.title}</PageTitle>
      </PageHeader>

      <PageError error={error} />

      <PageBody>
        <SectionHeading
          actions={(
            <Button
              size="compact" className="archall" disabled={unread === 0}
              onClick={() => archiveAll(unread)}
            >{m.changelog.archiveAll}</Button>
          )}
        >{m.changelog.unarchivedHeading}
        </SectionHeading>
        {entries === null
          ? (error === null ? <LoadingPlaceholder shape="rows" /> : null)
          : fresh.length === 0 ? <EmptyState variant="section">{m.changelog.empty}</EmptyState> : section(fresh)}

        {filed.length === 0 ? null : (
          <>
            <SectionHeading
              actions={<ClearArchivedButton count={filed.length} onClear={() => clearArchived(filed.length)} />}
            >{m.changelog.archivedHeading}
            </SectionHeading>
            {section(filed)}
          </>
        )}
      </PageBody>
    </PageShell>
  )
}
