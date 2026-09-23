import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AddAction } from './AddAction.js'
import {
  PageBody, PageError, PageFooter, PageHeader, PageShell, PageTitle, PageToolbar, SectionHeading,
} from './PageShell.js'
import { SegmentedControl } from './SegmentedControl.js'

describe('PageShell', () => {
  it('composes the canonical page regions without changing feature classes', () => {
    const html = renderToStaticMarkup(
      <PageShell className="paper-library">
        <PageHeader><PageTitle>论文</PageTitle></PageHeader>
        <PageBody className="libview"><PageToolbar>操作</PageToolbar>正文</PageBody>
        <PageFooter bare>分页</PageFooter>
      </PageShell>,
    )
    expect(html).toContain('class="desk paper-library"')
    expect(html).toContain('class="desk-head"')
    expect(html).toContain('class="t"')
    expect(html).toContain('class="desk-body libview"')
    expect(html).toContain('class="page-toolbar"')
    expect(html).toContain('class="desk-foot bare"')
  })

  it('renders errors and action headings through one contract', () => {
    const html = renderToStaticMarkup(
      <>
        <PageError error="打不开" />
        <SectionHeading actions={<button>新增</button>}>项目</SectionHeading>
        <SectionHeading variant="content">科研记录</SectionHeading>
        <SectionHeading variant="group">今日</SectionHeading>
      </>,
    )
    expect(html).toContain('class="ipcerror ipcerror--page" role="alert"')
    expect(renderToStaticMarkup(<PageError error="科研图读不了" variant="section" />))
      .toBe('<div class="ipcerror ipcerror--section" role="alert">科研图读不了</div>')
    expect(html).toContain('class="section-heading section-heading--page flexh"')
    expect(html).toContain('class="section-heading section-heading--content"')
    expect(html).toContain('class="section-heading section-heading--group"')
    expect(renderToStaticMarkup(<PageError error={null} />)).toBe('')
  })

  it('keeps peer-view switches and page actions in the shared content toolbar', () => {
    const html = renderToStaticMarkup(
      <PageToolbar>
        <SegmentedControl
          size="sm" label="View" value="list"
          options={[{ value: 'list', label: 'List' }, { value: 'map', label: 'Map' }]}
          onChange={() => undefined}
        />
        <AddAction variant="page">Import</AddAction>
      </PageToolbar>,
    )
    expect(html).toContain('class="page-toolbar"')
    expect(html).toContain('class="segmented-control segmented-control--sm"')
    expect(html).toContain('class="btn pri add-action add-action-page"')
  })

  it('gives the rail variant its own class and keeps actions in the shared slot', () => {
    const html = renderToStaticMarkup(
      <SectionHeading variant="rail" actions={<button>＋</button>}>关联</SectionHeading>,
    )
    expect(html).toContain('class="section-heading section-heading--rail flexh"')
    expect(html).toContain('<button>＋</button>')
  })

  it('styles the content variant without depending on an ancestor class', () => {
    const html = renderToStaticMarkup(<SectionHeading variant="content">科研计划</SectionHeading>)
    expect(html).toContain('class="section-heading section-heading--content"')
  })
})
