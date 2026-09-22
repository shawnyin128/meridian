import { describe, expect, it } from 'vitest'
import { metaBelowHeading } from './Changelog.js'

describe('metaBelowHeading', () => {
  it('手写的那种切掉开头那段日期,后面原样留着', () => {
    expect(metaBelowHeading('昨天 · 实验 #3 的结果回流')).toBe('实验 #3 的结果回流')
    expect(metaBelowHeading('昨晚 · Meridian')).toBe('Meridian')
  })

  it('整条就是那段日期时什么都不剩:记下来的那些 meta 是 dayOf 给的一个词', () => {
    expect(metaBelowHeading('今天')).toBe('')
    expect(metaBelowHeading('本周')).toBe('')
  })

  it('只切第一个分隔符,后面的原样留着', () => {
    expect(metaBelowHeading('刚刚 · 你 · 备注')).toBe('你 · 备注')
  })
})
