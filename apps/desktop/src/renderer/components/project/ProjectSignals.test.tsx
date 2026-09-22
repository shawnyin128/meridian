// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { MessagesProvider } from '../../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../../shell/language.js'
import { ProjectSignalDate, ProjectSignalKind } from './ProjectSignals.js'

describe('ProjectSignals', () => {
  beforeEach(() => { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh') })

  it('keeps type and date in stable shared columns', () => {
    const type = renderToStaticMarkup(<ProjectSignalKind tone="bad">任务逾期</ProjectSignalKind>)
    const date = renderToStaticMarkup(
      <MessagesProvider><ProjectSignalDate date="2026-09-16" /></MessagesProvider>,
    )
    const emptyDate = renderToStaticMarkup(
      <MessagesProvider><ProjectSignalDate date={undefined} /></MessagesProvider>,
    )

    expect(type).toContain('class="project-signal-kind"')
    expect(type).toContain('class="ak bad"')
    expect(date).toContain('class="project-signal-date"')
    expect(date).toContain('class="date-chip"')
    expect(emptyDate).toBe('<span class="project-signal-date"></span>')
  })
})
