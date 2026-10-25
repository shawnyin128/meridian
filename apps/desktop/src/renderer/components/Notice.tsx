import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Icon } from './icons.js'
import { Button } from './Button.js'
import './Notice.css'

/** What a notice reports: an action that took effect, or one that was refused and wrote nothing. */
export type NoticeTone = 'success' | 'refusal'

/** The one action a notice may offer, such as undoing what it reports. */
export type NoticeAction = { label: string; onAction: () => void }

/** One notice to show. A new `id` makes it a new notice, even when its text repeats the last one. */
export type NoticeContent = { id: number; tone: NoticeTone; text: ReactNode; action?: NoticeAction | undefined }

/** How long a notice stays up. Time with the pointer over it or the focus inside it does not count. */
export const NOTICE_MS = 5000

type Hold = 'pointer' | 'focus'

/**
 * The app's one notice, shown on the canvas for NOTICE_MS and then faded out. Its host is a live
 * region that stays mounted, so every new notice is announced. Hovering the notice or focusing its
 * action pauses the count, and leaving resumes it with the time that was left. The action runs once
 * and closes the notice. A faded notice keeps its text and leaves the Tab order.
 */
export function Notice({ notice }: { notice: NoticeContent | null }) {
  const [shown, setShown] = useState(false)
  const timer = useRef(0)
  const left = useRef(NOTICE_MS)
  const since = useRef(0)
  const holds = useRef(new Set<Hold>())

  const count = useCallback(() => {
    window.clearTimeout(timer.current)
    since.current = Date.now()
    timer.current = window.setTimeout(() => setShown(false), left.current)
  }, [])

  useEffect(() => {
    if (notice === null) return
    left.current = NOTICE_MS
    setShown(true)
    if (holds.current.size === 0) count()
    return () => window.clearTimeout(timer.current)
  }, [notice, count])

  const hold = (why: Hold) => {
    if (holds.current.size === 0) {
      window.clearTimeout(timer.current)
      left.current = Math.max(0, left.current - (Date.now() - since.current))
    }
    holds.current.add(why)
  }
  const release = (why: Hold) => {
    if (!holds.current.delete(why) || holds.current.size > 0) return
    if (shown) count()
  }

  return (
    <div className="notice-host" role="status">
      <div
        id="notice" className={`notice${shown ? ' show' : ''}`} data-tone={notice?.tone} inert={!shown}
        onMouseEnter={() => hold('pointer')} onMouseLeave={() => release('pointer')}
        onFocus={() => hold('focus')} onBlur={() => release('focus')}
      >
        {notice === null ? null : (
          <>
            {notice.tone === 'success'
              ? <Icon sw={2.4}><path d="M20 6L9 17l-5-5" /></Icon>
              : <Icon sw={2}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5v.01" /></Icon>}
            <span className="notice-text">{notice.text}</span>
            {notice.action === undefined ? null : (
              <Button
                size="compact" variant="ghost"
                onClick={() => {
                  window.clearTimeout(timer.current)
                  setShown(false)
                  notice.action!.onAction()
                }}
              >{notice.action.label}</Button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
