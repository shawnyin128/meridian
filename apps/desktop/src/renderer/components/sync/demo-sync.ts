import { useSyncExternalStore } from 'react'

/**
 * Demo only: what Core would report about a library kept in a folder a sync service syncs, until
 * Core does. The shoot script stores the scenario under STORE_KEY; resolving a conflict here only
 * drops it from this window's copy.
 */
export type SyncDemoDevice = {
  name: string
  platform: string
  version: string
  self: boolean
  /** When the device last had the library open; null while it has it open now. */
  seen: string | null
}

export type SyncDemoSide = { device: string; at: string; lines: string[] }

export type SyncDemoConflict = { id: string; title: string; mine: SyncDemoSide; theirs: SyncDemoSide }

export type SyncDemo = {
  service: string
  devices: SyncDemoDevice[]
  /** The other device editing the library right now, or null. */
  editing: string | null
  conflicts: SyncDemoConflict[]
  /** The titles of the papers whose page arrived before their PDF. */
  arriving: string[]
}

const STORE_KEY = 'meridian.demo.sync'
/** The window event the shoot script sends after it stores a new scenario. */
const CHANGED = 'meridian-demo-sync'

const resolved = new Set<string>()
const listeners = new Set<() => void>()
let version = 0

const changed = () => {
  version += 1
  for (const listener of listeners) listener()
}
const subscribe = (listener: () => void) => {
  if (listeners.size === 0) window.addEventListener(CHANGED, changed)
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) window.removeEventListener(CHANGED, changed)
  }
}

/** Demo only: the stored scenario with the conflicts resolved in this window left out, or null. */
function scenario(): SyncDemo | null {
  const stored = window.localStorage.getItem(STORE_KEY)
  if (stored === null) return null
  const demo = JSON.parse(stored) as SyncDemo
  return { ...demo, conflicts: demo.conflicts.filter((conflict) => !resolved.has(conflict.id)) }
}

/** Demo only: the scenario, read again whenever a conflict is resolved. */
export function useSyncDemo(): SyncDemo | null {
  useSyncExternalStore(subscribe, () => version)
  return scenario()
}

/** Demo only: resolves conflict `id` in this window. */
export function resolveDemoConflict(id: string): void {
  resolved.add(id)
  changed()
}
