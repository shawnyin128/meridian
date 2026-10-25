import type { AppUpdateStatus } from '../../../shared/app-update.js'
import { reasonLabel } from '../../lib/failure-label.js'
import type { Catalog } from '../../messages/catalog.js'
import { useMessages } from '../../messages/useMessages.js'
import { Button } from '../Button.js'

export interface UpdateActionProps {
  status: AppUpdateStatus
  onCheck: () => void
  onInstall: () => void
  onDownload: (url: string) => void
}

/** The short state label of where the app's self-update stands, or null while a check runs, which shows as loading. */
export function updateLine(status: AppUpdateStatus, m: Catalog): string | null {
  const phase = m.settings.extensions.app.phase
  switch (status.phase) {
    case 'unsupported': return phase.unsupported
    case 'idle': return phase.idle
    case 'checking': return null
    case 'latest': return phase.latest
    case 'downloading': return phase.downloading(status.version, status.percent)
    case 'ready': return phase.ready(status.version)
    case 'available': return phase.available(status.version)
    case 'error': return phase.error(reasonLabel(m, status.reason))
  }
}

/** The single update action the status allows: relaunch into a downloaded version, open its download page, or check. */
export function UpdateAction({ status, onCheck, onInstall, onDownload }: UpdateActionProps) {
  const copy = useMessages().settings.extensions.app
  if (status.phase === 'ready') return <Button size="regular" variant="primary" onClick={onInstall}>{copy.restart}</Button>
  if (status.phase === 'available') {
    return <Button size="regular" variant="primary" onClick={() => onDownload(status.url)}>{copy.download}</Button>
  }
  return (
    <Button
      size="regular" onClick={onCheck} disabled={status.phase === 'unsupported'}
      busy={status.phase === 'checking' || status.phase === 'downloading'}
      busyLabel={status.phase === 'downloading' ? copy.downloading : copy.checking}
    >{copy.check}</Button>
  )
}
