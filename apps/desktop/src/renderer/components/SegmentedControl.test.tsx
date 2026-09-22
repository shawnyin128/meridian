import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SegmentedControl } from './SegmentedControl.js'

describe('SegmentedControl', () => {
  it('exposes one selected peer view without changing button geometry', () => {
    const html = renderToStaticMarkup(
      <SegmentedControl
        label="审核视图"
        value="structured"
        options={[
          { value: 'structured', label: '结构化审核' },
          { value: 'markdown', label: 'Markdown 编辑' },
        ]}
        onChange={() => undefined}
      />,
    )
    expect(html).toContain('role="group"')
    expect(html).toContain('aria-label="审核视图"')
    expect(html.match(/aria-pressed=/g)).toHaveLength(2)
    expect(html).toContain('aria-pressed="true" class="on"')
  })

  it('renders every option as a pill button, with the selected one filled', () => {
    const html = renderToStaticMarkup(
      <SegmentedControl
        label="排序" value="latest"
        options={[
          { value: 'recommended', label: '推荐' },
          { value: 'latest', label: '最新' },
        ]}
        onChange={() => undefined}
      />,
    )
    // The pill row has no enclosing track: the group is a bare flex row.
    expect(html).toContain('class="segmented-control segmented-control--md"')
    expect(html).toContain('aria-pressed="true" class="on"')
    expect(html.match(/<button/g)).toHaveLength(2)
  })

  it('accepts a tighter size without changing the selected-state contract', () => {
    const html = renderToStaticMarkup(
      <SegmentedControl
        label="每页条数" size="sm" value="10"
        options={[{ value: '10', label: '10 / 页' }, { value: '20', label: '20 / 页' }]}
        onChange={() => undefined}
      />,
    )
    expect(html).toContain('class="segmented-control segmented-control--sm"')
    expect(html).toContain('aria-pressed="true" class="on"')
  })

  it('passes a per-option tooltip through', () => {
    const html = renderToStaticMarkup(
      <SegmentedControl
        label="分组" value="none"
        options={[{ value: 'none', label: '无', title: '不分组' }]}
        onChange={() => undefined}
      />,
    )
    expect(html).toContain('title="不分组"')
  })
})
