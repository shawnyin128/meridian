import { useEffect, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { composing } from '../lib/keyboard.js'

/** The active row of a candidate list and the two ways to move it. */
export type CandidateKeys = {
  active: number
  onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => void
  pointAt: (index: number) => void
}

/**
 * Arrow-key and Enter handling for a candidate dropdown. `count` is the current number of
 * candidates, `onChoose` receives the highlighted index when Enter is pressed. While an input method
 * is composing, no key moves the highlight or chooses.
 * Returns the current highlighted index, an `onKeyDown` to spread onto the input, and `pointAt`,
 * which makes the row under the pointer the highlighted one; the highlight resets to 0 whenever
 * `count` changes.
 */
export function useCandidateKeys(count: number, onChoose: (index: number) => void): CandidateKeys {
  const [active, setActive] = useState(0)

  useEffect(() => { setActive(0) }, [count])

  const onKeyDown = (e: ReactKeyboardEvent<HTMLElement>) => {
    if (composing(e.nativeEvent)) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, count - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && count > 0) {
      onChoose(active)
    }
  }

  return { active, onKeyDown, pointAt: setActive }
}
