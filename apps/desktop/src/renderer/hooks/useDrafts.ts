import {
  createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore,
  type ChangeEvent, type KeyboardEvent, type ReactNode,
} from 'react'
import { library } from '../ipc.js'
import { composing } from '../lib/keyboard.js'

/** Unsent drafts held per target; see `useDrafts`. */
export type Drafts<D = string> = {
  /** Returns the draft of `target`, or undefined when it has none. */
  get: (target: string) => D | undefined
  /** Replaces the draft of `target`; an empty text is kept as a draft of its own. */
  set: (target: string, draft: D) => void
  /** Forgets the draft of `target`, once it has been sent, saved or discarded. */
  drop: (target: string) => void
}

/** A draft that edits stored text: what was typed, and the stored text it was typed over. */
export type EditDraft = { text: string; base: string }

/** Where an editor keeps the text typed into it as a draft: under `target` in `drafts`. */
export type KeptText = { drafts: Drafts<string>; target: string }

/** The renderer localStorage key of the drafts kept for the vault at `root`. */
export const keptDraftsKey = (root: string): string => `meridian.drafts:${root}`

/**
 * The shape of the kept drafts under `keptDraftsKey`: `{ format: 1, drafts: KeptDraft[] }`. A
 * change that is not additive moves to another key, so no App reads a shape it does not know.
 */
const KEPT_FORMAT = 1

/** One kept draft: the scope it belongs to, its target in that scope, and the draft itself. */
type KeptDraft = [scope: string[], target: string, draft: unknown]

/**
 * Drafts by scope, as `JSON.stringify(scope)`, then by target. A scope's map is replaced, never
 * changed in place, when one of its drafts changes, so each scope's readers see only their changes.
 */
type DraftStore = {
  scope: (scope: string) => ReadonlyMap<string, unknown>
  /** Every scope's drafts; the same map until a draft changes. */
  all: () => ReadonlyMap<string, ReadonlyMap<string, unknown>>
  /** Whether the drafts kept for the vault have been read; true from the start for a store that keeps none. */
  loaded: () => boolean
  set: (scope: string, target: string, draft: unknown) => void
  drop: (scope: string, target: string) => void
  /** Drops the drafts of `scope` whose target is not in `live`. */
  keep: (scope: string, live: readonly string[]) => void
  /**
   * Drops the drafts of every item under `prefix` whose id is not in `live`: each draft whose scope
   * is `prefix` followed by such an id and more, and each draft of the scope `prefix` itself whose
   * target is such an id.
   */
  prune: (prefix: readonly string[], live: readonly string[]) => void
  /** Whether any draft belongs to an item under `prefix`. */
  holds: (prefix: readonly string[]) => boolean
  subscribe: (listener: () => void) => () => void
}

const NO_DRAFTS: ReadonlyMap<string, unknown> = new Map()

const isKeptDraft = (record: unknown): record is KeptDraft => Array.isArray(record) && record.length === 3
  && Array.isArray(record[0]) && record[0].every((segment) => typeof segment === 'string')
  && typeof record[1] === 'string' && record[2] !== undefined

/**
 * The kept drafts in `stored`, a value read from localStorage, and the records in it that cannot be
 * read as one, which are reported and held as they are so that writing the drafts back keeps them.
 * A value that is not the kept-draft shape at all is reported and read as holding none.
 */
function readKept(stored: string | null): { drafts: KeptDraft[]; unread: unknown[] } {
  if (stored === null) return { drafts: [], unread: [] }
  let value: unknown
  try {
    value = JSON.parse(stored)
  } catch {
    value = null
  }
  const records = typeof value === 'object' && value !== null && (value as { format?: unknown }).format === KEPT_FORMAT
    ? (value as { drafts?: unknown }).drafts : undefined
  if (!Array.isArray(records)) {
    console.error('[drafts] the kept drafts are not in a shape this App reads; none are restored')
    return { drafts: [], unread: [] }
  }
  const unread = records.filter((record) => !isKeptDraft(record))
  if (unread.length > 0) console.error(`[drafts] ${unread.length} kept drafts are in a shape this App does not read and stay as they are`)
  return { drafts: records.filter(isKeptDraft), unread }
}

/**
 * A draft store. Without `storage` it holds the drafts in memory only; `open` then starts keeping
 * them in `storage` under `key`, after reading what is kept there, and a draft typed before that
 * wins over a kept one for the same target.
 */
