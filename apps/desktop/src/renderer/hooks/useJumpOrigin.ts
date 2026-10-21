import { useCallback, useEffect, useState } from 'react'
import { useJump, useScreenEntry, type ScreenKey } from '../shell/AppShell.js'

/**
 * The screen the latest jump to the caller's screen came from, which the caller's back control in its
 * page header returns to. It is null before any jump, after a sidebar entry, and when the jump came
 * from the caller's own screen. `back` forgets it and returns to it.
 */
export function useJumpOrigin(): { origin: ScreenKey | null; back: () => void } {
  const { jump, returnTo } = useJump()
  const entry = useScreenEntry()
  const [origin, setOrigin] = useState<ScreenKey | null>(null)
  // A sidebar entry ends the visit a jump began; declared first, so a jump in the same render wins.
  useEffect(() => { setOrigin(null) }, [entry])
  useEffect(() => {
    if (jump !== null) setOrigin(jump.from === jump.screen ? null : jump.from)
  }, [jump])
  const back = useCallback(() => {
    if (origin === null) return
    setOrigin(null)
    returnTo(origin)
  }, [origin, returnTo])
  return { origin, back }
}
