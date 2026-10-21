import type { ReactNode } from 'react'
import type { ResearchIdea } from '../../../shared/contract.js'
import { MANUAL_SOURCE } from '../../../shared/vocabulary.js'
import { useFormat } from '../../lib/format.js'
import { useMessages } from '../../messages/useMessages.js'
import { ENTITY_SCREEN, EntityLink } from '../EntityLink.js'
import { SectionHeading } from '../PageShell.js'
import { PanelClose } from '../PanelClose.js'
import { PaperText } from '../paper/PaperText.js'
import { plainTitle } from '../paper/paper-text.js'
import { SLOT } from '../TitleNote.js'
import { Tag } from '../Tag.js'
import { FadeText } from '../FadeText.js'
import './IdeaPanel.css'

/** Whether `idea` is one the user wrote down on their own, from no chat and no agent: such an idea shows no source. */
export const ownIdea = (idea: ResearchIdea): boolean =>
  idea.source.chatId === undefined && idea.source.agent !== true && idea.source.chatTitle === MANUAL_SOURCE

/** Where an idea came from, as plain text for a tooltip: the conversation, after the paper it was about when there is one. */
export const ideaSourceLabel = (idea: ResearchIdea) => idea.source.paperTitle === undefined
  ? plainTitle(idea.source.chatTitle)
  : `${plainTitle(idea.source.paperTitle)} · ${plainTitle(idea.source.chatTitle)}`

/**
 * Where an idea came from, as ideaSourceLabel says it, its titles as paper text; `message` places it
 * in its words. With `onOpenPaper`, the paper it came from is a link that opens that paper.
 */
export function IdeaSource({ idea, message = (source) => source, onOpenPaper }: {
  idea: ResearchIdea
  message?: (source: string) => string
  onOpenPaper?: ((paperId: string) => void) | undefined
}) {
  const [before, after] = message(SLOT).split(SLOT)
  const { paperId, paperTitle } = idea.source
  const paper = paperTitle === undefined ? null : <PaperText text={paperTitle} />
  return (
    <>
      {before}
      {paper === null ? null : (
        <>
          {onOpenPaper === undefined || paperId === undefined
            ? paper
            : <EntityLink kind="paper" label={paper} href={`#${ENTITY_SCREEN.paper}:${paperId}`} onOpen={() => onOpenPaper(paperId)} />}
          {' · '}
        </>
      )}
      <PaperText text={idea.source.chatTitle} />
      {after}
    </>
  )
}

/**
 * The one detail panel of an idea, on the Ideas screen and on the project page: the title with the
 * host's `actions` and the close button, the kind and archived tags, the content, the host's own
 * sections (`children`), then the source, which an idea the user wrote down on their own does not
 * have, and the last update. `editor`, when given, takes the content's place. `onOpenSourceChat`
 * adds, to the source heading, the button that opens the conversation the idea came from;
 * `onOpenSourcePaper` makes the paper it came from a link.
 */
export function IdeaPanel({ idea, actions, editor, onClose, onOpenSourceChat, onOpenSourcePaper, children }: {
  idea: ResearchIdea
  actions?: ReactNode
  editor?: ReactNode
  onClose: () => void
  onOpenSourceChat?: (chatId: string) => void
  onOpenSourcePaper?: (paperId: string) => void
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
      ><FadeText className="node-document-title" label={idea.title}>{idea.title}</FadeText>
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
      {ownIdea(idea) ? null : (
        <>
          <SectionHeading
            variant="rail"
            actions={onOpenSourceChat === undefined || chatId === undefined
              ? undefined
              : <button className="btn sm idea-panel-open-chat" onClick={() => onOpenSourceChat(chatId)}>{m.ideas.openSourceChat}</button>}
          >{m.project.sections.source}
          </SectionHeading>
          <p className="idea-panel-source"><IdeaSource idea={idea} onOpenPaper={onOpenSourcePaper} /></p>
        </>
      )}
      <div className="idea-panel-updated">{m.common.updatedOn(fmt.date(idea.updated))}</div>
    </>
  )
}
