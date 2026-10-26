import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const STYLES = join(process.cwd(), 'apps/desktop/src/renderer/components/InlineMessage.css')

describe('InlineMessage 的操作位置', () => {
  it('操作默认在行尾:正文撑满;操作贴着正文时,正文只占自己的宽度,操作紧跟在它后面', () => {
    const rules = Object.fromEntries((readFileSync(STYLES, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').match(/[^{}]+\{[^}]*\}/g) ?? [])
      .map((rule) => rule.trim().split('{')).map(([selector, body]) => [selector.trim(), body.replace('}', '')]))
    expect(rules['.inline-message-text']).toMatch(/(^|;)flex:1(;|$)/)
    expect(rules['.inline-message--action-at-text .inline-message-text']).toBe('flex:0 1 auto')
  })
})
