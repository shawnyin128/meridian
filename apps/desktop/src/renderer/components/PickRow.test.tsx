// @vitest-environment jsdom
import { act, useRef, useState, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDrafts } from '../hooks/useDrafts.js'
import { PickRow } from './PickRow.js'
import type { PickHit } from './PickRow.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const HIT: PickHit = { id: 'h1', title: '候选一' }

// Every root a test mounts, unmounted after it so no listener outlives the test's document.
const roots: Root[] = []

/** Renders `element` into a new host in the document, inside act, and returns the host. */
function render(element: ReactNode): HTMLDivElement {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => { root.render(element) })
  return host
}

/**
 * Mounts a real PickRow: the outer div is the draft `row`, no triggers, and `hits` are the
 * candidates; `cancelOnLeave` goes to PickRow as is.
 */
function Probe({ onPick, onCancel, hits, cancelOnLeave = false }: {
  onPick: (hit: PickHit) => boolean | Promise<boolean>
  onCancel: () => void
  hits: PickHit[]
  cancelOnLeave?: boolean
}) {
  const row = useRef<HTMLDivElement>(null)
  return (
    <div ref={row}>
      <PickRow
        row={row} triggers={[]} placeholder="挑一个"
        suggest={() => Promise.resolve(hits)} allowNew={false}
        onPick={onPick} onNew={() => false} onCancel={onCancel} onError={() => {}}
        cancelOnLeave={cancelOnLeave}
      />
    </div>
  )
}

/** Mounts Probe into a real container and returns its host element. */
function mount(
  onPick: (hit: PickHit) => boolean | Promise<boolean>, onCancel: () => void, hits = [HIT], cancelOnLeave = false,
): HTMLDivElement {
  return render(<Probe onPick={onPick} onCancel={onCancel} hits={hits} cancelOnLeave={cancelOnLeave} />)
}

/** Types `value` into the draft input and lets the candidates catch up with it. */
async function type(value: string): Promise<void> {
  const input = document.querySelector<HTMLInputElement>('input')!
  act(() => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await flush()
}

/** Presses the mouse on a button outside the draft. */
async function pressOutside(): Promise<void> {
  const outside = document.createElement('button')
  document.body.appendChild(outside)
  await act(async () => { outside.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })) })
}

/** Drains this round of microtasks so the candidate promises resolve. */
async function flush(): Promise<void> {
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
}

