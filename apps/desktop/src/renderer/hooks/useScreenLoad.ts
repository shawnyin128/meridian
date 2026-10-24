import { useCallback, useRef, useState } from 'react'
import { errorLabel } from '../lib/failure-label.js'
import { useMessages } from '../messages/useMessages.js'

/** The failure `report` shows, kept apart from every load key. */
const REPORTED = Symbol('reported')

/** A screen's Core reads and the one error it shows for them; see `useScreenLoad`. */
export type ScreenLoad = {
  /** The label of the latest failure still standing, or null when none is. */
  error: string | null
  /**
   * Waits for `call`, the read of the screen's load `key`, and hands its value to `apply`. The answer
   * and the failure of a call are ignored once a later load of the same `key` started or the returned
   * drop ran. A failure stands as `error` until a later load of `key` succeeds. The drop, which an
   * effect returns as its cleanup, also clears the failure of `key` unless the same effect loads `key`
   * again.
   */
  load: <T>(key: string, call: Promise<T>, apply: (value: T) => void) => () => void
  /** Shows the label of `cause`, a failure outside the screen's loads, until a load started after it succeeds. */
  report: (cause: unknown) => void
}

/**
 * Owns the Core reads of one screen and the error it shows for them: each failure stands until the
 * load that failed succeeds, and a late answer never replaces a newer one.
 */
export function useScreenLoad(): ScreenLoad {
  const m = useMessages()
  const [failures, setFailures] = useState<ReadonlyMap<string | symbol, string>>(new Map())
  const latest = useRef(new Map<string, number>())
  const started = useRef(0)
  const reportedAfter = useRef(0)

  const fail = useCallback((key: string | symbol, cause: unknown) => {
    const label = errorLabel(m, cause)
    setFailures((held) => {
      const next = new Map(held)
      next.delete(key)
      return next.set(key, label)
    })
  }, [m])
  const clear = useCallback((keys: (string | symbol)[]) => setFailures((held) => {
    if (!keys.some((key) => held.has(key))) return held
    const next = new Map(held)
    for (const key of keys) next.delete(key)
    return next
  }), [])

  const load = useCallback(<T,>(key: string, call: Promise<T>, apply: (value: T) => void) => {
    const seq = ++started.current
    latest.current.set(key, seq)
    const current = () => latest.current.get(key) === seq
    call.then((value) => {
      if (!current()) return
      apply(value)
      clear(seq > reportedAfter.current ? [key, REPORTED] : [key])
    }, (cause: unknown) => {
      if (current()) fail(key, cause)
    })
    return () => {
      if (!current()) return
      latest.current.delete(key)
      // An effect's cleanup and its next run happen in the same commit, before any microtask runs.
      queueMicrotask(() => { if (!latest.current.has(key)) clear([key]) })
    }
  }, [clear, fail])

  const report = useCallback((cause: unknown) => {
    reportedAfter.current = started.current
    fail(REPORTED, cause)
  }, [fail])

  return { error: [...failures.values()].at(-1) ?? null, load, report }
}
