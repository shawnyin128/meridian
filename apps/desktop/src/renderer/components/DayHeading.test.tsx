import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DayHeading } from './DayHeading.js'

describe('DayHeading', () => {
  it('is one grey line without a rule', () => {
    const html = renderToStaticMarkup(<DayHeading>昨天</DayHeading>)
    expect(html).toBe('<div class="day-heading">昨天</div>')
  })

  it('appends a count when the caller has one', () => {
    const html = renderToStaticMarkup(<DayHeading count={3}>今天</DayHeading>)
    expect(html).toContain('今天')
    expect(html).toContain('· 3')
  })
})
