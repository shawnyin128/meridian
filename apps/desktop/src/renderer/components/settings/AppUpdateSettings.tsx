import type { AppUpdateStatus } from '../../../shared/app-update.js'
import type { Catalog } from '../../messages/catalog.js'
import { useMessages } from '../../messages/useMessages.js'

export interface UpdateActionProps {
  status: AppUpdateStatus
  onCheck: () => void
  onInstall: () => void
  onDownload: (url: string) => void
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
export function UpdateAction({ status, onCheck, onInstall, onDownload }: UpdateActionProps) {
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
