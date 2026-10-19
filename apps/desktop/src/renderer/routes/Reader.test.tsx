// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PaperReading } from '../../shared/contract.js'
import { MessagesProvider } from '../messages/useMessages.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const shell = vi.hoisted(() => ({
  revision: 0,
  jump: { screen: 'reader', target: 'paper-1', from: 'papers', seq: 1 },
  reading: { paperId: 'paper-1', highlights: [], notes: [], remark: '' } as PaperReading,
}))

vi.mock('../ipc.js', () => ({
  papers: {
    get: () => Promise.resolve({ id: 'paper-1', title: 'Paper One' }),
    reading: () => Promise.resolve(structuredClone(shell.reading)),
    // The PDF never arrives: these cases are about the reading state beside it.
    source: () => new Promise(() => {}),
  },
}))

vi.mock('../shell/AppShell.js', () => ({
  useBanner: () => vi.fn(),
  useCrumbTail: () => {},
  useJump: () => ({ jump: shell.jump, open: vi.fn(), returnTo: vi.fn() }),
  useToast: () => vi.fn(),
  useVaultRevision: () => ({ revision: shell.revision, bump: vi.fn() }),
}))

vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, getDocument: vi.fn() }))
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '' }))

vi.mock('../components/chat/PaperChat.js', () => ({ PaperChat: () => null }))

vi.mock('../components/reader/ReaderSidePanel.js', () => ({
  ReaderSidePanel: ({ reading }: { reading: PaperReading | null }) => (
    <ul className="notes">{reading?.notes.map((note) => <li key={note.id}>{note.text}</li>)}</ul>
  ),
}))

const { Reader } = await import('./Reader.js')

const note = (id: string, text: string) => ({ id, page: 1, text, created: '2026-10-18', updated: '2026-10-18' })

describe('Reader', () => {
  let root: Root
  let host: HTMLDivElement

  const render = async () => {
    await act(async () => { root.render(<MessagesProvider><Reader /></MessagesProvider>) })
  }
  const notes = () => [...host.querySelectorAll('.notes li')].map((li) => li.textContent)

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    shell.revision = 0
    shell.reading = { paperId: 'paper-1', highlights: [], notes: [note('note-1', '留着的')], remark: '' }
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it('缩放到上限或下限时那一侧的按钮变淡，点百分比回到 100%', async () => {
    await render()
    const button = (title: string) => host.querySelector<HTMLButtonElement>(`.zoomctl [title="${title}"]`)!
    const shown = () => button('Reset zoom').textContent
    const press = async (title: string, times: number) => {
      for (let n = 0; n < times; n += 1) await act(async () => { button(title).click() })
    }
    await press('Zoom in', 7)
    expect([shown(), button('Zoom in').disabled, button('Zoom out').disabled]).toEqual(['240%', true, false])
    await press('Reset zoom', 1)
    expect(shown()).toBe('100%')
    await press('Zoom out', 2)
    expect([shown(), button('Zoom in').disabled, button('Zoom out').disabled]).toEqual(['60%', false, true])
  })

  it('别处的写(在最近变动里撤销一条)之后重取阅读记录,放回来的笔记出现在侧栏', async () => {
    await render()
    expect(notes()).toEqual(['留着的'])

    shell.reading = { ...shell.reading, notes: [note('note-0', '撤销放回来的'), ...shell.reading.notes] }
    shell.revision = 1
    await render()
    expect(notes()).toEqual(['撤销放回来的', '留着的'])
  })
})
