import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const RENDERER = join(import.meta.dirname, '..', 'renderer')

/** The declarations of `selector` in the renderer stylesheet at `path`, comments removed. */
function rule(path: string, selector: string): string {
  const css = readFileSync(join(RENDERER, path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const found = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find((match) => match[1]!.trim() === selector)
  if (found === undefined) throw new Error(`${path}: no rule ${selector}`)
  return found[2]!
}

const value = (body: string, property: string) => new RegExp(`(?:^|;)\\s*${property}:([^;]+)`).exec(body)?.[1]?.trim()

describe('Notice placement', () => {
  it('在画布上居中：起点就是侧栏或阅读器对话栏的终点，不是窗口的左边', () => {
    const sidebar = value(rule('shell/AppShell.css', '.sidebar'), 'flex')!.replace(/^0 0 /, '')
    const chat = value(rule('routes/Reader.css', '.paper-chat'), 'flex')!.replace(/^0 0 /, '')
    const edge = value(rule('shell/AppShell.css', '.paper-chat-edge'), 'flex')!.replace(/^0 0 /, '')
    expect(value(rule('components/Notice.css', '.notice-host'), 'position')).toBe('absolute')
    expect(value(rule('components/Notice.css', '.notice-host'), 'left')).toBe(sidebar)
    expect(value(rule('components/Notice.css', '.main.sbhide>.notice-host'), 'left')).toBe('0')
    expect(value(rule('components/Notice.css', '.main.reading>.notice-host'), 'left')).toBe(chat)
    expect(value(rule('components/Notice.css', '.main.reading.sbhide>.notice-host'), 'left')).toBe(edge)
  })
})
