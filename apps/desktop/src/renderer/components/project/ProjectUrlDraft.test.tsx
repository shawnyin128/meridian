// @vitest-environment jsdom
import { act, createRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessagesProvider } from '../../messages/useMessages.js'
import { ProjectUrlDraft, urlDisplayName } from './ProjectSections.js'

describe('ProjectUrlDraft', () => {
  let host: HTMLDivElement
  let root: Root
  const onSubmit = vi.fn(() => true)
  const onInvalid = vi.fn()
  const onCancel = vi.fn()
  const scope = createRef<HTMLDivElement>()

  const inputs = () => [...host.querySelectorAll<HTMLInputElement>('input')]
  const type = (input: HTMLInputElement, value: string) => act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  const enter = (input: HTMLInputElement) => act(async () => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await Promise.resolve()
  })

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.clearAllMocks()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root.render(
      <MessagesProvider>
        <div ref={scope}>
          <ProjectUrlDraft row={scope} triggers={[]} onSubmit={onSubmit} onCancel={onCancel} onInvalid={onInvalid} />
        </div>
      </MessagesProvider>,
    ))
  })

  afterEach(() => { act(() => root.unmount()); host.remove() })

  it('submits the address with the typed display name from either field', async () => {
    const [address, label] = inputs()
    type(address!, 'https://wandb.ai/team/run')
    type(label!, 'Run board')
    await enter(label!)
    expect(onSubmit).toHaveBeenCalledWith('https://wandb.ai/team/run', 'Run board')
  })

  it('adds https to a bare address and names it after the address when no name is given', async () => {
    const [address] = inputs()
    type(address!, 'github.com/org/repo/')
    await enter(address!)
    expect(onSubmit).toHaveBeenCalledWith('https://github.com/org/repo/', 'github.com/org/repo')
  })

  it('reports an unparsable address instead of submitting it', async () => {
    const [address] = inputs()
    type(address!, 'https://')
    await enter(address!)
    expect(onSubmit).not.toHaveBeenCalled()
    expect(onInvalid).toHaveBeenCalledTimes(1)
  })

  it('names an address by dropping its scheme and trailing slash', () => {
    expect(urlDisplayName('http://example.com/')).toBe('example.com')
  })
})
