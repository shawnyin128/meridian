import { describe, expect, it, vi } from 'vitest'
import { openLinks } from './links.js'

describe('openLinks', () => {
  it('http(s) 交给系统浏览器,别的协议丢弃,一律不开新窗口', () => {
    const open = vi.fn(() => Promise.resolve())
    const handler = openLinks(open)
    expect(handler({ url: 'https://example.com/a' })).toEqual({ action: 'deny' })
    expect(handler({ url: 'http://example.com' })).toEqual({ action: 'deny' })
    expect(handler({ url: 'file:///etc/passwd' })).toEqual({ action: 'deny' })
    expect(handler({ url: 'javascript:alert(1)' })).toEqual({ action: 'deny' })
    expect(open.mock.calls).toEqual([['https://example.com/a'], ['http://example.com']])
  })
})
