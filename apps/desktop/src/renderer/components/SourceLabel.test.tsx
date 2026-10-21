// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'
import { AgentLabel, SourceLabel } from './SourceLabel.js'

describe('SourceLabel', () => {
  beforeEach(() => window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh'))

  it('is a neutral label tag, never coloured by what it names', () => {
    expect(renderToStaticMarkup(<SourceLabel>主题 · speculative decoding</SourceLabel>))
      .toBe('<span class="tag tag--label tag--neutral source-label"><span class="fade-text tag-text" data-state="closed">主题 · speculative decoding</span></span>')
  })

  it('names any agent with one word, and adds where its work came from after a middle dot', () => {
    expect(renderToStaticMarkup(<MessagesProvider><AgentLabel /></MessagesProvider>)).toContain('>agent</span>')
    expect(renderToStaticMarkup(<MessagesProvider><AgentLabel source="实验" /></MessagesProvider>)).toContain('>agent · 实验</span>')
  })

  it('uses the interface language', () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en')
    expect(renderToStaticMarkup(<MessagesProvider><AgentLabel /></MessagesProvider>)).toContain('>Agent</span>')
  })
})
