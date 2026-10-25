import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AddAction } from './AddAction.js'
import {
  PageBody, PageError, PageFooter, PageHeader, PageNote, PageShell, PageTitle, PageToolbar, SectionHeading,
} from './PageShell.js'
import { SegmentedControl } from './SegmentedControl.js'
import { SortMenu } from './SortMenu.js'

describe('PageShell', () => {
  it('composes the canonical page regions without changing feature classes', () => {
    const html = renderToStaticMarkup(
      <PageShell className="paper-library">
        <PageHeader><PageTitle>论文</PageTitle></PageHeader>
        <PageBody className="papers"><PageToolbar>操作</PageToolbar>正文</PageBody>
        <PageFooter bare>分页</PageFooter>
      </PageShell>,
    )
    expect(html).toContain('class="desk paper-library"')
    expect(html).toContain('class="desk-head"')
    expect(html).toContain('class="fade-text t"')
    expect(html).toContain('class="scroll-area scroll-area--y scroll-area--fill scroll-area--gutter desk-body papers" data-fade-paint=""')
    expect(html).toContain('class="page-toolbar"')
    expect(html).toContain('class="desk-foot bare"')
  })

  it('fades a page title that does not fit, as every one-line title does', () => {
    const html = renderToStaticMarkup(<PageHeader><PageTitle>推测解码和 KV 量化联合优化</PageTitle></PageHeader>)
    expect(html).toBe('<div class="desk-head"><span class="fade-text t" data-state="closed">推测解码和 KV 量化联合优化</span></div>')
  })

  it('renders errors and action headings through one contract', () => {
    const html = renderToStaticMarkup(
      <>
        <PageError error="打不开" />
        <SectionHeading actions={<button>新增</button>}>项目</SectionHeading>
        <SectionHeading variant="group">今日</SectionHeading>
      </>,
    )
    expect(html).toContain('<div class="inline-message inline-message--box inline-message--error page-error page-error--page" role="alert">'
      + '<div class="inline-message-text">打不开</div></div>')
    expect(renderToStaticMarkup(<PageError error="科研图读不了" variant="section" />))
      .toBe('<div class="inline-message inline-message--box inline-message--error page-error page-error--section" role="alert">'
        + '<div class="inline-message-text">科研图读不了</div></div>')
    expect(html).toContain(
      '<div class="section-heading section-heading--page">项目<div class="section-heading-actions"><button>新增</button></div></div>',
    )
    expect(html).toContain('<div class="section-heading section-heading--group">今日</div>')
    expect(renderToStaticMarkup(<PageError error={null} />)).toBe('')
  })

  it('puts page actions in their own slot at the header\'s right end, after the title', () => {
    const html = renderToStaticMarkup(
      <PageHeader actions={<AddAction size="regular">Import</AddAction>}><PageTitle>Papers</PageTitle></PageHeader>,
    )
    expect(html).toMatch(/^<div class="desk-head"><span class="fade-text t" data-state="closed">Papers<\/span><div class="page-actions"><button type="button" class="btn add-action">/)
  })

  it('keeps peer-view switches in the shared content toolbar', () => {
    const html = renderToStaticMarkup(
      <PageToolbar>
        <SegmentedControl
          label="View" value="list"
          options={[{ value: 'list', label: 'List' }, { value: 'map', label: 'Map' }]}
          onChange={() => undefined}
        />
      </PageToolbar>,
    )
    expect(html).toMatch(/^<div class="page-toolbar"><div [^>]*class="segmented-control segmented-control--md"/)
  })

  it('gives the rail variant its own class and keeps actions in the shared slot', () => {
    const html = renderToStaticMarkup(
      <SectionHeading variant="rail" actions={<button>＋</button>}>关联</SectionHeading>,
    )
    expect(html).toBe(
      '<div class="section-heading section-heading--rail">关联<div class="section-heading-actions"><button>＋</button></div></div>',
    )
  })

  it('sorts a page from its header at the page weight and adds to a section from its heading at the section weight', () => {
    const html = renderToStaticMarkup(
      <>
        <PageHeader actions={<SortMenu label="排序" options={[{ label: '按更新时间', onSelect: () => undefined }]} />}>
          <PageTitle>想法</PageTitle>
        </PageHeader>
        <SectionHeading actions={<AddAction size="compact">任务</AddAction>}>计划</SectionHeading>
      </>,
    )
    const classes = [...html.matchAll(/<button[^>]*class="([^"]*)"/g)].map((match) => match[1]!.split(' ').slice(0, 2).join(' '))
    expect(classes).toEqual(['btn sort-menu', 'btn sm'])
  })

  it('heads a pane with the same bar as a page, its title a step smaller, and a line of state among the actions', () => {
    const html = renderToStaticMarkup(
      <PageHeader size="pane" actions={<PageNote>第 3 页</PageNote>}><PageTitle count={2}>阅读笔记</PageTitle></PageHeader>,
    )
    expect(html).toMatch(/^<div class="desk-head desk-head--pane"><span class="fade-text t" data-state="closed">阅读笔记<span class="heading-count">/)
    expect(html).toMatch(/<div class="page-actions"><span class="page-note">第 3 页<\/span><\/div><\/div>$/)
  })

  it('gives a prose page the prose column, and a body whose content fills it no scrolling of its own', () => {
    expect(renderToStaticMarkup(<PageBody column="prose">正文</PageBody>))
      .toBe('<div class="scroll-area scroll-area--y scroll-area--fill scroll-area--gutter desk-body desk-body--prose" data-fade-paint="">正文</div>')
    expect(renderToStaticMarkup(<PageBody fill className="papers">表格</PageBody>))
      .toBe('<div class="desk-body desk-body--fill papers">表格</div>')
  })

  it('centres a toolbar over the stream it heads when asked, and starts it at the body\'s edge otherwise', () => {
    expect(renderToStaticMarkup(<PageToolbar align="center">切换</PageToolbar>))
      .toBe('<div class="page-toolbar page-toolbar--center">切换</div>')
    expect(renderToStaticMarkup(<PageToolbar>切换</PageToolbar>)).toBe('<div class="page-toolbar">切换</div>')
  })
})
