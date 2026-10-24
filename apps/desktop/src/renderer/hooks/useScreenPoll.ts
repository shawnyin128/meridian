import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import { useScreenShown } from '../shell/AppShell.js'
import type { ScreenLoad } from './useScreenLoad.js'

/**
 * Reads `fetch` again through `load` as the screen load `key`, `ms` after the previous read settled,
 * while the caller's screen is shown; a null `ms` stops reading. A result equal to the state `set`
 * holds keeps the held value, so an unchanged result renders nothing.
 */
export function useScreenPoll<T>(
  load: ScreenLoad['load'], key: string, fetch: () => Promise<T>, set: Dispatch<SetStateAction<T | null>>,
  ms: number | null,
): void {
  const shown = useScreenShown()
  const read = useRef(fetch)
  read.current = fetch
  useEffect(() => {
    if (ms === null || !shown) return
    let timer = 0
    let stopped = false
    const tick = () => {
      const call = read.current()
      load(key, call, (next) => set((held) => (JSON.stringify(held) === JSON.stringify(next) ? held : next)))
      void call.then(wait, wait)
    }
    const wait = () => { if (!stopped) timer = window.setTimeout(tick, ms) }
    wait()
    return () => {
      stopped = true
      window.clearTimeout(timer)
    }
  }, [load, key, set, ms, shown])
}
