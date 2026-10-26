import { useEffect, useState } from 'react'
import { elapsedText } from '../lib/format.js'
import './ElapsedTime.css'

/**
 * The time since `since`, an ISO timestamp, as `elapsedText` writes it, counting up on each whole
 * second after `since`, in tabular numerals so its width holds still. It is a timer that assistive
 * technology does not read out as it changes.
 */
export function ElapsedTime({ since }: { since: string }) {
  const start = Date.parse(since)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const tick = () => setNow(Date.now())
    let each: number | undefined
    const first = window.setTimeout(() => {
      tick()
      each = window.setInterval(tick, 1000)
    }, 1000 - (Math.max(0, Date.now() - start) % 1000))
    return () => {
      window.clearTimeout(first)
      window.clearInterval(each)
    }
  }, [start])
  return <span className="elapsed-time" role="timer">{elapsedText(now - start)}</span>
}
