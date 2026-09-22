// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it } from 'vitest'
import { dnum } from '../../../shared/dates.js'
import { MessagesProvider } from '../../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../../shell/language.js'
import {
  DAY_SLOT_HOURS, DEFAULT_TIMELINE_SCALE, fitTimelineWindow, shiftTaskWindow, shiftTimelineAnchor,
  timelineDayAt, timelineNowLabel, timelineNowLeft, timelineSlotWindow, timelineTaskSpan, timelineWindow,
  TimelineGrid, useTimelinePeriod,
} from './TimelineScale.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('timeline scale', () => {
  beforeEach(() => { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh') })

  it('默认按周展示,日、周、月都是完整日历周期', () => {
    expect(DEFAULT_TIMELINE_SCALE).toBe('week')
    expect(timelineWindow('2026-09-15')).toMatchObject({
      w0: dnum('2026-09-14'), w1: dnum('2026-09-20'), days: 7, dayWidth: 112,
    })
    expect(timelineWindow('2026-09-15', 'day')).toMatchObject({
      w0: dnum('2026-09-15'), w1: dnum('2026-09-15'), days: 1, dayWidth: 840,
    })
    expect(timelineWindow('2026-09-15', 'month')).toMatchObject({
      w0: dnum('2026-09-01'), w1: dnum('2026-09-30'), days: 30, dayWidth: 34,
    })
  })

  it('日视图每两小时一格,当前分钟精确落在当天轴上', () => {
    expect(DAY_SLOT_HOURS).toBe(2)
    const day = timelineWindow('2026-09-15', 'day')
    expect(timelineNowLeft(day, 'day', dnum('2026-09-15'), 0)).toBe(0)
    expect(timelineNowLeft(day, 'day', dnum('2026-09-15'), 12 * 60)).toBe(420)
    expect(timelineNowLeft(day, 'day', dnum('2026-09-16'), 12 * 60)).toBeNull()
    expect(timelineNowLabel(14 * 60 + 34)).toBe('14:00')
    expect(timelineSlotWindow(14 * 60 + 34)).toEqual({ start: '14:00', end: '16:00' })
  })

  it('日与周按视口均分撑满整行,月保留固定格宽', () => {
    expect(fitTimelineWindow(timelineWindow('2026-09-15', 'day'), 'day', 960).dayWidth).toBe(960)
    expect(fitTimelineWindow(timelineWindow('2026-09-15', 'week'), 'week', 980).dayWidth).toBe(140)
    expect(fitTimelineWindow(timelineWindow('2026-09-15', 'month'), 'month', 980).dayWidth).toBe(34)
  })

  it('周与月的日期头和内容区都逐格画分隔线', () => {
    const render = (scale: 'week' | 'month') => {
      const host = document.createElement('div')
      const window = timelineWindow('2026-09-15', scale)
      act(() => createRoot(host).render(createElement(
        MessagesProvider, null, createElement(TimelineGrid, { window, scale, today: dnum('2026-09-15') }),
      )))
      return { host, window }
    }

    const week = render('week')
    expect(week.host.querySelectorAll('.gday')).toHaveLength(week.window.days)
    expect(week.host.querySelectorAll('.gdatecell')).toHaveLength(week.window.days)
    const month = render('month')
    expect(month.host.querySelectorAll('.gday')).toHaveLength(month.window.days)
    expect(month.host.querySelectorAll('.gdatecell')).toHaveLength(month.window.days)
  })

  it('分时任务在日视图按 slot/window 落位,周与月都只占它当天一格', () => {
    const task = {
      start: '2026-09-15', end: '2026-09-15', window: { start: '14:00', end: '18:00' },
    } as const
    const daySpan = timelineTaskSpan(task, timelineWindow('2026-09-15', 'day'), 'day')!
    expect(daySpan.left).toBeCloseTo(490)
    expect(daySpan.right).toBeCloseTo(630)
    expect(timelineTaskSpan(task, timelineWindow('2026-09-15', 'week'), 'week'))
      .toEqual({ left: 112, right: 224 })
    expect(timelineTaskSpan(task, timelineWindow('2026-09-15', 'month'), 'month'))
      .toEqual({ left: 14 * 34, right: 15 * 34 })
    expect(timelineTaskSpan(task, timelineWindow('2026-09-16', 'day'), 'day')).toBeNull()
  })

  it('分时任务拖动时按两小时吸附并可跨过午夜', () => {
    expect(shiftTaskWindow({
      start: '2026-09-15', end: '2026-09-15', window: { start: '22:00', end: '24:00' },
    }, 1)).toEqual({
      start: '2026-09-16', end: '2026-09-16', window: { start: '00:00', end: '02:00' },
    })
    expect(shiftTaskWindow({
      start: '2026-09-15', end: '2026-09-16', window: { start: '22:00', end: '04:00' },
    }, -1)).toEqual({
      start: '2026-09-15', end: '2026-09-16', window: { start: '20:00', end: '02:00' },
    })
  })

  it('各档标题说清可见日期范围', () => {
    expect(timelineWindow('2026-09-15', 'day').label).toBe('2026年9月15日 · 周二')
    expect(timelineWindow('2026-09-15', 'week').label).toBe('2026年9月14日–9月20日')
    expect(timelineWindow('2026-09-15', 'month').label).toBe('2026年9月')
  })

  it('左右导航按当前粒度走前后一天、一周或一个自然月', () => {
    expect(shiftTimelineAnchor('2026-09-15', 'day', 1)).toBe('2026-09-16')
    expect(shiftTimelineAnchor('2026-09-15', 'week', -1)).toBe('2026-09-08')
    expect(shiftTimelineAnchor('2026-01-31', 'month', 1)).toBe('2026-02-01')
    expect(shiftTimelineAnchor('2026-01-31', 'month', -1)).toBe('2025-12-01')
  })

  it('时间线默认是本周,从任何周期点今天都会切回今天的日视图', () => {
    let period: ReturnType<typeof useTimelinePeriod> | null = null
    const Probe = () => {
      period = useTimelinePeriod('2026-09-15')
      return null
    }
    const host = document.createElement('div')
    act(() => createRoot(host).render(createElement(MessagesProvider, null, createElement(Probe))))
    expect(period).toMatchObject({ anchor: '2026-09-15', scale: 'week' })
    act(() => period!.setScale('month'))
    act(() => period!.step(1))
    expect(period!.scale).toBe('month')

    act(() => period!.goToday())
    expect(period).toMatchObject({ anchor: '2026-09-15', scale: 'day' })
  })

  it('周与月按格换算日期,日视图任一时段仍归到当天', () => {
    const canvas = {
      getBoundingClientRect: () => ({ left: 120 }),
    } as HTMLElement
    const window = timelineWindow('2026-09-15', 'month')

    expect(timelineDayAt(canvas, 120, window)).toBe('2026-09-01')
    expect(timelineDayAt(canvas, 120 + window.dayWidth * 14 + 1, window)).toBe('2026-09-15')
    const day = timelineWindow('2026-09-15', 'day')
    expect(timelineDayAt(canvas, 120 + day.dayWidth - 1, day)).toBe('2026-09-15')
  })
})
