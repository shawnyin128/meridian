import { describe, expect, it } from 'vitest'
import { sendsMessage } from './chat.js'

describe('对话输入框的回车', () => {
  it('只有不带 Shift、不在输入法组字中的回车才发送', () => {
    const key = (init: Partial<Pick<KeyboardEvent, 'key' | 'shiftKey' | 'isComposing'>>) =>
      ({ key: 'Enter', shiftKey: false, isComposing: false, ...init })
    expect(sendsMessage(key({}))).toBe(true)
    expect(sendsMessage(key({ shiftKey: true }))).toBe(false)
    expect(sendsMessage(key({ isComposing: true }))).toBe(false)
    expect(sendsMessage(key({ key: 'a' }))).toBe(false)
  })
})
