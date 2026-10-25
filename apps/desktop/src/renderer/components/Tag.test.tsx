import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Tag, TagButton, tagClass } from './Tag.js'

describe('Tag', () => {
  it('draws a neutral label by default, its text in a span that fades out when cut off and names itself in the tooltip', () => {
    expect(renderToStaticMarkup(<Tag>进行中</Tag>))
      .toBe('<span class="tag tag--label tag--neutral"><span class="fade-text tag-text" data-state="closed">进行中</span></span>')
  })

  it('takes its fill from the tone and its box from the shape, and keeps a host class for placement', () => {
    const html = renderToStaticMarkup(<Tag tone="warn" shape="chip" className="ovlist-project" title="draft 效率">draft 效率</Tag>)
    expect(html).toContain('class="tag tag--chip tag--warn ovlist-project"')
    expect(html).toContain('title="draft 效率"')
  })

  it('puts a leading mark before the text, outside the span that fades', () => {
    const html = renderToStaticMarkup(<Tag lead={<i className="mark" />}>EAGLE-2</Tag>)
    expect(html).toBe('<span class="tag tag--label tag--neutral"><i class="mark"></i><span class="fade-text tag-text" data-state="closed">EAGLE-2</span></span>')
  })

  it('gives an element another component renders the same classes', () => {
    expect(tagClass('bad')).toBe('tag tag--label tag--bad')
    expect(tagClass('neutral', 'chip', 'stchip on')).toBe('tag tag--chip tag--neutral stchip on')
    expect(tagClass('ghost', 'chip')).toBe('tag tag--chip tag--ghost')
  })

  it('marks a tag whose placement caps its width, so it fades its long text there instead of yielding', () => {
    expect(renderToStaticMarkup(<Tag shape="chip" capped className="idea-relation-tag">Wiki · KV 量化</Tag>))
      .toContain('class="tag tag--chip tag--neutral tag--capped idea-relation-tag"')
    expect(renderToStaticMarkup(<TagButton capped>KV cache</TagButton>)).toContain('class="tag tag--label tag--neutral tag--capped"')
  })

  it('renders a clickable tag as a plain button with the same classes', () => {
    const html = renderToStaticMarkup(<TagButton shape="chip" data-wk="topics/kv" onClick={() => {}}>KV cache</TagButton>)
    expect(html).toBe('<button type="button" class="tag tag--chip tag--neutral" data-wk="topics/kv"><span class="fade-text tag-text" data-state="closed">KV cache</span></button>')
  })
})