describe('PickRow', () => {
  beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }) })
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    document.body.innerHTML = ''
  })

  afterEach(() => {
    act(() => { for (const root of roots.splice(0)) root.unmount() })
  })

  it('鼠标点选发起的写还在路上时,再点一次候选不发第二次', async () => {
    let settle = (consumed: boolean) => { void consumed }
    const onPick = vi.fn(() => new Promise<boolean>((ok) => { settle = ok }))
    const onCancel = vi.fn()
    mount(onPick, onCancel)
    await flush() // The candidate arrives right after mounting, without typing

    const hit = document.querySelector<HTMLElement>('.pickhits .rrow')!
    await act(async () => { hit.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    await act(async () => { hit.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(onPick).toHaveBeenCalledTimes(1)

    await act(async () => { settle(true) })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('打了字点到占位外,像回车一样选中高亮的候选;空着离开只收起', async () => {
    const onPick = vi.fn(() => true)
    const onCancel = vi.fn()
    mount(onPick, onCancel)
    await flush()

    await pressOutside()
    expect(onPick).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalledTimes(1)

    await type('候选')
    await pressOutside()
    expect(onPick).toHaveBeenCalledWith(HIT)
    expect(onCancel).toHaveBeenCalledTimes(2)
  })

  it('cancelOnLeave 时打了字离开也只收起,不选', async () => {
    const onPick = vi.fn(() => true)
    const onCancel = vi.fn()
    mount(onPick, onCancel, [HIT], true)
    await type('候选')

    await pressOutside()
    expect(onPick).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('鼠标点选发起的写还在路上时,点到占位外不放弃', async () => {
    let settle = (consumed: boolean) => { void consumed }
    const onPick = vi.fn(() => new Promise<boolean>((ok) => { settle = ok }))
    const onCancel = vi.fn()
    mount(onPick, onCancel)
    await flush()

    const hit = document.querySelector<HTMLElement>('.pickhits .rrow')!
    await act(async () => { hit.dispatchEvent(new MouseEvent('click', { bubbles: true })) })

    const outside = document.createElement('button')
    document.body.appendChild(outside)
    await act(async () => { outside.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })) })
    expect(onCancel).not.toHaveBeenCalled()

    await act(async () => { settle(true) })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('指针移到哪一行,哪一行就是唯一高亮的当前行,方向键从它起步,回车选它', async () => {
    const hits = [HIT, { id: 'h2', title: '候选二' }, { id: 'h3', title: '候选三' }]
    const onPick = vi.fn(() => true)
    mount(onPick, vi.fn(), hits)
    await flush()

    const rows = () => [...document.querySelectorAll<HTMLElement>('.pickhits .rrow')]
    const lit = () => rows().map((row) => row.classList.contains('on'))
    await act(async () => { rows()[2]!.dispatchEvent(new MouseEvent('mousemove', { bubbles: true })) })
    expect(lit()).toEqual([false, false, true])

    const input = document.querySelector<HTMLInputElement>('input')!
    await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })) })
    expect(lit()).toEqual([false, true, false])
    await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
    expect(onPick).toHaveBeenCalledExactlyOnceWith(hits[1])
  })

  it('论文候选的标题按 LaTeX 显示，其他候选原样显示', async () => {
    mount(vi.fn(), vi.fn(), [
      { id: 'p1', title: '\\textbf{F}luxBin $\\times$', paper: true }, { id: 't1', title: 'a--b \\textbf{c}' },
    ])
    await flush()

    const [paper, topic] = [...document.querySelectorAll('.pickhits .rrow')]
    expect(paper!.innerHTML).toMatch(/^<strong>F<\/strong>luxBin <span><span class="katex">/)
    expect(topic!.innerHTML).toBe('a--b \\textbf{c}')
  })

  it('从给定的文字开始:输入框里就是它,候选按它来查,没有候选时回车把它当新名字交出去', async () => {
    const suggest = vi.fn((query: string) => { void query; return Promise.resolve<PickHit[]>([]) })
    const onNew = vi.fn(() => true)
    function Editing() {
      const row = useRef<HTMLDivElement>(null)
      return (
        <div ref={row}>
          <PickRow
            row={row} triggers={[]} placeholder="挑一个" initialText="树宽收益拐点"
            suggest={suggest} allowNew onPick={() => false} onNew={onNew} onCancel={() => {}} onError={() => {}}
          />
        </div>
      )
    }
    const host = render(<Editing />)
    await flush()

    const input = host.querySelector('input')!
    expect(input.value).toBe('树宽收益拐点')
    expect(suggest).toHaveBeenCalledWith('树宽收益拐点')
    await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
    expect(onNew).toHaveBeenCalledWith('树宽收益拐点')
  })

  it('从给定的文字开始时,没改就离开只收起;改了再离开像回车一样交出去;清空了离开也只收起', async () => {
    const onNew = vi.fn(() => true)
    const onCancel = vi.fn()
    function Editing() {
      const row = useRef<HTMLDivElement>(null)
      return (
        <div ref={row}>
          <PickRow
            row={row} triggers={[]} placeholder="挑一个" initialText="树宽收益拐点"
            suggest={() => Promise.resolve([])} allowNew
            onPick={() => false} onNew={onNew} onCancel={onCancel} onError={() => {}}
          />
        </div>
      )
    }
    render(<Editing />)
    await flush()

    await pressOutside()
    expect(onNew).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalledTimes(1)

    await type('树宽收益拐点 v2')
    await pressOutside()
    expect(onNew).toHaveBeenCalledWith('树宽收益拐点 v2')
    expect(onCancel).toHaveBeenCalledTimes(2)

    await type('')
    await pressOutside()
    expect(onNew).toHaveBeenCalledTimes(1)
    expect(onCancel).toHaveBeenCalledTimes(3)
  })

  it('is the inline field, the one in-place editor look of rows and cells', async () => {
    const host = mount(() => true, () => {})
    await flush()
    expect(host.querySelector('input')!.classList).toContain('form-control-inline')
  })

  it('keeps what is typed as a draft that a reopened row starts from, and drops it when the row closes', async () => {
    const onCancel = vi.fn()
    let show!: (open: boolean) => void
    /** A host that holds the drafts and shows the row while open. */
    function Host() {
      const drafts = useDrafts<string>(['project', 'p1', 'relation'])
      const row = useRef<HTMLDivElement>(null)
      const [open, setOpen] = useState(true)
      show = setOpen
      return open
        ? (
          <div ref={row}>
            <PickRow
              row={row} triggers={[]} placeholder="挑一个" suggest={() => Promise.resolve([])} allowNew={false}
              onPick={() => true} onNew={() => false} onCancel={onCancel} onError={() => {}}
              kept={{ drafts, target: 'add:Wiki' }}
            />
          </div>
        )
        : null
    }
    render(<Host />)
    await type('打了一半')
    act(() => show(false))
    act(() => show(true))
    await flush()
    const input = () => document.querySelector<HTMLInputElement>('input')!
    expect(input().value).toBe('打了一半')
    act(() => { input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(onCancel).toHaveBeenCalledOnce()
    act(() => show(false))
    act(() => show(true))
    expect(input().value).toBe('')
  })
})
