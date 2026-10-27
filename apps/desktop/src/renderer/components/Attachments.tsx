import { useRef, useState } from 'react'
import type { Attachment } from '../../shared/contract.js'
import { useMessages } from '../messages/useMessages.js'
import { AddAction } from './AddAction.js'
import { EmptyState } from './EmptyState.js'
import { FadeText } from './FadeText.js'
import { FormInput } from './FormControls.js'
import { IconButton } from './IconButton.js'
import { IconTrash } from './icons.js'
import { Item, ItemOpen } from './Item.js'
import { List } from './List.js'
import { SectionHeading } from './PageShell.js'
import { Tag } from './Tag.js'
import './Attachments.css'

const CLIP_PATH = 'M21.4 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48'

/**
 * The attachments section of a project or an idea: its heading with the add action, which picks
 * local files, a drop target for files, and the list of `attachments`. A click on a name reveals the
 * file through `onReveal`; the trash button removes it through `onRemove` with its id. Persistence
 * stays with the host: `onAdd` receives the picked or dropped files.
 */
export function Attachments({ attachments, onAdd, onReveal, onRemove }: {
  attachments: Attachment[]
  onAdd: (files: File[]) => void
  onReveal: (path: string) => void
  onRemove: (attachmentId: string) => void
}) {
  const m = useMessages()
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <SectionHeading
        level="group"
        actions={(
          <AddAction size="compact" label={m.common.attachments.addTitle} onClick={() => input.current?.click()}>
            {m.common.attachments.heading}
          </AddAction>
        )}
      >{m.common.attachments.heading}
      </SectionHeading>
      <div
        className={over ? 'attachments drag' : 'attachments'}
        onDragOver={(event) => { event.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault(); setOver(false)
          const dropped = [...event.dataTransfer.files]
          if (dropped.length) onAdd(dropped)
        }}
      >
        <FormInput
          ref={input} type="file" multiple hidden
          onChange={(event) => {
            const picked = [...(event.target.files ?? [])]
            event.target.value = ''
            if (picked.length) onAdd(picked)
          }}
        />
        {attachments.length === 0 ? <EmptyState variant="section" /> : null}
        {attachments.length === 0
          ? null
          : (
            <List className="attachment-list" variant="embedded">
              {attachments.map((attachment) => (
                <Item
                  className="attrow" key={attachment.id}
                  {...(attachment.path === undefined ? {} : { composite: true, onActivate: () => onReveal(attachment.path!) })}
                  leading={(
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d={CLIP_PATH} />
                    </svg>
                  )}
                  title={(
                    <>
                      <ItemOpen className="an" disabled={attachment.path === undefined}><FadeText>{attachment.name}</FadeText></ItemOpen>
                      {attachment.path === undefined ? <Tag>{m.common.attachments.noPath}</Tag> : null}
                    </>
                  )}
                  trailing={<span className="as">{attachment.size}</span>}
                  actions={(
                    <IconButton
                      label={m.common.attachments.delete} size="nested" tone="danger" className="ax"
                      onClick={(event) => { event.stopPropagation(); onRemove(attachment.id) }}
                    ><IconTrash /></IconButton>
                  )}
                />
              ))}
            </List>
          )}
      </div>
    </>
  )
}
