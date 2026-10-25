import { useEffect, useState } from 'react'
import type { ExtensionStatus } from '../../../shared/contract.js'
import { useMessages } from '../../messages/useMessages.js'
import { CardTray } from '../CardTray.js'
import { SectionHeading } from '../PageShell.js'
import { LoadingPlaceholder } from '../LoadingPlaceholder.js'
import { Tag, type TagTone } from '../Tag.js'
import { Card } from '../Card.js'
import { PluginVersionEntry, type PluginVersionEntryProps } from './PluginVersionEntry.js'
import { FadeText } from '../FadeText.js'
import { Button, DONE_MS } from '../Button.js'
import './ExtensionSettings.css'

const STATE_TONE: Record<ExtensionStatus['state'], TagTone> = {
  installed: 'good', 'update-required': 'warn', 'not-installed': 'neutral',
}

interface ExtensionSettingsProps {
  /** The extensions Core found, or null until they are read: a loading placeholder, or nothing once `failed`. */
  statuses: ExtensionStatus[] | null
  failed: boolean
  /** The plugin version row listed first, since both clients install that version; omitted until known. */
  plugin?: PluginVersionEntryProps | undefined
  /** Copies `text`; resolves true once it is on the clipboard, false when it could not be copied. */
  onCopy: (text: string) => Promise<boolean>
}

/**
 * Installed coding-agent extensions and the explicit commands that manage them, then the agent
 * prompts, one line each, with a button that copies it. A copy turns its button into the check for
 * DONE_MS.
 */
export function ExtensionSettings({ statuses, failed, plugin, onCopy }: ExtensionSettingsProps) {
  const m = useMessages()
  const [copied, setCopied] = useState<string | null>(null)
  useEffect(() => {
    if (copied === null) return
    const timer = window.setTimeout(() => setCopied(null), DONE_MS)
    return () => window.clearTimeout(timer)
  }, [copied])
  const copy = (key: string, text: string) => { void onCopy(text).then((done) => { if (done) setCopied(key) }) }
  if (statuses === null) {
    return failed ? null : <LoadingPlaceholder shape="cards" count={1} />
  }

  return (
    <>
      <Card className="extension-settings-card">
        {plugin === undefined ? null : <PluginVersionEntry {...plugin} />}
        {statuses.map((extension) => {
          // An installed extension, current or not, is kept up to date rather than installed again.
          const updating = extension.state !== 'not-installed'
          const command = updating ? extension.updateCommand : extension.installCommand
          const commandHeading = updating
            ? m.settings.extensions.updateCommand : m.settings.extensions.installCommand
          const copyLabel = updating
            ? m.settings.extensions.copyUpdateLabel(extension.name)
            : m.settings.extensions.copyInstallLabel(extension.name)
          return (
            <section className="extension-entry" key={extension.id} data-extension={extension.id}>
              <div className="extension-head">
                <SectionHeading variant="group">{extension.name}</SectionHeading>
                <Tag tone={STATE_TONE[extension.state]} className="extension-state">
                  {m.settings.extensions.state[extension.state]}
                  {extension.version === undefined ? '' : ` · ${extension.version}`}
                </Tag>
              </div>
              <CardTray
                className="extension-command"
                expandLabel={m.common.details.expand} collapseLabel={m.common.details.collapse}
                summary={(
                  <span className="extension-command-summary">
                    <span>{commandHeading}</span>
                    <FadeText><code>{command}</code></FadeText>
                  </span>
                )}
                action={(
                  <Button
                    size="compact" variant="ghost" aria-label={copyLabel}
                    done={copied === extension.id} doneLabel={m.common.copied}
                    onClick={() => copy(extension.id, command)}
                  >{m.settings.extensions.copy}</Button>
                )}
              >
                <pre className="extension-command-code"><code>{command}</code></pre>
              </CardTray>
            </section>
          )
        })}
      </Card>

      <Card as="section" className="extension-tutorial" data-extension-tutorial="">
        <SectionHeading variant="group">{m.settings.extensions.tutorial.heading}</SectionHeading>
        <div className="extension-prompt-groups">
          {m.settings.extensions.tutorial.groups.map((group) => (
            <section className="extension-prompt-group" key={group.heading}>
              <h5>{group.heading}</h5>
              {group.examples.map((example) => (
                <div className="extension-prompt" key={example.label}>
                  <strong>{example.label}</strong>
                  <p><FadeText label={example.prompt}>{example.prompt}</FadeText></p>
                  <Button
                    size="compact" variant="ghost" aria-label={m.settings.extensions.tutorial.copyPromptLabel(example.label)}
                    done={copied === example.label} doneLabel={m.common.copied} onClick={() => copy(example.label, example.prompt)}
                  >{m.settings.extensions.copy}</Button>
                </div>
              ))}
            </section>
          ))}
        </div>
      </Card>
    </>
  )
}
