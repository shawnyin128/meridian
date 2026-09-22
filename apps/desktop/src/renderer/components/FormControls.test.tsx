// @vitest-environment jsdom
import { createRef } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'
import { DirectoryField, FormButton, FormInput, FormSelect, FormTextarea } from './FormControls.js'

describe('FormControls', () => {
  beforeEach(() => { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh') })

  it('keeps the shared geometry class alongside a feature class', () => {
    const html = renderToStaticMarkup(<FormInput className="workspace-input" value="项目" readOnly />)
    expect(html).toContain('class="form-control form-input form-control-plain workspace-input"')
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
    expect(choosing).toContain('title="正在检查论文库目录"')
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
