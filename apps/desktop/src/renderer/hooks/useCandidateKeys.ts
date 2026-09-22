import { useEffect, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

/**
 * Arrow-key and Enter handling for a candidate dropdown. `count` is the current number of
 * candidates, `onChoose` receives the highlighted index when Enter is pressed.
 * Returns the current highlighted index and an `onKeyDown` to spread onto the input; the
 * highlight resets to 0 whenever `count` changes.
 */
export function useCandidateKeys(count: number, onChoose: (index: number) => void): {
  active: number
  onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => void
} {
  const [active, setActive] = useState(0)

  useEffect(() => { setActive(0) }, [count])

  const onKeyDown = (e: ReactKeyboardEvent<HTMLElement>) => {
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

  return { active, onKeyDown }
}
