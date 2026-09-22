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

/** Hang a real PickRow: the placeholder is hung on the outer div, there are no triggers, and the candidate is always `HIT`. */
function Probe({ onPick, onCancel }: {
  onPick: (hit: PickHit) => boolean | Promise<boolean>
  onCancel: () => void
}) {
  const row = useRef<HTMLDivElement>(null)
  return (
    <div ref={row}>
      <PickRow
        row={row} triggers={[]} placeholder="挑一个"
        suggest={() => Promise.resolve([HIT])} allowNew={false}
        onPick={onPick} onNew={() => false} onCancel={onCancel} onError={() => {}}
      />
    </div>
  )
}

/** Hooks into a real container and returns its own host element. */
function mount(onPick: (hit: PickHit) => boolean | Promise<boolean>, onCancel: () => void): HTMLDivElement {
  const host = document.createElement('div')
  document.body.appendChild(host)
  act(() => { createRoot(host).render(<Probe onPick={onPick} onCancel={onCancel} />) })
  return host
}

/** Complete this round of microtasks and let the candidate promises be implemented. */
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
    await flush() // Get the candidate as soon as it is mounted, no need to type

    const hit = document.querySelector<HTMLLIElement>('.pickhits li')!
    await act(async () => { hit.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
    await act(async () => { hit.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
    expect(onPick).toHaveBeenCalledTimes(1)

    await act(async () => { settle(true) })
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
})
