import { useEffect, useState } from 'react'
import type { ChatIdeaPreview, IdeaDraft } from '../../../shared/contract.js'
import { useVaultWrite } from '../../hooks/useVaultWrite.js'
import { chat as chatApi } from '../../ipc.js'
import { useMessages } from '../../messages/useMessages.js'
import { useJump, useVaultRevision } from '../../shell/AppShell.js'
import { EntityLink } from '../EntityLink.js'
import { InlineMetadataField } from '../InlineField.js'
import { Property, PropertyList } from '../PropertyList.js'
import { WritesSection } from './WritesSection.js'

/** The longest title and body an idea draft takes, as Core bounds them. */
const TITLE_CHARACTERS = 80
const BODY_CHARACTERS = 4_000

/** `text` one line per row, as it reads at rest. */
const lines = (text: string) => text.split('\n').map((line, at) => <div key={at}>{line}</div>)

/** Keeps `value` trimmed through `set` when it is not empty and within `limit` characters; returns whether it did. */
function accept(value: string, limit: number, set: (next: string) => void): boolean {
  const next = value.trim()
  if (next === '' || next.length > limit) return false
  set(next)
  return true
}

/**
 * The idea draft answer `messageId` of chat `chat` carries, under the answer's text: the section of
 * what saving it writes, folded until opened, which shows the idea it saves, its title and body
 * editable in place until it is saved, the project it relates to, and the chat and rounds it came
 * from, and confirms it with the fingerprint of what it shows. A saved draft names its idea instead, as a link.
 */
export function IdeaCard({ chat, messageId, idea }: { chat: string; messageId: string; idea: IdeaDraft }) {
  const m = useMessages()
  const d = m.chat.design
  const { open } = useJump()
  const { revision } = useVaultRevision()
  const write = useVaultWrite()
  const [unfolded, setUnfolded] = useState(false)
  const [title, setTitle] = useState(idea.title)
  const [body, setBody] = useState(idea.body)
  const [preview, setPreview] = useState<ChatIdeaPreview | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let live = true
    void chatApi.ideaPreview(chat, messageId, title, body).then((next) => { if (live) setPreview(next) })
    return () => { live = false }
  }, [chat, messageId, title, body, revision])

  if (preview === null) return null
  const saved = preview.saved
  const confirm = () => {
    setSaving(true)
    void write(chatApi.saveIdea(chat, messageId, title, body, preview.fingerprint), {
      note: m.chat.ideaSavedNote,
      action: (created) => ({ label: m.common.open, onAction: () => open('ideas', created.id) }),
    }).finally(() => setSaving(false))
  }
  const rounds = preview.rounds.join(m.chat.ideaMode.roundSeparator)
  return (
    <WritesSection open={unfolded} onOpenChange={setUnfolded} saved={saved !== null} saving={saving} onConfirm={confirm}>
      <PropertyList>
        <Property label={d.idea}>
          {saved !== null ? <EntityLink kind="idea" label={preview.idea.title} href={`#ideas:${saved}`} onOpen={() => open('ideas', saved)} /> : (
            <InlineMetadataField
              label={d.idea} value={title} keep={{ scope: ['chat', chat, messageId], target: 'idea-title' }}
              onSave={(next) => !next.trim().includes('\n') && accept(next, TITLE_CHARACTERS, setTitle)}
            />
          )}
        </Property>
        <Property label={d.body}>
          {saved !== null ? lines(preview.idea.body) : (
            <InlineMetadataField
              label={d.body} value={body} display={lines(body)} keep={{ scope: ['chat', chat, messageId], target: 'idea-body' }}
              onSave={(next) => accept(next, BODY_CHARACTERS, setBody)}
            />
          )}
        </Property>
        {preview.idea.project === null ? null : <Property label={d.project}>{preview.idea.project.name}</Property>}
        <Property label={m.chat.ideaMode.source}>
          <div>{preview.chat}</div>
          <div>{m.chat.ideaMode.rounds(rounds)}</div>
        </Property>
      </PropertyList>
    </WritesSection>
  )
}
