import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ChatSendResult, HarnessModelSettings } from '../../shared/contract.js'
import { harness } from '../ipc.js'

/**
 * Whether the App's models can answer, as every screen shows it; see `useCoreModelStatus`. A surface
 * is connected while the model it runs can run as set up: a chat runs its own model, else the
 * default, and every other surface runs the default.
 */
export type ModelStatus = {
  /** Whether the default model can run as set up: null until the model settings have been read. */
  connected: boolean | null
  /** Whether some configured model can run, one a chat can switch to: null until the model settings have been read. */
  anyRuns: boolean | null
  /** The model settings as last read: null until the first read answers. */
  settings: HarnessModelSettings | null
  /**
   * Passes a chat send through; one whose result disagrees with the status, finding no model while
   * some model can run or answered while none can, has the model settings read again.
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
  const connected = settings === null ? null : settings.models.some((model) => model.id === settings.defaultModel && model.configured)
  const anyRuns = settings === null ? null : settings.models.some((model) => model.configured)
  const anyRunsNow = useRef(anyRuns)
  anyRunsNow.current = anyRuns
  const track = useCallback((send: Promise<ChatSendResult>) => send.then((result) => {
    const noModel = result.state === 'failed' && result.reason === 'no-model'
    if (noModel ? anyRunsNow.current !== false : anyRunsNow.current === false) read()
    return result
  }), [read])
  return useMemo(() => ({ connected, anyRuns, settings, track }), [connected, anyRuns, settings, track])
}

/** Returns the shell's model status. */
export function useModelStatus(): ModelStatus {
  const status = useContext(ModelStatusContext)
  if (!status) throw new Error('useModelStatus needs AppShell')
  return status
}
