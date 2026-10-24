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

/**
 * The titles that say where an idea came from, in order: the project named `sourceProject` it was
 * sparked in, the paper it was about, then the conversation, left out when it repeats one of those or
 * the idea is the user's own.
 */
function sourceParts(idea: ResearchIdea, sourceProject: string | undefined): string[] {
  const { chatTitle, paperTitle } = idea.source
  const lead = [sourceProject, paperTitle].filter((part) => part !== undefined)
  return ownIdea(idea) || lead.includes(chatTitle) ? lead : [...lead, chatTitle]
}

/** Where an idea came from, as plain text for a tooltip, in the order sourceParts gives. */
export const ideaSourceLabel = (idea: ResearchIdea, sourceProject?: string) =>
  sourceParts(idea, sourceProject).map(plainTitle).join(' · ')

/**
 * Where an idea came from, as ideaSourceLabel says it, its titles as paper text; `message` places it
 * in its words. With `onOpenPaper`, the paper it came from is a link that opens that paper.
 */
export function IdeaSource({ idea, sourceProject, message = (source) => source, onOpenPaper }: {
  idea: ResearchIdea
  sourceProject?: string | undefined
  message?: (source: string) => string
  onOpenPaper?: ((paperId: string) => void) | undefined
}) {
  const [before, after] = message(SLOT).split(SLOT)
  const { paperId, paperTitle } = idea.source
  return (
    <>
      {before}
      {sourceParts(idea, sourceProject).map((part, at) => (
        <span key={at}>
          {at === 0 ? null : ' · '}
          {part !== paperTitle || onOpenPaper === undefined || paperId === undefined
            ? <PaperText text={part} />
            : <EntityLink kind="paper" label={<PaperText text={part} />} href={`#${ENTITY_SCREEN.paper}:${paperId}`} onOpen={() => onOpenPaper(paperId)} />}
        </span>
      ))}
      {after}
    </>
  )
}

/** The neutral tag that follows an idea's source wherever it shows, once the chat the idea came from is deleted. */
export function SourceChatDeleted({ className }: { className?: string }) {
  const m = useMessages()
  return <Tag className={className}>{m.ideas.sourceChatDeleted}</Tag>
}

/**
 * The one detail panel of an idea, on the Ideas screen and on the project page: the title with the
 * host's `actions` and the close button, the kind and archived tags with the created date and,
 * when it differs, the updated date, the content, the host's own sections (`children`), then the
 * source, which an idea the user wrote down on their own does not have. `editor`, when given, takes
 * the content's place.
 * `onOpenSourceChat` adds, to the source heading, the button that opens the conversation the idea
 * came from; `sourceChatDeleted` says that conversation is deleted, so there is no such button and the
 * source ends with a tag saying so. `onOpenSourcePaper` makes the paper it came from a link.
 */
export function IdeaPanel({
  idea, sourceProject, actions, editor, onClose, onOpenSourceChat, sourceChatDeleted = false, onOpenSourcePaper, children,
}: {
  idea: ResearchIdea
  /** The name of the project the idea was sparked in; when given, it leads the source, which then shows for the user's own idea too. */
  sourceProject?: string | undefined
  actions?: ReactNode
  editor?: ReactNode
  onClose: () => void
  onOpenSourceChat?: (chatId: string) => void
  sourceChatDeleted?: boolean
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
        <span className="idea-panel-dates">
          {m.common.createdOn(fmt.date(idea.created))}
          {idea.updated === idea.created ? null : ` · ${m.common.updatedOn(fmt.date(idea.updated))}`}
        </span>
      </div>
      {editor ?? (
        <>
          <SectionHeading variant="rail">{m.project.sections.content}</SectionHeading>
          <p className="idea-panel-body">{idea.body}</p>
        </>
      )}
      {children}
      {ownIdea(idea) && sourceProject === undefined ? null : (
        <>
          <SectionHeading
            variant="rail"
            actions={onOpenSourceChat === undefined || chatId === undefined || sourceChatDeleted
              ? undefined
              : <button className="btn sm idea-panel-open-chat" onClick={() => onOpenSourceChat(chatId)}>{m.ideas.openSourceChat}</button>}
          >{m.project.sections.source}
          </SectionHeading>
          <p className="idea-panel-source">
            <IdeaSource idea={idea} sourceProject={sourceProject} onOpenPaper={onOpenSourcePaper} />
            {sourceChatDeleted ? <SourceChatDeleted className="idea-panel-source-gone" /> : null}
          </p>
        </>
      )}
    </>
  )
}
