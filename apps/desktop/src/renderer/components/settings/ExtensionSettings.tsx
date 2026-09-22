import type { ExtensionStatus } from '../../../shared/contract.js'
import { useMessages } from '../../messages/useMessages.js'
import { CardTray } from '../CardTray.js'
import { PluginVersionEntry, type PluginVersionEntryProps } from './PluginVersionEntry.js'
import './ExtensionSettings.css'

interface ExtensionSettingsProps {
  statuses: ExtensionStatus[] | null
  /** The plugin version row listed first, since both clients install that version; omitted until known. */
  plugin?: PluginVersionEntryProps | undefined
  onCopy: (name: string, command: string) => void
  onCopyPrompt: (prompt: string) => void
}

/** Installed coding-agent extensions and the explicit commands that manage them. */
export function ExtensionSettings({ statuses, plugin, onCopy, onCopyPrompt }: ExtensionSettingsProps) {
  const m = useMessages()
  if (statuses === null) {
    return <div className="extension-settings-card extension-settings-loading">{m.settings.extensions.loading}</div>
  }

  return (
    <>
      <div className="extension-settings-card">
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
                <div>
                  <h3>{extension.name}</h3>
                  <p>{m.settings.extensions.description}</p>
                </div>
                <span className={`extension-state ${extension.state}`}>
                  {m.settings.extensions.state[extension.state]}
                  {extension.version === undefined ? '' : ` · ${extension.version}`}
                </span>
              </div>
              <CardTray
                className="extension-command"
                expandLabel={m.common.details.expand} collapseLabel={m.common.details.collapse}
                summary={(
                  <span className="extension-command-summary">
                    <span>{commandHeading}</span>
                    <code>{command}</code>
                  </span>
                )}
                action={(
                  <button
                    className="btn" aria-label={copyLabel}
                    onClick={() => onCopy(extension.name, command)}
                  >{m.settings.extensions.copy}</button>
                )}
              >
                <pre className="extension-command-code"><code>{command}</code></pre>
              </CardTray>
            </section>
          )
        })}
      </div>

      <section className="extension-tutorial" data-extension-tutorial>
        <div className="extension-tutorial-head">
          <h3>{m.settings.extensions.tutorial.heading}</h3>
          <p>{m.settings.extensions.tutorial.intro}</p>
        </div>
        <ol className="extension-tutorial-steps">
          {m.settings.extensions.tutorial.steps.map((step, index) => (
            <li key={step.title}>
              <span>{index + 1}</span>
              <div><strong>{step.title}</strong><p>{step.body}</p></div>
            </li>
          ))}
        </ol>

        <h4>{m.settings.extensions.tutorial.examplesHeading}</h4>
        <div className="extension-prompt-groups">
          {m.settings.extensions.tutorial.groups.map((group) => (
            <section className="extension-prompt-group" key={group.heading}>
              <h5>{group.heading}</h5>
              <div className="extension-prompt-list">
                {group.examples.map((example) => (
                  <div className="extension-prompt" key={example.label}>
                    <div>
                      <strong>{example.label}</strong>
                      <p>{example.prompt}</p>
                    </div>
                    <button className="btn" onClick={() => onCopyPrompt(example.prompt)}>
                      {m.settings.extensions.tutorial.copyPrompt}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <h4>{m.settings.extensions.tutorial.healthyHeading}</h4>
        <ul className="extension-healthy-list">
          {m.settings.extensions.tutorial.healthy.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </section>
    </>
  )
}
