// @vitest-environment jsdom
import { act, createRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'
import { ColourField, DirectoryField, FieldRow, FieldRows, FormButton, FormInput, FormSelect, FormTextarea } from './FormControls.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

describe('FormControls', () => {
  beforeEach(() => { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh') })

  it('draws a boxed field unless the field asks to be inline, and keeps a feature class beside it', () => {
    const html = renderToStaticMarkup(<FormInput className="workspace-input" value="项目" readOnly />)
    expect(html).toContain('class="form-control form-input form-control-field workspace-input"')
    expect(renderToStaticMarkup(<FormTextarea defaultValue="笔记" />)).toContain('form-control-field')
  })

  it('preserves native input capabilities and refs', () => {
    const ref = createRef<HTMLInputElement>()
    const html = renderToStaticMarkup(<FormInput ref={ref} type="number" min={1} required />)
    expect(html).toContain('type="number"')
    expect(html).toContain('min="1"')
    expect(html).toContain('required=""')
  })

  it('gives textarea and select the same shared focus contract', () => {
    const textarea = renderToStaticMarkup(<FormTextarea defaultValue="笔记" />)
    const select = renderToStaticMarkup(<FormSelect defaultValue="a"><option value="a">A</option></FormSelect>)
    expect(textarea).toContain('form-control form-textarea')
    expect(select).toContain('form-control form-select')
  })

  it('adds the reusable boxed field appearance only when requested', () => {
    const input = renderToStaticMarkup(<FormInput appearance="field" value="模型" readOnly />)
    const select = renderToStaticMarkup(
      <FormSelect appearance="field" defaultValue="openai"><option value="openai">OpenAI</option></FormSelect>,
    )
    expect(input).toContain('form-control-field')
    expect(select).toContain('form-control-field')
  })

  it('provides one reusable neutral inline appearance for table and metadata editors', () => {
    const input = renderToStaticMarkup(<FormInput appearance="inline" value="2026" readOnly />)
    const select = renderToStaticMarkup(
      <FormSelect appearance="inline" defaultValue="未读"><option value="未读">未读</option></FormSelect>,
    )
    expect(input).toContain('form-control-inline')
    expect(select).toContain('form-control-inline')
  })

  it('an open in-place field fades only at an end that hides text, as the user scrolls or types; a boxed field never fades', async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const size = { width: 120, scroll: 300, left: 0 }
    /** Gives `input` the measures of a field `size.width` wide holding text `size.scroll` wide, scrolled by `size.left`. */
    const measure = (input: HTMLInputElement) => {
      Object.defineProperty(input, 'clientWidth', { configurable: true, get: () => size.width })
      Object.defineProperty(input, 'scrollWidth', { configurable: true, get: () => size.scroll })
      Object.defineProperty(input, 'scrollLeft', { configurable: true, get: () => size.left, set: (left: number) => { size.left = left } })
    }
    function Field({ value }: { value: string }) {
      return (
        <>
          <FormInput appearance="inline" aria-label="名字" value={value} readOnly ref={(input) => { if (input !== null) measure(input) }} />
          <FormInput aria-label="框" value={value} readOnly ref={(input) => { if (input !== null) measure(input) }} />
        </>
      )
    }
    const inline = () => host.querySelector<HTMLInputElement>('[aria-label="名字"]')!
    const boxed = () => host.querySelector<HTMLInputElement>('[aria-label="框"]')!
    const scrollTo = (left: number) => act(() => {
      size.left = left
      inline().dispatchEvent(new Event('scroll'))
    })
    act(() => root.render(<Field value="一个放不下的长名字" />))
    expect([inline().dataset['fade'], boxed().dataset['fade']]).toEqual(['right', undefined])
    scrollTo(90)
    expect(inline().dataset['fade']).toBe('left right')
    scrollTo(180)
    expect(inline().dataset['fade']).toBe('left')
    size.scroll = 120
    size.left = 0
    act(() => root.render(<Field value="短名字" />))
    expect(inline().dataset['fade']).toBeUndefined()
    act(() => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  })

  it('gives a chip being edited its own appearance, beside the feature class it keeps', () => {
    const input = renderToStaticMarkup(<FormInput appearance="chip" className="tagin" value="KV cache" readOnly />)
    expect(input).toContain('class="form-control form-input form-control-chip tagin"')
  })

  it('provides a field-shaped button for values that enter editing on activation', () => {
    const button = renderToStaticMarkup(<FormButton appearance="field">saved value</FormButton>)
    expect(button).toContain('class="form-control form-button form-control-field"')
    expect(button).toContain('type="button"')
  })

  it('keeps a directory path and its folder action inside one shared field', () => {
    const field = renderToStaticMarkup(
      <MessagesProvider><DirectoryField value="/Users/name/project" readOnly onChoose={() => {}} /></MessagesProvider>,
    )
    expect(field).toContain('class="directory-field"')
    expect(field).toContain('class="form-control form-input form-control-field"')
    expect(field).toContain('value="/Users/name/project"')
    expect(field).toContain('class="directory-field-action"')
    expect(field).toContain('aria-label="选择目录"')
    expect(field).toContain('M3 6h6l2 2h10v10H3z')
  })

  it('keeps chooser labels, busy state, and disabled state on the shared directory action', () => {
    const choosing = renderToStaticMarkup(
      <MessagesProvider>
        <DirectoryField
          value="/Users/name/project" readOnly choosing
          chooseLabel="正在检查论文库目录" onChoose={() => {}}
        />
      </MessagesProvider>,
    )
    expect(choosing).toContain('aria-busy="true"')
    expect(choosing).not.toContain('title=')
    expect(choosing).toContain('aria-label="正在检查论文库目录"')
    expect(choosing).toMatch(/directory-field-action[^>]*disabled=""/)
    expect(choosing).not.toMatch(/form-input[^>]*disabled=""/)

    const disabled = renderToStaticMarkup(
      <MessagesProvider><DirectoryField value="/Users/name/project" disabled onChoose={() => {}} /></MessagesProvider>,
    )
    expect(disabled).toMatch(/form-input[^>]*disabled=""/)
    expect(disabled).toMatch(/directory-field-action[^>]*disabled=""/)
  })
})

describe('FieldRow', () => {
  it('标签写在标签列,它是那一行文字栏位的标签:给栏位起名,点它就是点栏位;选择器不挂在标签上', () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => root.render(
      <FieldRows>
        <FieldRow label="主机"><FormInput /></FieldRow>
        <FieldRow label="正文"><FormTextarea /></FieldRow>
        <FieldRow label="基于"><FormButton>默认</FormButton></FieldRow>
        <FieldRow><FormInput id="own" /></FieldRow>
      </FieldRows>,
    ))
    const rows = [...host.querySelectorAll('.field-rows > .field-row')]
    expect(rows.map((row) => [...row.children].map((part) => part.className)))
      .toEqual([...Array(3)].map(() => ['field-row-label', 'field-row-field']).concat([['field-row-field']]))
    const [input, textarea] = [host.querySelector('input')!, host.querySelector('textarea')!]
    const labels = [...host.querySelectorAll('label')]
    expect([input.labels?.[0], textarea.labels?.[0]]).toEqual([labels[0], labels[1]])
    expect(host.querySelector('button')!.labels?.length).toBe(0)
    expect(host.querySelector('#own')).not.toBeNull()
    act(() => root.unmount())
  })
})

describe('ColourField', () => {
  /** Sets `input`'s value as typing does, so React sees the change. */
  const type = (input: HTMLInputElement, value: string) => act(() => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })

  it('色值框收 #RRGGBB、RRGGBB 和三位简写,带不带 # 都行、不分大小写,交给 onChange 的一律是 #rrggbb;别的写法不改颜色,离开时标成被拒', () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    const picked = vi.fn()
    function Host() {
      const [value, setValue] = useState('#3568ff')
      return <ColourField value={value} onChange={(next) => { picked(next); setValue(next) }} pickLabel="选取颜色" valueLabel="色值" />
    }
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => root.render(<Host />))
    const text = host.querySelector<HTMLInputElement>('input[aria-label="色值"]')!
    const picker = host.querySelector<HTMLInputElement>('input[type="color"][aria-label="选取颜色"]')!
    expect(text.value).toBe('#3568FF')

    for (const refused of ['red', '#35680G', '#3568f', '#35f0', '##35f', ' #35f', '3568ff0']) {
      act(() => text.focus())
      type(text, refused)
      act(() => text.blur())
      expect([text.value, text.getAttribute('aria-invalid')], refused).toEqual([refused, 'true'])
    }
    expect(picked).not.toHaveBeenCalled()
    expect(picker.value).toBe('#3568ff')

    for (const [typed, colour] of [['#A64436', '#a64436'], ['517d7b', '#517d7b'], ['#35F', '#3355ff'], ['fa0', '#ffaa00']] as const) {
      act(() => text.focus())
      type(text, typed)
      expect(picked, typed).toHaveBeenLastCalledWith(colour)
      expect([text.value, text.getAttribute('aria-invalid'), picker.value], typed).toEqual([typed, null, colour])
      act(() => text.blur())
      expect(text.value, typed).toBe(colour.toUpperCase())
    }

    act(() => text.focus())
    type(text, '35f')
    type(text, '35f0a0')
    expect(picked.mock.calls.slice(-2)).toEqual([['#3355ff'], ['#35f0a0']])
    expect(text.value).toBe('35f0a0')
    act(() => text.blur())

    type(picker, '#517d7b')
    expect(picked).toHaveBeenLastCalledWith('#517d7b')
    expect(text.value).toBe('#517D7B')
    act(() => root.unmount())
  })
})
