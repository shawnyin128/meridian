import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import { useScreenShown } from '../shell/AppShell.js'
import type { ScreenLoad } from './useScreenLoad.js'

/**
 * Reads `fetch` again through `load` as the screen load `key`, `ms` after the previous read settled,
 * while the caller's screen is shown, and at once when the screen is shown again after it was
 * hidden; a null `ms` stops reading. A result equal to the state `set` holds keeps the held value,
 * so an unchanged result renders nothing.
 */
export function useScreenPoll<T>(
  load: ScreenLoad['load'], key: string, fetch: () => Promise<T>, set: Dispatch<SetStateAction<T | null>>,
  ms: number | null,
): void {
  const shown = useScreenShown()
  const read = useRef(fetch)
  read.current = fetch
  const hidden = useRef(false)
  useEffect(() => {
    if (!shown) {
      hidden.current = true
      return
    }
    const returned = hidden.current
    hidden.current = false
    if (ms === null) return
    let timer = 0
    let stopped = false
    const tick = () => {
      const call = read.current()
      load(key, call, (next) => set((held) => (JSON.stringify(held) === JSON.stringify(next) ? held : next)))
      void call.then(wait, wait)
    }
    const wait = () => { if (!stopped) timer = window.setTimeout(tick, ms) }
    if (returned) tick()
    else wait()
    return () => {
      stopped = true
      window.clearTimeout(timer)
    }
  }, [load, key, set, ms, shown])
}
