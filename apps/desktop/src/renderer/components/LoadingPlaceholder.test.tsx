import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MessagesProvider } from '../messages/useMessages.js'
import { LoadingPlaceholder } from './LoadingPlaceholder.js'

const markup = (node: ReactNode) => renderToStaticMarkup(<MessagesProvider>{node}</MessagesProvider>)

describe('LoadingPlaceholder', () => {
  it('按结果的形状画灰块，不写字，读屏读出正在载入', () => {
    const html = markup(<LoadingPlaceholder shape="rows" count={4} />)
    expect(html).toContain('class="loading-placeholder loading-placeholder--rows"')
    expect(html).toContain('role="status"')
    expect(html).toMatch(/aria-label="(正在载入…|Loading…)"/)
    expect(html.match(/<span><\/span>/g)).toHaveLength(4)
    expect(html.replace(/<[^>]+>/g, '')).toBe('')
  })

  it('文档页的形状永远只有一页', () => {
    const html = markup(<LoadingPlaceholder shape="sheet" count={5} />)
    expect(html.match(/<span><\/span>/g)).toHaveLength(1)
  })
})