function createDraftStore(storage: Storage | null = null): DraftStore & { open: (key: string) => void } {
  let scopes = new Map<string, ReadonlyMap<string, unknown>>()
  let key: string | null = null
  let unread: unknown[] = []
  let loaded = storage === null
  const listeners = new Set<() => void>()
  const commit = (next: Map<string, ReadonlyMap<string, unknown>>) => {
    scopes = next
    if (storage !== null && key !== null) {
      const kept: unknown[] = [...unread, ...[...scopes].flatMap(([scope, drafts]) =>
        [...drafts].map(([target, draft]): KeptDraft => [JSON.parse(scope) as string[], target, draft]))]
      if (kept.length === 0) storage.removeItem(key)
      else storage.setItem(key, JSON.stringify({ format: KEPT_FORMAT, drafts: kept }))
    }
    listeners.forEach((listener) => listener())
  }
  const withScope = (scope: string, change: (drafts: Map<string, unknown>) => void) => {
    const drafts = new Map(scopes.get(scope) ?? NO_DRAFTS)
    change(drafts)
    const next = new Map(scopes)
    if (drafts.size === 0) next.delete(scope)
    else next.set(scope, drafts)
    commit(next)
  }
  return {
    scope: (scope) => scopes.get(scope) ?? NO_DRAFTS,
    all: () => scopes,
    loaded: () => loaded,
    set: (scope, target, draft) => withScope(scope, (drafts) => { drafts.set(target, draft) }),
    drop: (scope, target) => {
      if (scopes.get(scope)?.has(target) === true) withScope(scope, (drafts) => { drafts.delete(target) })
    },
    keep: (scope, live) => {
      const held = scopes.get(scope)
      if (held !== undefined && [...held.keys()].some((target) => !live.includes(target))) {
        withScope(scope, (drafts) => { for (const target of drafts.keys()) if (!live.includes(target)) drafts.delete(target) })
      }
    },
    prune: (prefix, live) => {
      const own = JSON.stringify(prefix)
      const next = new Map(scopes)
      for (const [scope, drafts] of scopes) {
        const segments = JSON.parse(scope) as string[]
        if (scope === own) {
          const kept = new Map([...drafts].filter(([target]) => live.includes(target)))
          if (kept.size === 0) next.delete(scope)
          else if (kept.size < drafts.size) next.set(scope, kept)
        } else if (segments.length > prefix.length && prefix.every((segment, at) => segments[at] === segment)
          && !live.includes(segments[prefix.length]!)) {
          next.delete(scope)
        }
      }
      if ([...next].length !== scopes.size || [...next].some(([scope, drafts]) => scopes.get(scope) !== drafts)) commit(next)
    },
    holds: (prefix) => [...scopes.keys()].some((scope) => {
      const segments = JSON.parse(scope) as string[]
      return segments.length >= prefix.length && prefix.every((segment, at) => segments[at] === segment)
    }),
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    open: (opened) => {
      if (storage === null) return
      const next = new Map<string, ReadonlyMap<string, unknown>>()
      const read = readKept(storage.getItem(opened))
      unread = read.unread
      for (const [scope, target, draft] of read.drafts) {
        const id = JSON.stringify(scope)
        next.set(id, new Map(next.get(id) ?? NO_DRAFTS).set(target, draft))
      }
      for (const [scope, drafts] of scopes) next.set(scope, new Map([...(next.get(scope) ?? NO_DRAFTS), ...drafts]))
      key = opened
      loaded = true
      commit(next)
    },
  }
}

const DraftsContext = createContext<DraftStore | null>(null)

/**
 * Keeps every draft typed under it on this machine, outside the vault: in the renderer's
 * localStorage under `keptDraftsKey` of the open vault's root, written as it is typed, so a draft
 * survives closing the window or quitting and never shows in another vault. Until the vault's root
 * is known, drafts are held in memory and kept once it is.
 */
export function DraftsProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => createDraftStore(window.localStorage))
  useEffect(() => {
    void library.location().then((where) => store.open(keptDraftsKey(where.root)))
  }, [store])
  return createElement(DraftsContext.Provider, { value: store }, children)
}

/**
 * Holds one draft per target (a chat, a paper, a note) of `scope`, the path of the item the
 * drafts belong to, such as `['paper', paperId]`. Text typed for one target is never read under
 * another, and a target's draft is still there after the caller switches away and back. Under a
 * `DraftsProvider` the drafts are kept across restarts and shared with every caller of the same
 * scope; outside one they live in memory for as long as the calling component stays mounted.
 * When `live` is given, the scope's drafts whose target is not in it are dropped: the caller passes
 * the targets its loaded list holds, so a kept draft of an item that is gone never shows.
 */
export function useDrafts<D = string>(scope: readonly string[], live: readonly string[] | null = null): Drafts<D> {
  const shared = useContext(DraftsContext)
  const [own] = useState(() => (shared === null ? createDraftStore() : null))
  const store = shared ?? own!
  const id = JSON.stringify(scope)
  const scoped = () => store.scope(id)
  const drafts = useSyncExternalStore(store.subscribe, scoped, scoped)
  const loaded = useSyncExternalStore(store.subscribe, store.loaded, store.loaded)
  const liveId = live === null ? null : JSON.stringify(live)
  useEffect(() => {
    if (loaded && liveId !== null) store.keep(id, JSON.parse(liveId) as string[])
  }, [store, id, liveId, loaded])
  return useMemo(() => ({
    get: (target) => drafts.get(target) as D | undefined,
    set: (target, draft) => store.set(id, target, draft),
    drop: (target) => store.drop(id, target),
  }), [store, id, drafts])
}

const NEVER = () => () => {}
const NO_SCOPES: ReadonlyMap<string, ReadonlyMap<string, unknown>> = new Map()

