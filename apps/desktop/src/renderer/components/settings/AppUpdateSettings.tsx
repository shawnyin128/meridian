import type { AppUpdateStatus } from '../../../shared/app-update.js'
import { useFormat } from '../../lib/format.js'
import type { Catalog } from '../../messages/catalog.js'
import { useMessages } from '../../messages/useMessages.js'

export interface AppUpdateEntryProps {
  status: AppUpdateStatus
  onCheck: () => void
  onInstall: () => void
  onDownload: (url: string) => void
}

/** Local calendar day of an ISO time, as YYYY-MM-DD. */
function localDay(iso: string): string {
  const at = new Date(iso)
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`
}

/** One sentence stating where the app's self-update stands. */
export function updateLine(status: AppUpdateStatus, m: Catalog): string {
  const phase = m.settings.extensions.app.phase
  switch (status.phase) {
    case 'unsupported': return phase.unsupported
    case 'idle': return phase.idle
    case 'checking': return phase.checking
    case 'latest': return phase.latest
    case 'downloading': return phase.downloading(status.version, status.percent)
    case 'ready': return phase.ready(status.version)
    case 'available': return phase.available(status.version)
    case 'error': return phase.error(status.message)
  }
}

/** The single update action the status allows: relaunch into a downloaded version, open its download page, or check. */
export function UpdateAction({ status, onCheck, onInstall, onDownload }: AppUpdateEntryProps) {
  const copy = useMessages().settings.extensions.app
  if (status.phase === 'ready') return <button className="btn pri" onClick={onInstall}>{copy.restart}</button>
  if (status.phase === 'available') {
    return <button className="btn pri" onClick={() => onDownload(status.url)}>{copy.download}</button>
  }
  const label = status.phase === 'checking' ? copy.checking
    : status.phase === 'downloading' ? copy.downloading : copy.check
  return (
    <button
      className="btn" onClick={onCheck}
      disabled={status.phase === 'unsupported' || status.phase === 'checking' || status.phase === 'downloading'}
    >{label}</button>
  )
}

/** The update line with the day of the last finished check appended. */
export function useUpdateSummary(status: AppUpdateStatus): string {
  const m = useMessages()
  const fmt = useFormat()
  const checked = status.checkedAt === undefined
    ? '' : ` · ${m.settings.extensions.app.checkedAt(fmt.date(localDay(status.checkedAt)))}`
  return `${updateLine(status, m)}${checked}`
}

/** The app's row in the extension list: its version, self-update state, and the one action that state allows. */
export function AppUpdateEntry(props: AppUpdateEntryProps) {
  const copy = useMessages().settings.extensions.app
  const summary = useUpdateSummary(props.status)
  return (
    <section className="extension-entry" data-app-update={props.status.phase}>
      <div className="extension-head">
        <div>
          <h3>{copy.name}</h3>
          <p>{summary}</p>
        </div>
        <div className="extension-head-side">
          <span className="extension-state">{copy.version(props.status.current)}</span>
          <UpdateAction {...props} />
        </div>
      </div>
    </section>
  )
}
