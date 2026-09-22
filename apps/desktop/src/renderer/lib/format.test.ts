import { describe, expect, it } from 'vitest'
import { createFormat } from './format.js'

describe('中文日期', () => {
  const fmt = createFormat('zh')

  it('短日期是 M月D日', () => {
    expect(fmt.date('2026-09-19')).toBe('9月19日')
  })

  it('区间两端都写全', () => {
    expect(fmt.dateRange('2026-09-19', '2026-09-19')).toBe('9月19日')
    expect(fmt.dateRange('2026-09-19', '2026-10-02')).toBe('9月19日–10月2日')
  })

  it('日分组标题说今天、昨天，跨年补年份', () => {
    expect(fmt.dayHead('2026-09-19', '2026-09-19')).toBe('今天')
    expect(fmt.dayHead('2026-09-18', '2026-09-19')).toBe('昨天')
    expect(fmt.dayHead('2026-09-01', '2026-09-19')).toBe('9月1日')
    expect(fmt.dayHead('2025-12-31', '2026-09-19')).toBe('2025年12月31日')
  })

  it('动态时间会从刚刚推进到分钟和小时', () => {
    const createdAt = '2026-09-19T12:00:00.000Z'
    expect(fmt.activityTime(createdAt, Date.parse('2026-09-19T12:00:30.000Z'))).toBe('刚刚')
    expect(fmt.activityTime(createdAt, Date.parse('2026-09-19T12:03:00.000Z'))).toBe('3分钟前')
    expect(fmt.activityTime(createdAt, Date.parse('2026-09-19T14:00:00.000Z'))).toBe('2小时前')
  })
})

describe('英文日期', () => {
  const fmt = createFormat('en')

  it('短日期是月份缩写加日', () => {
    expect(fmt.date('2026-09-19')).toBe('Sep 19')
  })

  it('区间用短横线连接', () => {
    expect(fmt.dateRange('2026-09-19', '2026-09-19')).toBe('Sep 19')
    expect(fmt.dateRange('2026-09-19', '2026-10-02')).toBe('Sep 19–Oct 2')
  })

  it('日分组标题说 Today、Yesterday，跨年补年份', () => {
    expect(fmt.dayHead('2026-09-19', '2026-09-19')).toBe('Today')
    expect(fmt.dayHead('2026-09-18', '2026-09-19')).toBe('Yesterday')
    expect(fmt.dayHead('2026-09-01', '2026-09-19')).toBe('Sep 1')
    expect(fmt.dayHead('2025-12-31', '2026-09-19')).toBe('Dec 31, 2025')
  })

  it('advances activity time instead of freezing at Just now', () => {
    const createdAt = '2026-09-19T12:00:00.000Z'
    expect(fmt.activityTime(createdAt, Date.parse('2026-09-19T12:00:30.000Z'))).toBe('Just now')
    expect(fmt.activityTime(createdAt, Date.parse('2026-09-19T12:03:00.000Z'))).toBe('3 minutes ago')
    expect(fmt.activityTime(createdAt, Date.parse('2026-09-19T14:00:00.000Z'))).toBe('2 hours ago')
  })

  it('复数按 Intl.PluralRules 选词', () => {
    expect(fmt.plural(1, { one: 'day', other: 'days' })).toBe('day')
    expect(fmt.plural(0, { one: 'day', other: 'days' })).toBe('days')
    expect(fmt.plural(7, { one: 'day', other: 'days' })).toBe('days')
  })

  it('中文不分单复数', () => {
    expect(createFormat('zh').plural(1, { one: '天', other: '天' })).toBe('天')
  })
})

describe('时区', () => {
  it('日期只按 UTC 解释，不受本机时区影响', () => {
    expect(createFormat('en').date('2026-01-01')).toBe('Jan 1')
    expect(createFormat('zh').date('2026-01-01')).toBe('1月1日')
  })
})

describe('完整日期与区间', () => {
  it('中文完整日期带年份，同年区间收起右端年份', () => {
    const fmt = createFormat('zh')
    expect(fmt.fullDate('2026-09-19')).toBe('2026年9月19日')
    expect(fmt.fullDateRange('2026-09-19', '2026-10-02')).toBe('2026年9月19日–10月2日')
    expect(fmt.fullDateRange('2026-12-31', '2027-01-02')).toBe('2026年12月31日–2027年1月2日')
  })

  it('英文完整日期带年份，Intl.DateTimeFormat 的 formatRange 收起共享的年月', () => {
    // formatRange separates its two sides with U+2009 THIN SPACE, U+2013 EN DASH, U+2009 THIN
    // SPACE, not plain ASCII spaces around the dash.
    const fmt = createFormat('en')
    expect(fmt.fullDate('2026-09-19')).toBe('Sep 19, 2026')
    expect(fmt.fullDateRange('2026-09-19', '2026-10-02')).toBe('Sep 19 – Oct 2, 2026')
    expect(fmt.fullDateRange('2026-12-31', '2027-01-02')).toBe('Dec 31, 2026 – Jan 2, 2027')
  })
})

describe('月份与星期', () => {
  it('中文给年月与单字星期', () => {
    const fmt = createFormat('zh')
    expect(fmt.monthYear('2026-09-19')).toBe('2026年9月')
    expect(fmt.weekdayShort(0)).toBe('日')
    expect(fmt.weekdayShort(6)).toBe('六')
  })

  it('英文给月份年与三字母星期', () => {
    const fmt = createFormat('en')
    expect(fmt.monthYear('2026-09-19')).toBe('September 2026')
    expect(fmt.weekdayShort(0)).toBe('Sun')
    expect(fmt.weekdayShort(6)).toBe('Sat')
  })
})
