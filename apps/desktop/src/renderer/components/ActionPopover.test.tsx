// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ActionPopover, type ActionPopoverProps } from './ActionPopover.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

describe('ActionPopover', () => {
  let root: Root | null = null

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    document.body.innerHTML = ''
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    if (root !== null) act(() => root!.unmount())
    root = null
  })

  /** The class list of the open popover's surface, given the props a host passes beside the trigger. */
  const surface = (props: Pick<ActionPopoverProps, 'surface' | 'contentClassName'>) => {
    act(() => root!.render(<ActionPopover open trigger={<button type="button">列设置</button>} {...props}>内容</ActionPopover>))
    return document.querySelector('[role="dialog"]')!.className
  }

  it('lies on the menu surface, which a form, a toolbar or a text editor turns into its own look under the classes a host adds', () => {
    expect([
      surface({}),
      surface({ surface: 'form', contentClassName: 'colpop' }),
      surface({ surface: 'toolbar', contentClassName: 'selection-tools' }),
      surface({ surface: 'editor' }),
    ]).toEqual(['ctxmenu', 'ctxmenu ctxmenu--form colpop', 'ctxmenu ctxmenu--toolbar selection-tools', 'ctxmenu ctxmenu--editor'])
  })
})
