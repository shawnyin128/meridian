import { useMemo } from 'react'
import { dnum } from '../../shared/dates.js'
import { useLocale } from '../messages/useMessages.js'
import type { Locale } from '../shell/language.js'

/** Locale-aware display formatting for dates, numbers and English plurals. */
export type Format = {
  date: (iso: string) => string
  dateRange: (start: string, end: string) => string
  dayHead: (iso: string, todayIso: string) => string
  monthYear: (iso: string) => string
  weekdayShort: (weekday: number) => string
  fullDate: (iso: string) => string
  fullDateRange: (startIso: string, endIso: string) => string
  dateTime: (iso: string) => string
  activityTime: (iso: string, nowMs?: number) => string
  number: (value: number) => string
  plural: (count: number, forms: { one: string; other: string }) => string
}

const ZH_WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'] as const

// Dates in this app are date-only ISO strings compared as UTC day numbers. Formatting them in the
// machine's local zone would shift the displayed day for users west of UTC.
const utc = (iso: string): Date => new Date(`${iso}T00:00:00Z`)

/** Reads one field's localized digits out of a formatter's parts, for building Chinese phrasing by hand. */
function part(formatter: Intl.DateTimeFormat, date: Date, type: Intl.DateTimeFormatPartTypes): string {
  return formatter.formatToParts(date).find((entry) => entry.type === type)?.value ?? ''
}

/** Formatters for one locale. Both catalogs ship, so this is cheap to build per locale change. */
export function createFormat(locale: Locale): Format {
  // CLDR's numeric-only "Md"/"yMd" skeletons render zh-CN with slashes, not the year/month/day
  // marker characters this app ships, so the Chinese branch reads the numeric fields and
  // assembles the fixed phrasing by hand instead of trusting the formatter's own separators.
  const ymd = new Intl.DateTimeFormat('zh-CN', { timeZone: 'UTC', year: 'numeric', month: 'numeric', day: 'numeric' })
  const monthDayEn = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' })
  const withYearEn = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric',
  })
  const monthYearEn = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', year: 'numeric', month: 'long' })
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' })
  const clock = new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    hour: '2-digit', minute: '2-digit',
  })
  const dateTime = new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
  const relativeTime = new Intl.RelativeTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    numeric: 'always',
  })
  const numbers = new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US')
  const plurals = new Intl.PluralRules(locale === 'zh' ? 'zh-CN' : 'en-US')

  const zhMonthDay = (value: Date): string =>
    `${part(ymd, value, 'month')}月${part(ymd, value, 'day')}日`
  const zhWithYear = (value: Date): string =>
    `${part(ymd, value, 'year')}年${zhMonthDay(value)}`

  const date = (iso: string): string =>
    (locale === 'zh' ? zhMonthDay(utc(iso)) : monthDayEn.format(utc(iso)))

  return {
    date,
    dateRange: (start, end) => (start === end ? date(start) : `${date(start)}–${date(end)}`),
    dayHead: (iso, todayIso) => {
      const days = dnum(todayIso) - dnum(iso)
      if (days <= 0) return locale === 'zh' ? '今天' : 'Today'
      if (days === 1) return locale === 'zh' ? '昨天' : 'Yesterday'
      if (iso.slice(0, 4) === todayIso.slice(0, 4)) return date(iso)
      return locale === 'zh' ? zhWithYear(utc(iso)) : withYearEn.format(utc(iso))
    },
    monthYear: (iso) => (locale === 'zh'
      ? `${part(ymd, utc(iso), 'year')}年${part(ymd, utc(iso), 'month')}月`
      : monthYearEn.format(utc(iso))),
    // 1970-01-04 is a Sunday, so the offset maps a 0-6 weekday index onto a real UTC date.
    weekdayShort: (day) => (locale === 'zh'
      ? ZH_WEEKDAYS[day] ?? ''
      : weekday.format(new Date(Date.UTC(1970, 0, 4 + day)))),
    fullDate: (iso) => (locale === 'zh' ? zhWithYear(utc(iso)) : withYearEn.format(utc(iso))),
    // zh-CN's numeric skeleton renders formatRange with slashes (see `ymd` above), so only the
    // English branch trusts Intl; the Chinese branch reuses this file's hand-composed date parts.
    fullDateRange: (startIso, endIso) => {
      if (locale !== 'zh') return withYearEn.formatRange(utc(startIso), utc(endIso))
      const from = utc(startIso)
      const to = utc(endIso)
      return part(ymd, from, 'year') === part(ymd, to, 'year')
        ? `${zhWithYear(from)}–${zhMonthDay(to)}`
        : `${zhWithYear(from)}–${zhWithYear(to)}`
    },
    dateTime: (iso) => dateTime.format(new Date(iso)),
    activityTime: (iso, nowMs = Date.now()) => {
      const at = Date.parse(iso)
      if (!Number.isFinite(at)) return ''
      const elapsedSeconds = Math.max(0, Math.floor((nowMs - at) / 1_000))
      if (elapsedSeconds < 60) return locale === 'zh' ? '刚刚' : 'Just now'
      const elapsedMinutes = Math.floor(elapsedSeconds / 60)
      if (elapsedMinutes < 60) return relativeTime.format(-elapsedMinutes, 'minute')
      const elapsedHours = Math.floor(elapsedMinutes / 60)
      if (elapsedHours < 24) return relativeTime.format(-elapsedHours, 'hour')
      return clock.format(new Date(at))
    },
    number: (value) => numbers.format(value),
    plural: (count, forms) => (plurals.select(count) === 'one' ? forms.one : forms.other),
  }
}

/** The active locale's formatters. Throws outside `MessagesProvider`. */
export function useFormat(): Format {
  const locale = useLocale()
  return useMemo(() => createFormat(locale), [locale])
}
