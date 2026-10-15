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

  it('starts from the address and name it is given, and submits them unchanged', async () => {
    act(() => root.render(
      <MessagesProvider>
        <div ref={scope}>
          <ProjectUrlDraft
            key="editing" row={scope} triggers={[]} initial={{ url: 'https://wandb.ai/team/run', text: 'Run board' }}
            onSubmit={onSubmit} onCancel={onCancel} onInvalid={onInvalid}
          />
        </div>
      </MessagesProvider>,
    ))
    const [address, label] = inputs()
    expect([address!.value, label!.value]).toEqual(['https://wandb.ai/team/run', 'Run board'])
    await enter(address!)
    expect(onSubmit).toHaveBeenCalledWith('https://wandb.ai/team/run', 'Run board')
  })

  it('closes an edit left unchanged or with its address cleared without submitting, and submits one left after a change', async () => {
    act(() => root.render(
      <MessagesProvider>
        <div ref={scope}>
          <ProjectUrlDraft
            key="editing" row={scope} triggers={[]} initial={{ url: 'https://wandb.ai/team/run', text: 'Run board' }}
            onSubmit={onSubmit} onCancel={onCancel} onInvalid={onInvalid}
          />
        </div>
      </MessagesProvider>,
    ))
    const outside = document.createElement('button')
    document.body.append(outside)
    const leave = () => act(async () => {
      outside.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
      await Promise.resolve()
    })
    const [address, label] = inputs()

    await leave()
    expect(onSubmit).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalledTimes(1)

    type(label!, 'Sweep board')
    await leave()
    expect(onSubmit).toHaveBeenCalledWith('https://wandb.ai/team/run', 'Sweep board')
    expect(onCancel).toHaveBeenCalledTimes(2)

    type(address!, '')
    await leave()
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onCancel).toHaveBeenCalledTimes(3)
    outside.remove()
  })

  it('names an address by dropping its scheme and trailing slash', () => {
    expect(urlDisplayName('http://example.com/')).toBe('example.com')
  })
})
