// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { NavSection } from './NavSection.js'

describe('NavSection', () => {
  it('reads to a screen reader as a second-level heading, its fold toggle inside it and its action beside it', () => {
    const host = document.createElement('div')
    host.innerHTML = renderToStaticMarkup(
      <NavSection id="chats" title="对话" fold={{ open: true, onToggle: () => {} }} action={<button type="button">新对话</button>}>
        <p>行</p>
      </NavSection>,
    )
    const heading = host.querySelector('[role="heading"]')!
    expect([heading.getAttribute('aria-level'), heading.textContent]).toEqual(['2', '对话'])
    expect(heading.querySelector('[aria-expanded="true"]')).not.toBeNull()
    expect(heading.querySelector('.nav-section-action')).toBeNull()
  })
})
