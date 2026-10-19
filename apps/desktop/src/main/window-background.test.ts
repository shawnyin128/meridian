import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { windowBackground } from './window-background.js'

const TOKENS = readFileSync(join(import.meta.dirname, '..', 'renderer', 'shell', 'tokens.css'), 'utf8')

/** The value of `--desktop`, the document background, in the first rule `selector` opens in tokens.css. */
const desktopIn = (selector: string): string => {
  const rule = TOKENS.slice(TOKENS.indexOf(`${selector}{`))
  return /--desktop:\s*(#[0-9a-f]{6})/i.exec(rule.slice(0, rule.indexOf('}')))![1]!
}

describe('windowBackground', () => {
  it('窗口在第一帧之前涂的底色就是当前主题的文档底色 --desktop', () => {
    expect(windowBackground(false)).toBe(desktopIn(':root'))
    expect(windowBackground(true)).toBe(desktopIn('[data-theme="dark"]'))
  })
})
