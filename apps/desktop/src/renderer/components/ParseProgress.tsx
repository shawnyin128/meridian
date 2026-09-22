import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { MetadataJob } from '../../shared/contract.js'
import { useMessages } from '../messages/useMessages.js'
import { useBanner } from '../shell/AppShell.js'
import { useJobs } from '../shell/useJobs.js'
import { IconCross } from './icons.js'
import './ParseProgress.css'

const PROGRESS: Record<MetadataJob['step'], number> = {
  read: 10, detect: 30, lookup: 65, write: 90, done: 100, failed: 100,
}

/** Shows one quiet aggregate progress bar; implementation steps and network errors stay internal. */
export function ParseProgress({ onParsed }: { onParsed: (job: MetadataJob) => void }) {
  const m = useMessages()
  const status = useJobs()
  const banner = useBanner()
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set())
  const reported = useRef(new Set<string>())

  useEffect(() => {
    for (const job of status?.uploads ?? []) {
      if (job.step !== 'done' && job.step !== 'failed') continue
      if (reported.current.has(job.id)) continue
      reported.current.add(job.id)
      if (job.step === 'done' && job.found !== 'none') {
        onParsed(job)
        banner(m.papers.parse.addedFixable)
      }
    }
  }, [status, banner, onParsed, m])

  const uploads = status?.uploads ?? []
  const shown = uploads.filter((job) => !closed.has(job.id))
  const active = shown.filter((job) => job.step !== 'done' && job.step !== 'failed')
  const failed = shown.filter((job) => job.step === 'failed' || (job.step === 'done' && job.found === 'none'))
  const activeBatch = Math.max(0, ...active.map((job) => job.batch))
  const batchJobs = uploads.filter((job) => job.batch === activeBatch)
  const progress = active.length === 0 ? 100
    : Math.round(batchJobs.reduce((sum, job) => sum + PROGRESS[job.step], 0) / batchJobs.length)
  if (active.length === 0 && failed.length === 0) return null
  return createPortal(
    <aside className="parse-float" aria-label={m.papers.parse.statusAria}>
      {active.length > 0 ? (
        <div className="upcard compact progress-fill" role="status">
          <div
            className="upprogress" aria-label={m.papers.parse.progressAria}
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} role="progressbar"
          >
            <span style={{ width: `${progress}%` }} />
          </div>
          <div className="upt">
            <span>{m.papers.parse.working}</span>
            <span className="upcount">{m.papers.parse.count(active.length)}</span>
          </div>
        </div>
      ) : null}
      {failed.length > 0 ? (
        <div className="upcard compact quiet" role="status">
          <div className="upt">
            <span>{m.papers.parse.needsAttention(failed.length)}</span>
            <button
              className="upclose" title={m.papers.parse.collapse}
              onClick={() => setClosed((held) => new Set([...held, ...failed.map((job) => job.id)]))}
            ><IconCross /></button>
          </div>
        </div>
      ) : null}
    </aside>,
    document.body,
  )
}
