// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { readShellState, SHELL_STATE_STORAGE_KEY, writeShellState, type ShellState } from './shell-state.js'

const FALLBACK: ShellState = {
  sidebarWidth: 232, sidebarHidden: false, screen: 'feed', inboxScope: 'all', inboxMode: 'watch', chat: null, reader: null,
}
const WIDTHS = { min: 180, max: 320 }
const keep = (value: unknown) => window.localStorage.setItem(SHELL_STATE_STORAGE_KEY, JSON.stringify(value))

describe('shell state', () => {
  afterEach(() => { window.localStorage.clear() })

  it('写下的状态下次启动原样读回', () => {
    const state: ShellState = {
      sidebarWidth: 260, sidebarHidden: true, screen: 'papers', inboxScope: 'w-topic', inboxMode: 'discovery', chat: 'c1',
      reader: { paper: 'paper-1', from: 'papers' },
    }
    writeShellState(state)
    expect(readShellState(FALLBACK, WIDTHS)).toEqual(state)
  })

  it('什么也没存、存的不是 JSON 或不是对象时,整个用默认', () => {
    expect(readShellState(FALLBACK, WIDTHS)).toEqual(FALLBACK)
    window.localStorage.setItem(SHELL_STATE_STORAGE_KEY, '{not json')
    expect(readShellState(FALLBACK, WIDTHS)).toEqual(FALLBACK)
    keep(['papers'])
    expect(readShellState(FALLBACK, WIDTHS)).toEqual(FALLBACK)
  })

  it('每一项单独核对:读不懂的那一项用默认,别的照旧,不认识的键不管', () => {
    keep({ sidebarWidth: 900, screen: 'papers', inboxScope: 3, inboxMode: 'later', chat: 'c2', theme: 'x' })
    expect(readShellState(FALLBACK, WIDTHS)).toEqual({ ...FALLBACK, screen: 'papers', chat: 'c2' })
    keep({ sidebarWidth: 200, screen: 'reader' })
    expect(readShellState(FALLBACK, WIDTHS)).toEqual({ ...FALLBACK, sidebarWidth: 200 })
    keep({ screen: 'somewhere-new', sidebarWidth: '250' })
    expect(readShellState(FALLBACK, WIDTHS)).toEqual(FALLBACK)
  })

  it('收起的侧栏和阅读器里的那篇论文也读回来;阅读器缺论文、来处不是能回去的屏,或侧栏状态不是真假时用默认', () => {
    keep({ sidebarHidden: true, reader: { paper: 'p1', from: 'feed', later: 1 } })
    expect(readShellState(FALLBACK, WIDTHS)).toEqual({ ...FALLBACK, sidebarHidden: true, reader: { paper: 'p1', from: 'feed' } })
    for (const reader of [{ from: 'feed' }, { paper: 'p1', from: 'reader' }, { paper: 3, from: 'feed' }, 'p1', null]) {
      keep({ sidebarHidden: 'yes', reader })
      expect([reader, readShellState(FALLBACK, WIDTHS)]).toEqual([reader, FALLBACK])
    }
  })
})
