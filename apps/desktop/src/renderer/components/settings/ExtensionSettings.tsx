import { useEffect, useState } from 'react'
import type { ExtensionStatus } from '../../../shared/contract.js'
import { useMessages } from '../../messages/useMessages.js'
import { SectionHeading } from '../PageShell.js'
import { LoadingPlaceholder } from '../LoadingPlaceholder.js'
import { Tag, type TagState } from '../Tag.js'
import { Card } from '../Card.js'
import { PluginVersionEntry, type PluginVersionEntryProps } from './PluginVersionEntry.js'
import { FadeText } from '../FadeText.js'
import { CommandTray } from '../CommandTray.js'
import { Button, DONE_MS } from '../Button.js'
import { Item } from '../Item.js'
import { List } from '../List.js'
import './ExtensionSettings.css'

const STATE: Record<ExtensionStatus['state'], TagState | undefined> = {
  installed: 'done', 'update-required': 'warning', 'not-installed': undefined,
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
 * prompts, one row each, that copies its prompt on click. A copy turns its button into the check for
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
              <SectionHeading
                level="group"
                actions={(
                  <Tag state={STATE[extension.state]} className="extension-state">
                    {m.settings.extensions.state[extension.state]}
                    {extension.version === undefined ? '' : ` · ${extension.version}`}
                  </Tag>
                )}
              >{extension.name}
              </SectionHeading>
              <CommandTray heading={commandHeading} command={command} copyLabel={copyLabel} onCopy={onCopy} />
            </section>
          )
        })}
      </Card>

      <Card as="section" className="extension-tutorial" data-extension-tutorial="">
        <SectionHeading level="group">{m.settings.extensions.tutorial.heading}</SectionHeading>
        <div className="extension-prompt-groups">
          {m.settings.extensions.tutorial.groups.map((group) => (
            <section className="extension-prompt-group" key={group.heading}>
              <SectionHeading level="group">{group.heading}</SectionHeading>
              <List variant="embedded" rows="all" nested className="extension-prompt-list">
                {group.examples.map((example) => (
                  <Item
                    composite className="extension-prompt" key={example.label} title={example.label}
                    meta={<FadeText label={example.prompt}>{example.prompt}</FadeText>}
                    onActivate={() => copy(example.label, example.prompt)}
                    trailing={(
                      <Button
                        size="compact" variant="ghost" aria-label={m.settings.extensions.tutorial.copyPromptLabel(example.label)}
                        done={copied === example.label} doneLabel={m.common.copied}
                      >{m.common.copy}</Button>
                    )}
                  />
                ))}
              </List>
            </section>
          ))}
        </div>
      </Card>
    </>
  )
}
