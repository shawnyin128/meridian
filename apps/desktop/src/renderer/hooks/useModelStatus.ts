import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ChatSendResult, HarnessModelSettings } from '../../shared/contract.js'
import { harness } from '../ipc.js'

/**
 * A kind of source the App's model answers from: an API endpoint set up in the model settings, or
 * the user's own subscription CLI chosen there.
 */
export type ModelSource = 'api' | 'subscription'

/**
 * The source `settings` set up a model from, or null when they set up none, which includes a
 * subscription choice that could not be read. A new kind of model source is read here.
 */
export function modelSourceOf(settings: HarnessModelSettings): ModelSource | null {
  if (settings.subscription.error !== undefined) return null
  if (settings.subscription.active !== null) return 'subscription'
  return settings.configured ? 'api' : null
}

/** Whether the App's model can answer, as every screen shows it; see `useCoreModelStatus`. */
export type ModelStatus = {
  /** Whether a model is set up to answer: null until the model settings have been read. */
  connected: boolean | null
  /** Where the model answers from, while one is set up. */
  source: ModelSource | null
  /**
   * Passes a chat send through; one whose result disagrees with the status, finding no model set up
   * while one is or answered while none is, has the model settings read again.
   */
  track: (send: Promise<ChatSendResult>) => Promise<ChatSendResult>
}

export const ModelStatusContext = createContext<ModelStatus | null>(null)

/**
 * The App's model status, for the shell to share: read from the model settings when the shell
 * mounts, again each time Settings closes (`settingsOpen` turning false), where the model is set up,
 * and whenever a chat send's result disagrees with it (see `track`). A read answered after a newer
 * one began is dropped. `track` keeps its identity across renders.
 */
export function useCoreModelStatus(settingsOpen: boolean): ModelStatus {
  const [settings, setSettings] = useState<HarnessModelSettings | null>(null)
  const reads = useRef(0)
  const read = useCallback(() => {
    reads.current += 1
    const at = reads.current
    void harness.modelSettings().then((next) => { if (reads.current === at) setSettings(next) })
  }, [])
  const settingsWereOpen = useRef(settingsOpen)
  useEffect(() => {
    const closed = settingsWereOpen.current && !settingsOpen
    settingsWereOpen.current = settingsOpen
    if (closed || reads.current === 0) read()
  }, [settingsOpen, read])
  const source = settings === null ? null : modelSourceOf(settings)
  const connected = settings === null ? null : source !== null
  const connectedNow = useRef(connected)
  connectedNow.current = connected
  const track = useCallback((send: Promise<ChatSendResult>) => send.then((result) => {
    const noModel = result.state === 'failed' && result.reason === 'no-model'
    if (noModel ? connectedNow.current !== false : connectedNow.current === false) read()
    return result
  }), [read])
  return useMemo(() => ({ connected, source, track }), [connected, source, track])
}

/** Returns the shell's model status. */
export function useModelStatus(): ModelStatus {
  const status = useContext(ModelStatusContext)
  if (!status) throw new Error('useModelStatus needs AppShell')
  return status
}
