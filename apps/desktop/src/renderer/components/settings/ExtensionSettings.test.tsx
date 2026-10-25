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

  it('keeps the command compact, copies independently, and expands details on demand', () => {
    const copy = vi.fn()
    act(() => root.render(
      <MessagesProvider>
        <ExtensionSettings statuses={[extension]} failed={false} onCopy={copy} onCopyPrompt={vi.fn()} />
      </MessagesProvider>,
    ))
    const toggle = host.querySelector<HTMLButtonElement>('.card-tray-toggle')!
    const copyButton = host.querySelector<HTMLButtonElement>('.card-tray-action button')!
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    act(() => copyButton.click())
    expect(copy).toHaveBeenCalledWith('Codex', extension.installCommand)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    act(() => toggle.click())
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(host.querySelector('.extension-command-code')?.textContent).toBe(extension.installCommand)
  })

  it('names each extension and the tutorial without sentences explaining them', () => {
    act(() => root.render(
      <MessagesProvider>
        <ExtensionSettings
          statuses={[extension]} failed={false} onCopy={vi.fn()} onCopyPrompt={vi.fn()}
          plugin={{ plugin: { version: '0.0.9', checkedAt: null }, checking: false, onCheck: vi.fn() }}
        />
      </MessagesProvider>,
    ))
    expect([...host.querySelectorAll('.extension-head p')].map((p) => p.textContent))
      .toEqual(['Not checked online yet'])
    expect(host.querySelector('[data-extension-tutorial] > .section-heading + p')).toBeNull()
    expect(host.querySelector('.extension-tutorial-steps li p')).toBeNull()
  })

  it('shows workflow guidance and copies the selected prompt without exposing tool syntax', () => {
    const copyPrompt = vi.fn()
    act(() => root.render(
      <MessagesProvider>
        <ExtensionSettings statuses={[extension]} failed={false} onCopy={vi.fn()} onCopyPrompt={copyPrompt} />
      </MessagesProvider>,
    ))

    expect(host.querySelector('[data-extension-tutorial]')?.textContent)
      .toContain('Use Meridian with a coding agent')
    expect(host.querySelectorAll('.extension-tutorial-steps')).toHaveLength(1)
    expect(host.querySelectorAll('.extension-prompt-group')).toHaveLength(4)
    expect(host.querySelectorAll('.extension-prompt')).toHaveLength(10)
    const firstPrompt = host.querySelector('.extension-prompt .item-meta')?.textContent ?? ''
    act(() => host.querySelector<HTMLButtonElement>('.extension-prompt button')!.click())
    expect(copyPrompt).toHaveBeenCalledWith(firstPrompt)
    expect(firstPrompt).not.toContain('meridian.context')
  })
})
