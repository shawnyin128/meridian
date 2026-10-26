// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { NavRow } from './NavRow.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const noop = () => undefined

describe('NavRow', () => {
  it('is one button holding its glyph, its text and its count in that order, and carries the selected state', () => {
    expect(renderToStaticMarkup(
      <NavRow icon={<svg />} count={3} selected data-desk="papers" onActivate={noop}>论文</NavRow>,
    )).toBe('<button type="button" class="nav-row on" data-desk="papers"><span class="nav-row-icon"><svg></svg></span>论文'
      + '<span class="count-badge nav-row-count">3</span></button>')
  })

  it('shows no count of 0 or one not known yet', () => {
    expect(renderToStaticMarkup(<NavRow count={0} onActivate={noop}>垃圾桶</NavRow>)).not.toContain('count-badge')
    expect(renderToStaticMarkup(<NavRow count={null} onActivate={noop}>论文</NavRow>)).not.toContain('count-badge')
  })

  it('sits a step in under its group, a second step in with the smaller text of one item, and turns grey when what it opens is paused', () => {
    const classOf = (row: string) => /class="([^"]*)"/.exec(row)![1]
    expect(classOf(renderToStaticMarkup(<NavRow indent={1} onActivate={noop}>发现</NavRow>))).toBe('nav-row nav-row--indent-1')
    expect(classOf(renderToStaticMarkup(<NavRow indent={2} sub dim onActivate={noop}>mixture of experts</NavRow>)))
      .toBe('nav-row nav-row--indent-2 nav-row--sub dim')
  })

  it('keeps a row with controls of its own a div, so no button is nested in another, and a click elsewhere on it opens it', () => {
    expect(renderToStaticMarkup(
      <NavRow className="chat-row" actions={<button type="button">…</button>} onActivate={noop}>讨论</NavRow>,
    )).toBe('<div class="nav-row nav-row--actions chat-row"><button type="button" class="nav-row-label">讨论</button><button type="button">…</button></div>')
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    const open = vi.fn()
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => root.render(<NavRow actions={<span className="slot" />} onActivate={open}>讨论</NavRow>))
    act(() => { host.querySelector<HTMLElement>('.slot')!.click() })
    expect(open).toHaveBeenCalledTimes(1)
    act(() => root.unmount())
    host.remove()
  })

  it('puts the field its name is renamed in where its label button was, so no field sits inside a button', () => {
    expect(renderToStaticMarkup(
      <NavRow icon={<svg />} className="chat-row" actions={<button type="button">…</button>} editor={<input aria-label="对话名称" />} onActivate={noop}>讨论</NavRow>,
    )).toBe('<div class="nav-row nav-row--actions chat-row"><span class="nav-row-label"><span class="nav-row-icon"><svg></svg></span>'
      + '<input aria-label="对话名称"/></span><button type="button">…</button></div>')
  })

  it('puts the fold of the group under a row right after its label, and its count at its end', () => {
    const markup = renderToStaticMarkup(
      <NavRow
        count={4} onActivate={noop}
        fold={{ label: '收起/展开「论文推送」', open: false, onToggle: noop, controls: 'g-inboxsub' }}
      >论文推送</NavRow>,
    )
    const [label, fold, rest] = markup.split('</button>')
    expect(label).toBe('<div class="nav-row"><button type="button" class="nav-row-label">论文推送')
    expect(fold).toMatch(/^<button [^>]*class="icbtn xs fold-toggle"[^>]*><span class="fold-caret is-closed"/)
    expect(['aria-label="收起/展开「论文推送」"', 'aria-expanded="false"', 'aria-controls="g-inboxsub"'].filter((held) => !fold!.includes(held)))
      .toEqual([])
    expect(rest).toBe('<span class="count-badge nav-row-count">4</span></div>')
  })

  it('is the fold toggle itself when it opens nothing: its caret follows its text, its count ends it', () => {
    const markup = renderToStaticMarkup(
      <NavRow indent={1} count={2} fold={{ open: true, onToggle: noop, controls: 'g-topics' }} data-disc="topics">关注·关键词</NavRow>,
    )
    expect(markup).toMatch(/^<button data-disc="topics" type="button" class="fold-toggle nav-row nav-row--indent-1" aria-expanded="true" aria-controls="g-topics">/)
    expect(markup).toMatch(/>关注·关键词<span class="fold-caret"[^>]*>.*<\/span><span class="count-badge nav-row-count">2<\/span><\/button>$/)
  })
})
