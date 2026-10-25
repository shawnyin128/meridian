import type { ExtensionStatus } from '../../../shared/contract.js'
import { useMessages } from '../../messages/useMessages.js'
import { CardTray } from '../CardTray.js'
import { SectionHeading } from '../PageShell.js'
import { LoadingPlaceholder } from '../LoadingPlaceholder.js'
import { Tag, type TagTone } from '../Tag.js'
import { Card } from '../Card.js'
import { PluginVersionEntry, type PluginVersionEntryProps } from './PluginVersionEntry.js'
import { FadeText } from '../FadeText.js'
import { Button } from '../Button.js'
import { Item } from '../Item.js'
import { List } from '../List.js'
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
  onCopy: (name: string, command: string) => void
  onCopyPrompt: (prompt: string) => void
}

/** Installed coding-agent extensions and the explicit commands that manage them. */
export function ExtensionSettings({ statuses, failed, plugin, onCopy, onCopyPrompt }: ExtensionSettingsProps) {
  const m = useMessages()
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
                  <Tag tone={STATE_TONE[extension.state]} className="extension-state">
                    {m.settings.extensions.state[extension.state]}
                    {extension.version === undefined ? '' : ` · ${extension.version}`}
                  </Tag>
                )}
              >{extension.name}
              </SectionHeading>
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
                    onClick={() => onCopy(extension.name, command)}
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
        <SectionHeading level="group">{m.settings.extensions.tutorial.heading}</SectionHeading>
        <ol className="extension-tutorial-steps">
          {m.settings.extensions.tutorial.steps.map((step, index) => (
            <li key={step.title}>
              <span>{index + 1}</span>
              <strong>{step.title}</strong>
            </li>
          ))}
        </ol>

        <SectionHeading level="group">{m.settings.extensions.tutorial.examplesHeading}</SectionHeading>
        <div className="extension-prompt-groups">
          {m.settings.extensions.tutorial.groups.map((group) => (
            <section className="extension-prompt-group" key={group.heading}>
              <SectionHeading level="group">{group.heading}</SectionHeading>
              <List variant="embedded" rows="all" nested className="extension-prompt-list">
                {group.examples.map((example) => (
                  <Item
                    className="extension-prompt" key={example.label} lines={2} title={example.label} meta={example.prompt}
                    trailing={(
                      <Button size="compact" variant="ghost" onClick={() => onCopyPrompt(example.prompt)}>
                        {m.settings.extensions.tutorial.copyPrompt}
                      </Button>
                    )}
                  />
                ))}
              </List>
            </section>
          ))}
        </div>

        <SectionHeading level="group">{m.settings.extensions.tutorial.healthyHeading}</SectionHeading>
        <ul className="extension-healthy-list">
          {m.settings.extensions.tutorial.healthy.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </Card>
    </>
  )
}
