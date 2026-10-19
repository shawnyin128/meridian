import type { PluginVersion } from '../../../shared/contract.js'
import { useFormat } from '../../lib/format.js'
import { useMessages } from '../../messages/useMessages.js'
import { SectionHeading } from '../PageShell.js'
import { Tag } from '../Tag.js'

export interface PluginVersionEntryProps {
  plugin: PluginVersion
  checking: boolean
  onCheck: () => void
}

/** Local calendar day of an ISO time, as YYYY-MM-DD. */
function localDay(iso: string): string {
  const at = new Date(iso)
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`
}

/** The plugin row heading the extension list: the newest plugin version, which the skills and MCP share, and a check for a newer one. */
export function PluginVersionEntry({ plugin, checking, onCheck }: PluginVersionEntryProps) {
  const copy = useMessages().settings.extensions.plugin
  const fmt = useFormat()
  const checked = plugin.checkedAt === null ? copy.neverChecked : copy.checkedAt(fmt.date(localDay(plugin.checkedAt)))
  return (
    <section className="extension-entry" data-plugin-version={plugin.version}>
      <div className="extension-head">
        <div>
          <SectionHeading variant="group">{copy.name}</SectionHeading>
          <p>{copy.description} · {checked}</p>
        </div>
        <div className="extension-head-side">
          <Tag className="extension-state">{copy.latest(plugin.version)}</Tag>
          <button className="btn" disabled={checking} onClick={onCheck}>{checking ? copy.checking : copy.check}</button>
        </div>
      </div>
    </section>
  )
}
