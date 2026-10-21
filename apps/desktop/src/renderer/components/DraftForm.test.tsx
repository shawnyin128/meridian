// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'
import { DraftForm, DraftLine } from './DraftForm.js'
import { ChoicePicker } from './FieldPickers.js'
import { FormInput, FormTextarea } from './FormControls.js'

describe('DraftForm', () => {
  let host: HTMLDivElement
  let root: Root
  let resolveSave: (() => void) | null = null
  const onSave = vi.fn(() => new Promise<void>((done) => { resolveSave = done }))
  const onCancel = vi.fn()
  const outside = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    vi.clearAllMocks()
    host = document.createElement('div')
    document.body.append(host)
    document.addEventListener('keydown', outside)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    document.removeEventListener('keydown', outside)
    host.remove()
    vi.unstubAllGlobals()
  })

  const show = ({ title = 'Draft trees', body = '', destination }: { title?: string; body?: string; destination?: string } = {}) => act(() => root.render(
    <MessagesProvider>
      <DraftForm
        {...(destination === undefined ? {} : { destination })}
        canSave={title !== '' && body !== ''} onSave={onSave} onCancel={onCancel}
      >
        {(invalid) => (
          <>
            <FormInput aria-label="title" value={title} aria-invalid={invalid(title === '')} onChange={() => {}} />
            <DraftLine label="kind">
              <ChoicePicker appearance="field" aria-label="kind" value="a" options={['a', 'b']} onPick={() => {}} />
            </DraftLine>
            <FormTextarea aria-label="body" value={body} aria-invalid={invalid(body === '')} onChange={() => {}} />
          </>
        )}
      </DraftForm>
    </MessagesProvider>,
  ))
  const field = (name: string) => host.querySelector<HTMLElement>(`[aria-label="${name}"]`)!
  const press = (target: Element, init: KeyboardEventInit) => act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }))
  })
  const buttons = () => [...host.querySelectorAll<HTMLButtonElement>('.draft-form-foot button')]

  it('opens with its first field focused, the caret after its text, and 取消 and 保存 at its foot', () => {
    show()
    const title = field('title') as HTMLInputElement
    expect(document.activeElement).toBe(title)
    expect(title.selectionStart).toBe('Draft trees'.length)
    expect(buttons().map((button) => button.textContent)).toEqual(['取消', '保存'])
  })

  it('saves on Enter in a one-line field and on ⌘Enter or Ctrl+Enter in a long text, where a plain Enter is a new line', () => {
    show({ body: 'Wide trees win' })
    press(field('body'), { key: 'Enter' })
    expect(onSave).not.toHaveBeenCalled()
    press(field('body'), { key: 'Enter', metaKey: true })
    expect(onSave).toHaveBeenCalledOnce()
    act(() => resolveSave!())
    press(field('body'), { key: 'Enter', ctrlKey: true })
    press(field('title'), { key: 'Enter' })
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('sends one save until it settles, holding both buttons meanwhile', async () => {
    show({ body: 'Wide trees win' })
    press(field('title'), { key: 'Enter' })
    press(field('title'), { key: 'Enter' })
    expect(onSave).toHaveBeenCalledOnce()
    expect(buttons().map((button) => button.disabled)).toEqual([true, true])
    await act(async () => { resolveSave!(); await Promise.resolve() })
    expect(buttons().map((button) => button.disabled)).toEqual([false, false])
    press(field('title'), { key: 'Enter' })
    expect(onSave).toHaveBeenCalledTimes(2)
  })

  it('refuses a save by key while a field is missing: 保存 is held and the empty field takes the refused look', () => {
    show()
    expect(buttons()[1]!.disabled).toBe(true)
    expect(field('body').hasAttribute('aria-invalid')).toBe(false)
    press(field('title'), { key: 'Enter' })
    expect(onSave).not.toHaveBeenCalled()
    expect([field('title').hasAttribute('aria-invalid'), field('body').getAttribute('aria-invalid')]).toEqual([false, 'true'])
  })

  it('cancels on Escape or 取消, and Escape goes no further than the draft', () => {
    show()
    press(field('kind'), { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledOnce()
    expect(outside).not.toHaveBeenCalled()
    act(() => buttons()[0]!.click())
    expect(onCancel).toHaveBeenCalledTimes(2)
  })

  it('leaves Enter and Escape to an input method while it composes', () => {
    show({ body: 'Wide trees win' })
    press(field('title'), { key: 'Enter', isComposing: true })
    press(field('body'), { key: 'Enter', metaKey: true, isComposing: true })
    press(field('title'), { key: 'Escape', isComposing: true })
    expect(onSave).not.toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('leaves the keys of a menu opened from a field to that menu', async () => {
    show({ body: 'Wide trees win' })
    /** Opens the field's menu, which is portaled out of the draft, and returns its first item. */
    const openMenu = async () => {
      await act(async () => {
        field('kind').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
        await Promise.resolve()
      })
      return document.querySelector<HTMLElement>('[role="menuitemradio"]')!
    }
    const item = await openMenu()
    expect(host.contains(item)).toBe(false)
    press(item, { key: 'Escape' })
    expect(document.querySelector('[role="menuitemradio"]')).toBeNull()
    press(await openMenu(), { key: 'Enter' })
    expect(onSave).not.toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('leaving it cancels only a draft its host calls empty, and a press on the control that opens it is not leaving', () => {
    const entry = { current: null as HTMLButtonElement | null }
    const render = (empty?: boolean) => act(() => root.render(
      <MessagesProvider>
        <button type="button" className="outside">x</button>
        <button type="button" className="entry" ref={(node) => { entry.current = node }}>+</button>
        <DraftForm
          {...(empty === undefined ? {} : { empty, triggers: [entry] })}
          canSave={false} onSave={onSave} onCancel={onCancel}
        >
          {() => <FormInput aria-label="title" value="" onChange={() => {}} />}
        </DraftForm>
      </MessagesProvider>,
    ))
    const pressOn = (selector: string) => act(() => {
      host.querySelector(selector)!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    })
    render()
    pressOn('.outside')
    render(false)
    pressOn('.outside')
    expect(onCancel).not.toHaveBeenCalled()
    render(true)
    pressOn('.entry')
    expect(onCancel).not.toHaveBeenCalled()
    pressOn('.outside')
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('sets a line\'s label in the label column and the fields after it in one box', () => {
    show()
    const line = host.querySelector('.draft-form-line')!
    expect([...line.children].map((part) => [part.className, part.textContent])).toEqual([['draft-form-label', 'kind'], ['draft-form-fields', 'a']])
  })

  it('names where the item lands after an arrow, on a card of its own, only when that is elsewhere', () => {
    show()
    expect(host.querySelector('.draft-form-destination')).toBeNull()
    expect(host.querySelector('.card-surface')).toBeNull()
    show({ destination: '想法' })
    expect(host.querySelector('.card-surface > .draft-form > .draft-form-destination')!.textContent).toBe('→想法')
  })
})
