import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Attachment, IdeaFile } from '../../shared/contract.js'
import { attachmentSizeText } from '../../shared/attachment-size.js'
import type { Attachments } from '../components/Attachments.js'
import { files, idea as ideaApi } from '../ipc.js'
import { useMessages } from '../messages/useMessages.js'
import { useNotice, useVaultRevision } from '../shell/AppShell.js'
import type { ScreenLoad } from './useScreenLoad.js'
import { useUndo } from './useUndo.js'
import { useVaultWrite } from './useVaultWrite.js'

/** What the Attachments section of one idea, or a project's, needs besides its list. */
type AttachmentHandlers = Omit<Parameters<typeof Attachments>[0], 'attachments'>

/**
 * The files of every idea, read through the screen's `load` on every vault revision, and the writes
 * on them: `of` lists an idea's files, `ideaOf` names the idea a file belongs to, `local` keeps the
 * dropped or picked files that come from this computer and refuses the rest with a notice, `reveal`
 * shows a file in the system file manager or says it is gone, and `section` gives the Attachments
 * section of an idea: adding writes each local file in turn, removing sends one to the trash with
 * Undo in its notice.
 */
export function useIdeaFiles(load: ScreenLoad['load']) {
  const m = useMessages()
  const notice = useNotice()
  const write = useVaultWrite()
  const undo = useUndo()
  const { revision } = useVaultRevision()
  const [held, setHeld] = useState<IdeaFile[]>([])
  useEffect(() => load('idea-files', ideaApi.files(), setHeld), [load, revision])

  const local = useCallback((dropped: File[]): File[] => {
    const kept = dropped.filter((file) => files.pathOf(file) !== '')
    if (kept.length < dropped.length) notice.refusal(m.common.attachments.localOnly)
    return kept
  }, [m, notice])
  const reveal = useCallback((path: string) => {
    void files.reveal(path).then((found) => {
      if (!found) notice.refusal(m.common.attachments.missing)
    })
  }, [m, notice])
  const remove = useCallback((ideaId: string, fileId: string) => {
    void write(ideaApi.deleteFile(ideaId, fileId), { note: m.common.trashed, action: (trashed) => undo.restore([trashed]) })
  }, [m, undo, write])

  return useMemo(() => {
    const of = (ideaId: string): Attachment[] => held.filter((file) => file.idea === ideaId).map((file) => file.attachment)
    return {
      of,
      ideaOf: (fileId: string): string | undefined => held.find((file) => file.attachment.id === fileId)?.idea,
      local,
      reveal,
      remove,
      section: (ideaId: string): AttachmentHandlers & { attachments: Attachment[] } => ({
        attachments: of(ideaId),
        onReveal: reveal,
        onRemove: (fileId) => remove(ideaId, fileId),
        onAdd: (dropped) => {
          const chosen = local(dropped)
          if (chosen.length === 0) return
          let chain: Promise<unknown> = Promise.resolve()
          for (const file of chosen) {
            chain = chain.then(() => ideaApi.addFile(ideaId, {
              name: file.name, size: attachmentSizeText(file.size), path: files.pathOf(file),
            }))
          }
          void write(chain)
        },
      }),
    }
  }, [held, local, reveal, remove, write])
}
