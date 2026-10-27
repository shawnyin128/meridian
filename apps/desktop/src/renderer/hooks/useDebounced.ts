import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * The value of `value` once it has stayed unchanged for `ms`, compared with `Object.is`; the first
 * value counts at once. The returned `settle` makes the current value count now.
 */
export function useDebounced<T>(value: T, ms: number): [T, () => void] {
  const [settled, setSettled] = useState(value)
  const latest = useRef(value)
  latest.current = value
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), ms)
    return () => window.clearTimeout(timer)
  }, [value, ms])
  const settle = useCallback(() => setSettled(latest.current), [])
  return [settled, settle]
}
