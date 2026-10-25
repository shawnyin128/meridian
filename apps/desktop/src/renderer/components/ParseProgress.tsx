import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { MetadataJob } from '../../shared/contract.js'
import { papers } from '../ipc.js'
import { errorLabel } from '../lib/failure-label.js'
import { useMessages } from '../messages/useMessages.js'
import { useNotice } from '../shell/AppShell.js'
import { useJobs } from '../shell/useJobs.js'
import { IconButton } from './IconButton.js'
import { IconCross } from './icons.js'
import { ProgressFill } from './ProgressFill.js'
import { Card } from './Card.js'
import { Button } from './Button.js'
import './ParseProgress.css'

const PROGRESS: Record<MetadataJob['step'], number> = {
  read: 10, detect: 30, lookup: 65, write: 90, done: 100, failed: 100,
}

/**
 * Shows one quiet aggregate progress bar; implementation steps and network errors stay internal. The
 * card of the uploads whose metadata is still missing retries those whose lookup failed, and hands the
 * first of them to `onOpenPaper` to fill in by hand; either takes those uploads off the card.
 */
export function ParseProgress({ onParsed, onOpenPaper }: {
  onParsed: (job: MetadataJob) => void
  onOpenPaper: (paperId: string) => void
}) {
  const m = useMessages()
  const status = useJobs()
  const notice = useNotice()
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set())
  const reported = useRef(new Set<string>())

  useEffect(() => {
    for (const job of status?.uploads ?? []) {
      if (job.step !== 'done' && job.step !== 'failed') continue
      if (reported.current.has(job.id)) continue
      reported.current.add(job.id)
      if (job.step === 'done' && job.found !== 'none') {
        onParsed(job)
        notice.success(m.papers.parse.addedFixable)
      }
    }
  }, [status, notice, onParsed, m])

  const uploads = status?.uploads ?? []
  const shown = uploads.filter((job) => !closed.has(job.id))
  const active = shown.filter((job) => job.step !== 'done' && job.step !== 'failed')
  const failed = shown.filter((job) => job.step === 'failed' || (job.step === 'done' && job.found === 'none'))
  const activeBatch = Math.max(0, ...active.map((job) => job.batch))
  const batchJobs = uploads.filter((job) => job.batch === activeBatch)
  const progress = active.length === 0 ? 100
    : Math.round(batchJobs.reduce((sum, job) => sum + PROGRESS[job.step], 0) / batchJobs.length)
  const retryable = failed.filter((job) => job.step === 'failed')
  const close = (jobs: MetadataJob[]) => setClosed((held) => new Set([...held, ...jobs.map((job) => job.id)]))
  const retry = () => {
    close(retryable)
    for (const job of retryable) void papers.retryMetadata(job.paperId).catch((e: unknown) => notice.refusal(errorLabel(m, e)))
  }
  if (active.length === 0 && failed.length === 0) return null
  return createPortal(
    <aside className="parse-float" aria-label={m.papers.parse.statusAria}>
      {active.length > 0 ? (
        <Card floating className="upcard compact progress-host" role="status">
          <ProgressFill percent={progress} label={m.papers.parse.progressAria} />
          <div className="upt">
            <span>{m.papers.parse.working}</span>
            <span className="upcount">{m.papers.parse.count(active.length)}</span>
          </div>
        </Card>
      ) : null}
      {failed.length > 0 ? (
        <Card floating className="upcard compact quiet" role="status">
          <div className="upt">
            <span>{m.papers.parse.needsAttention(failed.length)}</span>
            <IconButton
              label={m.papers.parse.collapse} size="nested" className="upclose"
              onClick={() => close(failed)}
            ><IconCross /></IconButton>
          </div>
          <div className="upacts">
            {retryable.length === 0 ? null : <Button size="compact" onClick={retry}>{m.common.retry}</Button>}
            <Button
              size="compact"
              onClick={() => { close([failed[0]!]); onOpenPaper(failed[0]!.paperId) }}
            >{m.papers.parse.fill}</Button>
          </div>
        </Card>
      ) : null}
    </aside>,
    document.body,
  )
}
