import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { InlineMessage } from './InlineMessage.js'

describe('InlineMessage', () => {
  it('announces an error as an alert, and a warning, a note or a success as a status', () => {
    const roles = (['error', 'warning', 'info', 'done'] as const).map((tone) => {
      const html = renderToStaticMarkup(<InlineMessage tone={tone} variant="line">原因</InlineMessage>)
      return [tone, /role="(\w+)"/.exec(html)?.[1]]
    })
    expect(roles).toEqual([['error', 'alert'], ['warning', 'status'], ['info', 'status'], ['done', 'status']])
  })

  it('draws every tone as a box or a line of the one message, its text in its own slot', () => {
    expect(renderToStaticMarkup(<InlineMessage tone="error" variant="box">读不了</InlineMessage>))
      .toBe('<div class="inline-message inline-message--box inline-message--error" role="alert">'
        + '<div class="inline-message-text">读不了</div></div>')
    expect(renderToStaticMarkup(<InlineMessage tone="warning" variant="line">原关联项目当前不可用</InlineMessage>))
      .toBe('<div class="inline-message inline-message--line inline-message--warning" role="status">'
        + '<div class="inline-message-text">原关联项目当前不可用</div></div>')
    expect(renderToStaticMarkup(<InlineMessage tone="done" variant="line">连接成功</InlineMessage>))
      .toBe('<div class="inline-message inline-message--line inline-message--done" role="status">'
        + '<div class="inline-message-text">连接成功</div></div>')
  })

  it('puts its lead mark before the text and its one action after it', () => {
    const html = renderToStaticMarkup(
      <InlineMessage tone="info" variant="box" lead={<svg />} action={<button type="button" className="btn sm">重启</button>}>
        新版本已就绪
      </InlineMessage>,
    )
    expect(html).toBe('<div class="inline-message inline-message--box inline-message--info" role="status">'
      + '<span class="inline-message-lead"><svg></svg></span><div class="inline-message-text">新版本已就绪</div>'
      + '<div class="inline-message-action"><button type="button" class="btn sm">重启</button></div></div>')
  })

  it('puts its progress line first, under the lead, the text and the action', () => {
    const html = renderToStaticMarkup(
      <InlineMessage tone="info" variant="box" progress={{ percent: 40, label: '正在下载 0.0.20.0' }}>正在下载 0.0.20.0</InlineMessage>,
    )
    expect(html).toMatch(/^<div class="inline-message inline-message--box inline-message--info progress-host" role="status">(<div class="progress-fill"[^>]*><span style="width:40%"><\/span><\/div>)<div class="inline-message-text">/)
  })

  it('takes placement classes and data attributes from the place it sits in', () => {
    const html = renderToStaticMarkup(
      <InlineMessage tone="error" variant="line" className="service-error" data-about-update="error">没能保存</InlineMessage>,
    )
    expect(html).toBe('<div class="inline-message inline-message--line inline-message--error service-error" role="alert" data-about-update="error">'
      + '<div class="inline-message-text">没能保存</div></div>')
  })
})