/**
 * The scope and target of every kept draft whose scope is `prefix` followed by one more segment and
 * whose target begins with `start`, for a caller that reopens the editor of whichever item has one,
 * each with `drop`, which forgets that draft. Outside a `DraftsProvider` there are none.
 */
export function useKeptTargets(prefix: readonly string[], start: string): { scope: string[]; target: string; drop: () => void }[] {
  const store = useContext(DraftsContext)
  const read = () => store?.all() ?? NO_SCOPES
  const scopes = useSyncExternalStore(store?.subscribe ?? NEVER, read, read)
  const prefixId = JSON.stringify(prefix)
  return useMemo(() => {
    const under = JSON.parse(prefixId) as string[]
    return [...scopes].flatMap(([id, drafts]) => {
      const scope = JSON.parse(id) as string[]
      if (scope.length !== under.length + 1 || !under.every((segment, at) => scope[at] === segment)) return []
      return [...drafts.keys()].filter((target) => target.startsWith(start))
        .map((target) => ({ scope, target, drop: () => store?.drop(id, target) }))
    })
  }, [store, scopes, prefixId, start])
}

/**
 * Drops the kept drafts of every item under `prefix` whose id is not in `live`, the ids of the
 * complete list of those items the caller has loaded; null until it has. `live` may instead be a
 * function that loads those ids, called only while a kept draft belongs to such an item, once the
 * kept drafts are read and again for each new function. Outside a `DraftsProvider` it does nothing.
 */
export function usePruneDrafts(
  prefix: readonly string[],
  live: readonly string[] | (() => Promise<readonly string[]>) | null,
): void {
  const store = useContext(DraftsContext)
  const read = () => store?.loaded() ?? false
  const loaded = useSyncExternalStore(store?.subscribe ?? NEVER, read, read)
  const prefixId = JSON.stringify(prefix)
  const liveId = live === null || typeof live === 'function' ? null : JSON.stringify(live)
  const load = typeof live === 'function' ? live : null
  useEffect(() => {
    if (store === null || !loaded) return
    const under = JSON.parse(prefixId) as string[]
    if (liveId !== null) store.prune(under, JSON.parse(liveId) as string[])
    else if (load !== null && store.holds(under)) void load().then((ids) => store.prune(under, ids))
  }, [store, loaded, prefixId, liveId, load])
}

/** An edit of stored text; see `editText`. */
export type TextEdit = {
  editing: boolean
  text: string
  stale: boolean
  start: () => void
  change: (text: string) => void
  drop: () => void
}

/**
 * The edit of stored text `stored`, its draft kept in `drafts` under `target`: `editing` while
 * there is a draft, `text` the draft's text or `stored`, and `stale` when the stored text has
 * changed since the draft started, which the caller must not save. `start` opens a draft of
 * `stored`, `change` replaces its text and keeps the stored text it started from, and `drop`
 * forgets it once it is saved or cancelled.
 */
export function editText(drafts: Drafts<EditDraft>, target: string, stored: string): TextEdit {
  const draft = drafts.get(target)
  return {
    editing: draft !== undefined,
    text: draft?.text ?? stored,
    stale: draft !== undefined && draft.base !== stored,
    start: () => drafts.set(target, { text: stored, base: stored }),
    change: (text) => drafts.set(target, { text, base: draft?.base ?? stored }),
    drop: () => drafts.drop(target),
  }
}

/**
 * The one draft `target` of `scope` (see `useDrafts`) as a state: null while there is none, and
 * setting null drops it.
 */
export function useDraft<D>(scope: readonly string[], target: string): [D | null, (next: D | null) => void] {
  const drafts = useDrafts<D>(scope)
  const set = useCallback((next: D | null) => (next === null ? drafts.drop(target) : drafts.set(target, next)), [drafts, target])
  return [drafts.get(target) ?? null, set]
}

/**
 * The field that edits `stored`, with its draft kept in `drafts` under `target`. `text` is the
 * draft, or `stored` when there is none; typing keeps the stored text the draft started from, and
 * Esc drops the draft so the stored text shows again, except while an input method is composing. `stale` is true when the stored text has
 * changed since the draft started: the field is then marked as a refused save (`aria-invalid`), and
 * the caller must not save it. `drop` forgets the draft once it has been saved. Spread `fieldProps`
 * onto the field.
 */
export function editField(drafts: Drafts<EditDraft>, target: string, stored: string): {
  text: string
  stale: boolean
  drop: () => void
  fieldProps: {
    value: string
    'aria-invalid': true | undefined
    onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void
    onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  }
} {
  const edit = editText(drafts, target, stored)
  return {
    text: edit.text,
    stale: edit.stale,
    drop: edit.drop,
    fieldProps: {
      value: edit.text,
      'aria-invalid': edit.stale || undefined,
      onChange: (event) => edit.change(event.target.value),
      onKeyDown: (event) => {
        if (event.key !== 'Escape' || !edit.editing || composing(event.nativeEvent)) return
        event.stopPropagation()
        edit.drop()
      },
    },
  }
}
