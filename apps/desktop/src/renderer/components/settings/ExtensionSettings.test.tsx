// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExtensionStatus } from '../../../shared/contract.js'
import { MessagesProvider } from '../../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../../shell/language.js'
import { ExtensionSettings } from './ExtensionSettings.js'

const extension: ExtensionStatus = {
  id: 'codex',
  name: 'Codex',
  state: 'not-installed',
  installCommand: 'codex plugin install meridian',
  updateCommand: 'codex plugin update meridian',
}

describe('ExtensionSettings', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    // FadeText measures whether its text fits, and jsdom has no ResizeObserver.
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en')
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it('keeps the command compact, copies independently, and expands details on demand', async () => {
    const copy = vi.fn(async () => true)
    act(() => root.render(
      <MessagesProvider>
        <ExtensionSettings statuses={[extension]} failed={false} onCopy={copy} />
      </MessagesProvider>,
    ))
    const toggle = host.querySelector<HTMLButtonElement>('.card-tray-toggle')!
    const copyButton = host.querySelector<HTMLButtonElement>('.card-tray-action button')!
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    await act(async () => { copyButton.click() })
    expect(copy).toHaveBeenCalledWith(extension.installCommand)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    act(() => toggle.click())
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(host.querySelector('.extension-command-code')?.textContent).toBe(extension.installCommand)
  })

  it('names each extension and the tutorial without sentences explaining them', () => {
    act(() => root.render(
      <MessagesProvider>
        <ExtensionSettings
          statuses={[extension]} failed={false} onCopy={vi.fn(async () => true)}
          plugin={{ plugin: { version: '0.0.9', checkedAt: null }, checking: false, onCheck: vi.fn() }}
        />
      </MessagesProvider>,
    ))
    expect([...host.querySelectorAll('.extension-head p')].map((p) => p.textContent))
      .toEqual(['Not checked online yet'])
    expect(host.querySelector('[data-extension-tutorial] > .section-heading + p')).toBeNull()
    expect(host.querySelector('.extension-tutorial-steps li p')).toBeNull()
  })

  it('lists the ten prompts as one-line rows under their groups, without tutorial steps or a list of what an agent does', async () => {
    const copy = vi.fn(async () => true)
    act(() => root.render(
      <MessagesProvider>
        <ExtensionSettings statuses={[extension]} failed={false} onCopy={copy} />
      </MessagesProvider>,
    ))

    const tutorial = host.querySelector('[data-extension-tutorial]')!
    expect([tutorial.querySelector('.section-heading')?.textContent, tutorial.querySelectorAll('ol, ul, h4').length])
      .toEqual(['Use Meridian with a coding agent', 0])
    expect(host.querySelectorAll('.extension-prompt-group')).toHaveLength(4)
    expect(host.querySelectorAll('.extension-prompt')).toHaveLength(10)
    const first = host.querySelector('.extension-prompt')!
    expect([...first.children].map((cell) => cell.tagName)).toEqual(['STRONG', 'P', 'BUTTON'])
    expect(first.querySelector('p > .fade-text')).not.toBeNull()
    const firstPrompt = first.querySelector('p')?.textContent ?? ''
    await act(async () => { first.querySelector<HTMLButtonElement>('button')!.click() })
    expect(copy).toHaveBeenCalledWith(firstPrompt)
    expect(firstPrompt).not.toContain('meridian.context')
  })

  it('turns a copy button into the check once its text is on the clipboard, and leaves it alone when copying failed', async () => {
    let copied = true
    act(() => root.render(
      <MessagesProvider>
        <ExtensionSettings statuses={[extension]} failed={false} onCopy={async () => copied} />
      </MessagesProvider>,
    ))
    const prompt = () => host.querySelector<HTMLButtonElement>('.extension-prompt button')!
    await act(async () => { prompt().click() })
    expect([prompt().querySelector('svg') !== null, prompt().getAttribute('aria-label')]).toEqual([true, 'Copied'])
    copied = false
    const command = () => host.querySelector<HTMLButtonElement>('.card-tray-action button')!
    await act(async () => { command().click() })
    expect(command().querySelector('svg')).toBeNull()
  })
})
