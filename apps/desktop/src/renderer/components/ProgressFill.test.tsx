import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ProgressFill } from './ProgressFill.js'

describe('ProgressFill', () => {
  it('把进度画成宿主底色从左填到的宽度,并报给读屏', () => {
    const html = renderToStaticMarkup(<ProgressFill percent={59} label="正在下载 0.0.14" />)
    expect(html).toContain('class="progress-fill" role="progressbar" aria-label="正在下载 0.0.14"')
    expect(html).toContain('aria-valuenow="59"')
    expect(html).toContain('<span style="width:59%"></span>')
  })

  it('线条样式画成自己占一行的细条,同样报给读屏', () => {
    const html = renderToStaticMarkup(<ProgressFill look="line" percent={33} label="已读 1/3" />)
    expect(html).toContain('class="progress-fill progress-fill--line" role="progressbar" aria-label="已读 1/3"')
    expect(html).toContain('<span style="width:33%"></span>')
  })
})
