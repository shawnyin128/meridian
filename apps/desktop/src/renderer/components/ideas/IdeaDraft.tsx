import { useMessages } from '../../messages/useMessages.js'
import { DraftForm } from '../DraftForm.js'
import { FadeText } from '../FadeText.js'
import { FormInput, FormTextarea } from '../FormControls.js'
import './IdeaDraft.css'

/** The title and body of an idea being drafted, as typed. */
export type IdeaDraftText = { title: string; body: string }

/**
 * The draft of an idea saved from a chat, opened at the end of the conversation: it lands among the
 * ideas, from the chat `source` names, with the title and body `draft` holds. `onSave` gets them
 * trimmed and settles once the idea is written or refused.
 */
export function IdeaDraft({ source, draft, onChange, onSave, onCancel }: {
  source: string
  draft: IdeaDraftText
  onChange: (draft: IdeaDraftText) => void
  onSave: (title: string, body: string) => Promise<unknown>
  onCancel: () => void
}) {
  const m = useMessages()
  const title = draft.title.trim()
  const body = draft.body.trim()
  const from = m.ideas.editor.sourceLabel(source)
  return (
    <DraftForm
      className="idea-draft" destination={m.shell.nav.ideas}
      canSave={title !== '' && body !== ''} onSave={() => onSave(title, body)} onCancel={onCancel}
    >
      {(invalid) => (
        <>
          <FadeText className="idea-draft-source" label={from}>{from}</FadeText>
          <FormInput
            value={draft.title} maxLength={160} aria-label={m.ideas.editor.titleLabel}
            placeholder={m.ideas.editor.titlePlaceholder} aria-invalid={invalid(title === '')}
            onChange={(event) => onChange({ ...draft, title: event.target.value })}
          />
          <FormTextarea
            value={draft.body} maxLength={20_000} aria-label={m.ideas.bodyLabel}
            placeholder={m.ideas.editor.bodyPlaceholder} aria-invalid={invalid(body === '')}
            onChange={(event) => onChange({ ...draft, body: event.target.value })}
          />
        </>
      )}
    </DraftForm>
  )
}
