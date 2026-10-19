import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AddAction } from './AddAction.js'
import {
  PageBody, PageError, PageFooter, PageHeader, PageShell, PageTitle, PageToolbar, SectionHeading,
} from './PageShell.js'
import { SegmentedControl } from './SegmentedControl.js'
import { SortMenu } from './SortMenu.js'

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
        <SectionHeading variant="group">今日</SectionHeading>
      </>,
    )
    expect(html).toContain('class="ipcerror ipcerror--page" role="alert"')
    expect(renderToStaticMarkup(<PageError error="科研图读不了" variant="section" />))
      .toBe('<div class="ipcerror ipcerror--section" role="alert">科研图读不了</div>')
    expect(html).toContain(
      '<div class="section-heading section-heading--page">项目<div class="section-heading-actions"><button>新增</button></div></div>',
    )
    expect(html).toContain('<div class="section-heading section-heading--group">今日</div>')
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
    expect(html).toBe(
      '<div class="section-heading section-heading--rail">关联<div class="section-heading-actions"><button>＋</button></div></div>',
    )
  })

  it('gives sorting and adding in a heading the same section weight', () => {
    const html = renderToStaticMarkup(
      <SectionHeading actions={(
        <>
          <SortMenu label="排序" options={[{ label: '按更新时间', onSelect: () => undefined }]} />
          <AddAction variant="section">任务</AddAction>
        </>
      )}
      >计划
      </SectionHeading>,
    )
    const classes = [...html.matchAll(/<button[^>]*class="([^"]*)"/g)].map((match) => match[1]!.split(' ').slice(0, 2).join(' '))
    expect(classes).toEqual(['btn sm', 'btn sm'])
  })
})
