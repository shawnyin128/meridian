// @vitest-environment jsdom
import { act, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PickRow } from './PickRow.js'
import type { PickHit } from './PickRow.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const HIT: PickHit = { id: 'h1', title: '候选一' }

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
  const host = document.createElement('div')
  document.body.appendChild(host)
  act(() => {
    createRoot(host).render(<Probe onPick={onPick} onCancel={onCancel} hits={hits} cancelOnLeave={cancelOnLeave} />)
  })
  return host
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
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    document.body.innerHTML = ''
  })

  it('鼠标点选发起的写还在路上时,再点一次候选不发第二次', async () => {
    let settle = (consumed: boolean) => { void consumed }
    const onPick = vi.fn(() => new Promise<boolean>((ok) => { settle = ok }))
    const onCancel = vi.fn()
    mount(onPick, onCancel)
    await flush() // The candidate arrives right after mounting, without typing

    const hit = document.querySelector<HTMLLIElement>('.pickhits li')!
    await act(async () => { hit.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
    await act(async () => { hit.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
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

    const hit = document.querySelector<HTMLLIElement>('.pickhits li')!
    await act(async () => { hit.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })

    const outside = document.createElement('button')
    document.body.appendChild(outside)
    await act(async () => { outside.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })) })
    expect(onCancel).not.toHaveBeenCalled()

    await act(async () => { settle(true) })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('论文候选的标题按 LaTeX 显示，其他候选原样显示', async () => {
    mount(vi.fn(), vi.fn(), [
      { id: 'p1', title: '\\textbf{F}luxBin $\\times$', paper: true }, { id: 't1', title: 'a--b \\textbf{c}' },
    ])
    await flush()

    const [paper, topic] = [...document.querySelectorAll('.pickhits li')]
    expect(paper!.innerHTML).toMatch(/^<strong>F<\/strong>luxBin <span><span class="katex">/)
    expect(topic!.innerHTML).toBe('a--b \\textbf{c}')
  })
})
