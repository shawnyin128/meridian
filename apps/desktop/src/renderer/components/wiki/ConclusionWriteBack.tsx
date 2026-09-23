import { useCallback, useEffect, useRef, useState } from 'react'
import type { Conclusion, WikiAggregationCard } from '../../../shared/contract.js'
import { useVaultWrite } from '../../hooks/useVaultWrite.js'
import { wiki } from '../../ipc.js'
import { claimId } from '../../lib/slug.js'
import { useMessages } from '../../messages/useMessages.js'
import { useToast } from '../../shell/AppShell.js'
import { FormTextarea } from '../FormControls.js'
import { PickRow, type PickHit } from '../PickRow.js'
import { WikiFormDialog, WikiFormField } from './WikiFormDialog.js'

/**
 * Writes a verified project conclusion into the Wiki as a claim: the user picks an aggregation page and
 * may edit the conclusion's text before it becomes the claim's text; the claim's evidence is the
 * conclusion itself. Opens while `conclusion` is not null and closes through `onClose`.
 */
export function ConclusionWriteBack({ project, conclusion, onClose }: {
  project: { id: string; name: string }
  conclusion: Conclusion | null
  onClose: () => void
}) {
  const m = useMessages()
  const f = m.wiki.claims.form
  const write = useVaultWrite()
  const toast = useToast()
  const [page, setPage] = useState<WikiAggregationCard | null>(null)
  const [text, setText] = useState('')
  const row = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setPage(null)
    setText(conclusion?.text ?? '')
  }, [conclusion])

  const suggest = useCallback(async (query: string): Promise<PickHit[]> => {
    const q = query.toLowerCase()
    return (await wiki.cards())
      .filter((card) => q === '' || card.title.toLowerCase().includes(q))
      .map((card) => ({ id: card.id, title: card.title, meta: card.kindLabel }))
  }, [])

  const pick = async (hit: PickHit): Promise<boolean> => {
    const card = (await wiki.cards()).find((c) => c.id === hit.id)
    if (card === undefined) return false
    setPage(card)
    return true
  }

  const submit = async (): Promise<boolean> => {
    if (conclusion === null || page === null || text.trim() === '') return false
    const held = await wiki.aggregation(page.id)
    const id = claimId(text.trim(), held.claims.map((c) => c.id))
    return write(wiki.apply({
      source: 'user',
      title: m.wiki.claims.proposals.writeBack(project.name, page.title),
      ops: [{
        op: 'addClaim', page: page.id,
        claim: { id, text: text.trim(), evidence: [{ kind: 'experiment', project: project.id, conclusion: conclusion.id }] },
      }],
    }), { note: m.wiki.claims.saved })
  }

  return (
    <WikiFormDialog
      open={conclusion !== null} title={f.writeBackTitle} canSubmit={page !== null && text.trim() !== ''}
      onOpenChange={(next) => { if (!next) onClose() }} onSubmit={submit}
    >
      <WikiFormField label={f.page}>
        {page === null
          ? (
            <div ref={row} className="wiki-form-pick">
              <PickRow
                row={row} triggers={[]} allowNew={false} inputAppearance="field" inputClassName="pickin"
                placeholder={f.pagePlaceholder} suggest={suggest} onPick={pick} onNew={() => false}
                onCancel={() => {}} onError={(e) => toast(e.message)}
              />
            </div>
          )
          : (
            <button type="button" className="tagchip wiki-form-picked" onClick={() => setPage(null)}>
              {page.kindLabel} · {page.title}
            </button>
          )}
      </WikiFormField>
      <WikiFormField label={f.text}>
        <FormTextarea appearance="field" value={text} placeholder={f.textPlaceholder} onChange={(e) => setText(e.target.value)} />
      </WikiFormField>
    </WikiFormDialog>
  )
}
