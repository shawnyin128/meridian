// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const vault = vi.hoisted(() => ({ root: '/vaults/a' }))
vi.mock('../ipc.js', () => ({ library: { location: () => Promise.resolve({ root: vault.root }) } }))

const { DraftsProvider, keptDraftsKey, useDrafts, usePruneDrafts } = await import('./useDrafts.js')

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

/** What a mounted editor sees and does: the drafts of its scope, read on each render. */
type Seen = { get: (target: string) => unknown; set: (target: string, draft: unknown) => void; drop: (target: string) => void }

describe('kept drafts', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.clear()
    vault.root = '/vaults/a'
    host = document.createElement('div')
    document.body.append(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  /** An editor of `scope` that hands its drafts to `seen`, pruning with `live` when given. */
  function Editor({ scope, live = null, seen }: { scope: string[]; live?: string[] | null; seen: (drafts: Seen) => void }) {
    seen(useDrafts<unknown>(scope, live))
    return null
  }

  /** Starts the App afresh: a new provider reads what the last one kept, once the vault's root resolves. */
  const start = async (children: ReactNode, provided = true) => {
    root = createRoot(host)
    await act(async () => {
      root.render(provided ? <DraftsProvider>{children}</DraftsProvider> : children)
      await Promise.resolve()
    })
  }
  /** Quits: the provider and every editor go away, and only what was kept remains. */
  const quit = () => act(() => root.unmount())

  it('keeps a draft as it is typed and gives it back after quitting and starting again, until it is dropped', async () => {
    let drafts!: Seen
    await start(<Editor scope={['paper', 'p1']} seen={(seen) => { drafts = seen }} />)
    act(() => drafts.set('new-note', '没存的笔记'))
    quit()
    await start(<Editor scope={['paper', 'p1']} seen={(seen) => { drafts = seen }} />)
    expect(drafts.get('new-note')).toBe('没存的笔记')

    act(() => drafts.drop('new-note'))
    quit()
    await start(<Editor scope={['paper', 'p1']} seen={(seen) => { drafts = seen }} />)
    expect(drafts.get('new-note')).toBeUndefined()
    expect(window.localStorage.getItem(keptDraftsKey('/vaults/a'))).toBeNull()
  })

  it('shares a scope between its editors and never reads one scope\'s draft under another', async () => {
    let first!: Seen
    let second!: Seen
    let other!: Seen
    await start(<>
      <Editor scope={['chat', 'c1']} seen={(seen) => { first = seen }} />
      <Editor scope={['chat', 'c1']} seen={(seen) => { second = seen }} />
      <Editor scope={['chat', 'c2']} seen={(seen) => { other = seen }} />
    </>)
    act(() => first.set('message', 'hello'))
    expect([second.get('message'), other.get('message')]).toEqual(['hello', undefined])
  })

  it('keeps the drafts of each vault apart', async () => {
    let drafts!: Seen
    await start(<Editor scope={['project', 'p1']} seen={(seen) => { drafts = seen }} />)
    act(() => drafts.set('memo', { text: 'A 库的随笔', base: '' }))
    quit()
    vault.root = '/vaults/b'
    await start(<Editor scope={['project', 'p1']} seen={(seen) => { drafts = seen }} />)
    expect(drafts.get('memo')).toBeUndefined()
    quit()
    vault.root = '/vaults/a'
    await start(<Editor scope={['project', 'p1']} seen={(seen) => { drafts = seen }} />)
    expect(drafts.get('memo')).toEqual({ text: 'A 库的随笔', base: '' })
  })

  it('keeps a draft typed before the vault\'s root is known, over the one kept for the same target', async () => {
    window.localStorage.setItem(keptDraftsKey('/vaults/a'), JSON.stringify({
      format: 1, drafts: [[['paper', 'p1'], 'new-note', '旧的'], [['paper', 'p1'], 'remark', '留着的']],
    }))
    let drafts!: Seen
    root = createRoot(host)
    act(() => root.render(<DraftsProvider><Editor scope={['paper', 'p1']} seen={(seen) => { drafts = seen }} /></DraftsProvider>))
    act(() => drafts.set('new-note', '新的'))
    await act(async () => { await Promise.resolve() })
    expect([drafts.get('new-note'), drafts.get('remark')]).toEqual(['新的', '留着的'])
  })

  it('drops the drafts of a scope whose targets are not in the list its editor loaded', async () => {
    window.localStorage.setItem(keptDraftsKey('/vaults/a'), JSON.stringify({
      format: 1, drafts: [[['paper', 'p1', 'edits'], 'note:n1', 'a'], [['paper', 'p1', 'edits'], 'note:gone', 'b']],
    }))
    let drafts!: Seen
    await start(<Editor scope={['paper', 'p1', 'edits']} live={['note:n1']} seen={(seen) => { drafts = seen }} />)
    expect([drafts.get('note:n1'), drafts.get('note:gone')]).toEqual(['a', undefined])
    expect(window.localStorage.getItem(keptDraftsKey('/vaults/a'))).not.toContain('note:gone')
  })

  it('drops every draft of an item that a complete list of its kind no longer holds, its own scope\'s and those nested under it', async () => {
    window.localStorage.setItem(keptDraftsKey('/vaults/a'), JSON.stringify({
      format: 1,
      drafts: [
        [['chat', 'c1'], 'message', 'kept'], [['chat', 'gone'], 'message', 'x'], [['chat', 'gone', 'idea'], 'title', 'y'],
        [['chats'], 'gone', 'z'], [['chat'], 'c1', 'direct'], [['chat'], 'gone', 'direct'],
      ],
    }))
    function Prune({ live }: { live: string[] | null }) {
      usePruneDrafts(['chat'], live)
      return null
    }
    await start(<Prune live={null} />)
    expect(window.localStorage.getItem(keptDraftsKey('/vaults/a'))).toContain('gone')
    await act(async () => { root.render(<DraftsProvider><Prune live={['c1']} /></DraftsProvider>) })
    const kept = JSON.parse(window.localStorage.getItem(keptDraftsKey('/vaults/a'))!) as { drafts: unknown[] }
    expect(kept.drafts).toEqual([[['chat', 'c1'], 'message', 'kept'], [['chats'], 'gone', 'z'], [['chat'], 'c1', 'direct']])
  })

  it('loads the ids of a kind only while a kept draft belongs to one of its items', async () => {
    const load = vi.fn(() => Promise.resolve(['p1']))
    function Prune() {
      usePruneDrafts(['paper'], load)
      return null
    }
    await start(<Prune />)
    expect(load).not.toHaveBeenCalled()
    quit()
    window.localStorage.setItem(keptDraftsKey('/vaults/a'), JSON.stringify({
      format: 1, drafts: [[['paper', 'p1'], 'new-note', 'a'], [['paper', 'gone'], 'new-note', 'b']],
    }))
    await start(<Prune />)
    await act(async () => { await Promise.resolve() })
    expect(load).toHaveBeenCalledTimes(1)
    expect(window.localStorage.getItem(keptDraftsKey('/vaults/a'))).not.toContain('gone')
  })

  it('reports records it cannot read, restores the rest and writes the unread ones back as they were', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const future = { scope: ['paper', 'p1'], target: 'new-note', draft: 'from a newer App' }
    window.localStorage.setItem(keptDraftsKey('/vaults/a'), JSON.stringify({
      format: 1, drafts: [future, [['paper', 'p1'], 'remark', '读得懂的']],
    }))
    let drafts!: Seen
    await start(<Editor scope={['paper', 'p1']} seen={(seen) => { drafts = seen }} />)
    expect(drafts.get('remark')).toBe('读得懂的')
    expect(error).toHaveBeenCalledOnce()
    act(() => drafts.set('new-note', '新写的'))
    expect((JSON.parse(window.localStorage.getItem(keptDraftsKey('/vaults/a'))!) as { drafts: unknown[] }).drafts)
      .toContainEqual(future)

    quit()
    window.localStorage.setItem(keptDraftsKey('/vaults/a'), 'not json')
    await start(<Editor scope={['paper', 'p1']} seen={(seen) => { drafts = seen }} />)
    expect(drafts.get('remark')).toBeUndefined()
    expect(error).toHaveBeenCalledTimes(2)
    error.mockRestore()
  })

  it('outside a provider holds each editor\'s drafts in memory only, as long as it stays mounted', async () => {
    let drafts!: Seen
    await start(<Editor scope={['paper', 'p1']} seen={(seen) => { drafts = seen }} />, false)
    act(() => drafts.set('new-note', '只在内存里'))
    expect(drafts.get('new-note')).toBe('只在内存里')
    expect(window.localStorage.length).toBe(0)
    quit()
    await start(<Editor scope={['paper', 'p1']} seen={(seen) => { drafts = seen }} />, false)
    expect(drafts.get('new-note')).toBeUndefined()
  })
})
