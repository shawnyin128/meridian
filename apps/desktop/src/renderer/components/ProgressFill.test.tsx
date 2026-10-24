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
})
