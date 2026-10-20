import type { ReactNode } from 'react'
import type { ResearchIdea } from '../../../shared/contract.js'
import { useFormat } from '../../lib/format.js'
import { useMessages } from '../../messages/useMessages.js'
import { SectionHeading } from '../PageShell.js'
import { PanelClose } from '../PanelClose.js'
import { PaperText } from '../paper/PaperText.js'
import { plainTitle } from '../paper/paper-text.js'
import { SLOT } from '../TitleNote.js'
import { Tag } from '../Tag.js'
import './IdeaPanel.css'

/** Where an idea came from, as plain text for a tooltip: the conversation, after the paper it was about when there is one. */
export const ideaSourceLabel = (idea: ResearchIdea) => idea.source.paperTitle === undefined
  ? plainTitle(idea.source.chatTitle)
  : `${plainTitle(idea.source.paperTitle)} · ${plainTitle(idea.source.chatTitle)}`

/**
 * Where an idea came from, as ideaSourceLabel says it, its titles as paper text; `message` places it
 * in its words.
 */
export function IdeaSource({ idea, message = (source) => source }: {
  idea: ResearchIdea
  message?: (source: string) => string
}) {
  const [before, after] = message(SLOT).split(SLOT)
  return (
    <>
      {before}
      {idea.source.paperTitle === undefined ? null : <><PaperText text={idea.source.paperTitle} /> · </>}
      <PaperText text={idea.source.chatTitle} />
      {after}
    </>
  )
}

/**
 * The one detail panel of an idea, on the Ideas screen and on the project page: the title with the
 * host's `actions` and the close button, the kind and archived tags, the content, the host's own
 * sections (`children`), then the source and the last update. `editor`, when given, takes the
 * content's place. `onOpenSourceChat` adds, to the source heading, the button that opens the
 * conversation the idea came from.
 */
export function IdeaPanel({ idea, actions, editor, onClose, onOpenSourceChat, children }: {
  idea: ResearchIdea
  actions?: ReactNode
  editor?: ReactNode
  onClose: () => void
  onOpenSourceChat?: (chatId: string) => void
  children?: ReactNode
}) {
  const fmt = useFormat()
  const m = useMessages()
  const chatId = idea.source.chatId
  return (
    <>
      <SectionHeading
        variant="rail" className="idea-panel-head node-document-head"
        actions={<>{actions}<PanelClose onClose={onClose} /></>}
      ><span className="node-document-title">{idea.title}</span>
      </SectionHeading>
      <div className="idea-panel-meta">
        <Tag tone="accent">{m.project.idea.kind}</Tag>
        {idea.archived ? <Tag>{m.common.archived}</Tag> : null}
      </div>
      {editor ?? (
        <>
          <SectionHeading variant="rail">{m.project.sections.content}</SectionHeading>
          <p className="idea-panel-body">{idea.body}</p>
        </>
      )}
      {children}
      <SectionHeading
        variant="rail"
        actions={onOpenSourceChat === undefined || chatId === undefined
          ? undefined
          : <button className="btn sm idea-panel-open-chat" onClick={() => onOpenSourceChat(chatId)}>{m.ideas.openSourceChat}</button>}
      >{m.project.sections.source}
      </SectionHeading>
      <p className="idea-panel-source"><IdeaSource idea={idea} /></p>
      <div className="idea-panel-updated">{m.common.updatedOn(fmt.date(idea.updated))}</div>
    </>
  )
}
