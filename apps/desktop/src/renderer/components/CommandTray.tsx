import { useEffect, useState } from 'react'
import { useMessages } from '../messages/useMessages.js'
import { Button, DONE_MS } from './Button.js'
import { CardTray } from './CardTray.js'
import { FadeText } from './FadeText.js'
import './CommandTray.css'

/**
 * The one command the user runs in their own terminal: a tray with `heading` and the command on one
 * line, the whole command below it once opened, and Copy, named `copyLabel`, which hands the command
 * to `onCopy` and shows the check for DONE_MS once `onCopy` resolves true.
 */
export function CommandTray({ heading, command, copyLabel, onCopy }: {
  heading: string
  command: string
  copyLabel: string
  onCopy: (command: string) => Promise<boolean>
}) {
  const m = useMessages()
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), DONE_MS)
    return () => window.clearTimeout(timer)
  }, [copied])
  return (
    <CardTray
      className="command-tray"
      expandLabel={m.common.details.expand} collapseLabel={m.common.details.collapse}
      summary={(
        <span className="command-tray-summary">
          <span className="command-tray-heading">{heading}</span>
          <FadeText><code>{command}</code></FadeText>
        </span>
      )}
      action={(
        <Button
          size="compact" variant="ghost" aria-label={copyLabel} done={copied} doneLabel={m.common.copied}
          onClick={() => { void onCopy(command).then((done) => { if (done) setCopied(true) }) }}
        >{m.common.copy}</Button>
      )}
    >
      <pre className="command-tray-code"><code>{command}</code></pre>
    </CardTray>
  )
}
