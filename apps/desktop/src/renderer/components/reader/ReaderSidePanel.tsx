import type { PaperReading, PaperRow, ReadingMutation } from '../../../shared/contract.js'
import { useDrafts, type EditDraft } from '../../hooks/useDrafts.js'
import { useMessages } from '../../messages/useMessages.js'
import { PaperMetadata } from '../PaperMetadata.js'
import { ReadingNotes } from './ReadingNotes.js'
import { ReadingRemark } from './ReadingRemark.js'
import { PaperWikiIngest } from './PaperWikiIngest.js'
import { ReaderPanelHeader } from './ReaderPanelHeader.js'
import { SidePanel } from '../SidePanel.js'
import { ToggleGroup, ToggleItem } from '../Toolbar.js'
import { Tooltip } from '../Tooltip.js'

export type ReaderSideTab = 'metadata' | 'highlights' | 'notes' | 'remark' | 'wiki'
const TABS: ReaderSideTab[] = ['metadata', 'highlights', 'notes', 'remark', 'wiki']

function RailIcon({ tab }: { tab: ReaderSideTab }) {
  if (tab === 'metadata') return <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></svg>
  if (tab === 'highlights') return <svg viewBox="0 0 24 24"><path d="M4 20l4.5-1 10-10a2.1 2.1 0 00-3-3l-10 10L4 20zM14 8l3 3" /></svg>
  if (tab === 'remark') return <svg viewBox="0 0 24 24"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.4 2.6a2 2 0 0 1 3 3L12 15l-4 1 1-4z" /></svg>
  if (tab === 'wiki') return <svg viewBox="0 0 24 24"><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H12v18H7.5A3.5 3.5 0 0 0 4 23zM20 5.5A3.5 3.5 0 0 0 16.5 2H12v18h4.5A3.5 3.5 0 0 1 20 23z" /><path d="M17 7l.7 2.3L20 10l-2.3.7L17 13l-.7-2.3L14 10l2.3-.7z" /></svg>
  return <svg viewBox="0 0 24 24"><path d="M5 4h10l4 4v12H5zM15 4v5h4M8 13h8M8 16h6" /></svg>
}

/**
 * The collapsible reader rail reserves document width only after the user opens a panel. It keeps
 * the panels' unsaved text per paper, note and highlight while panels close and other papers open.
 * `selectedHighlightId` is the highlight selected on the page, which its list shows as selected.
 */
export function ReaderSidePanel({
  tab, onTab, paper, onPaper, reading, currentPage, saving, onMutate, onSaveRemark, onJump,
  focusHighlightId, selectedHighlightId,
}: {
  tab: ReaderSideTab | null
  onTab: (tab: ReaderSideTab | null) => void
  paper: PaperRow | null
  onPaper: (paper: PaperRow) => void
  reading: PaperReading | null
  currentPage: number
  saving: boolean
  onMutate: (mutation: ReadingMutation) => Promise<boolean>
  onSaveRemark: (text: string) => Promise<boolean>
  onJump: (page: number) => void
  focusHighlightId: string | null
  selectedHighlightId: string | null
}) {
  const m = useMessages()
  // The scope and the live targets both come from the reading shown, so they always name one paper.
  const paperId = reading?.paperId ?? ''
  const drafts = useDrafts(['paper', paperId])
  // A proposal's edited Markdown outlasts its write, so an undo brings it back; it has a scope of its
  // own, which the reading's notes and highlights do not prune.
  const ingestEdits = useDrafts<EditDraft>(['paper', paperId, 'wiki-ingest'])
  const edits = useDrafts<EditDraft>(['paper', paperId, 'edits'], reading === null ? null : [
    `remark:${reading.paperId}`,
    ...reading.notes.map((note) => `note:${note.id}`),
    ...reading.highlights.map((highlight) => `highlight:${highlight.id}`),
  ])
  return (
    <aside className={tab === null ? 'reader-side collapsed' : 'reader-side'}>
      {tab === 'metadata' && paper !== null
        ? (
          <SidePanel surface="edge" label={m.reader.rail.tabs.metadata} className="reader-meta">
            <ReaderPanelHeader title={m.reader.rail.tabs.metadata} />
            <PaperMetadata paper={paper} readStateLabel={m.papers.metadata.fields.readState} onSaved={onPaper} />
          </SidePanel>
        )
        : null}
      {(tab === 'highlights' || tab === 'notes') && reading !== null
        ? (
          <ReadingNotes
            reading={reading} currentPage={currentPage} saving={saving} onMutate={onMutate}
            onJump={onJump} mode={tab} focusHighlightId={focusHighlightId}
            selectedHighlightId={selectedHighlightId} drafts={drafts} edits={edits}
          />
        )
        : null}
      {tab === 'remark' && reading !== null
        ? <ReadingRemark reading={reading} saving={saving} onSave={onSaveRemark} edits={edits} />
        : null}
      {tab === 'wiki' && paper !== null && reading !== null
        ? <PaperWikiIngest paper={paper} reading={reading} onJump={onJump} edits={ingestEdits} />
        : null}
      <ToggleGroup
        label={m.reader.rail.label} className="reader-rail" value={tab ?? ''}
        onValueChange={(next) => onTab(next === '' ? null : next as ReaderSideTab)}
      >
        {TABS.map((key) => (
          <Tooltip key={key} label={m.reader.rail.tabs[key]} side="left">
            <ToggleItem value={key} aria-label={m.reader.rail.tabs[key]} className={tab === key ? 'on' : ''}>
              <RailIcon tab={key} />
            </ToggleItem>
          </Tooltip>
        ))}
      </ToggleGroup>
    </aside>
  )
}
