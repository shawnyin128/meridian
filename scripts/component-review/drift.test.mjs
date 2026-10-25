import { describe, expect, it } from 'vitest'
import { driftMarkdown, driftRanking, driftSummary } from './drift.mjs'

const row = (screen, padding, extra = {}) => ({ combo: '1440x900-light', screen, pattern: 'Row', metrics: { padding, inset: 12, ...extra } })

describe('the drift summary', () => {
  it('reports two values when instances have two different paddings', () => {
    const summary = driftSummary([row('项目', '8 12'), row('想法', '8 12'), row('想法', '0')], ['项目', '想法'])
    expect(summary['1440x900-light'].Row.instances).toBe(3)
    expect(summary['1440x900-light'].Row.metrics.padding).toEqual({
      distinct: 2,
      missing: 0,
      values: [{ value: '8 12', count: 2, screens: ['项目', '想法'] }, { value: '0', count: 1, screens: ['想法'] }],
    })
    expect(summary['1440x900-light'].Row.metrics.inset.distinct).toBe(1)
  })

  it('lists the most common value first and screens in the order of the navigation map', () => {
    const summary = driftSummary([row('Wiki', '4'), row('动态', '10'), row('Shell', '10'), row('Wiki', '2')], ['Shell', '动态', 'Wiki'])
    const { values } = summary['1440x900-light'].Row.metrics.padding
    expect(values.map((slot) => slot.value)).toEqual(['10', '2', '4'])
    expect(values[0].screens).toEqual(['Shell', '动态'])
  })

  it('counts an instance without a value as missing, not as one more value', () => {
    const summary = driftSummary([row('项目', '8', { metaFont: null }), row('项目', '8', { metaFont: '12/400 --ter' })])
    expect(summary['1440x900-light'].Row.metrics.metaFont).toMatchObject({ distinct: 1, missing: 1 })
  })

  it('keeps each size and theme apart', () => {
    const summary = driftSummary([row('项目', '8'), { ...row('项目', '6'), combo: '1440x900-dark' }])
    expect(summary['1440x900-light'].Row.metrics.padding.distinct).toBe(1)
    expect(summary['1440x900-dark'].Row.metrics.padding.values[0].value).toBe('6')
  })

  it('ranks the pattern whose most varied metric has the most values first', () => {
    const tag = (padding, font) => ({ combo: '1440x900-light', screen: '动态', pattern: 'Tag', metrics: { padding, font } })
    const summary = driftSummary([
      row('项目', '1'), row('项目', '2'), row('项目', '3'),
      tag('2 8', '12/400'), tag('2 6', '11/400'),
    ])
    expect(driftRanking(summary)).toEqual([
      { pattern: 'Row', instances: 3, distinct: 3, metric: 'padding', total: 4 },
      { pattern: 'Tag', instances: 2, distinct: 2, metric: 'padding', total: 4 },
    ])
  })

  it('writes each value with its instance count and screens into the report', () => {
    const summary = driftSummary([row('项目', '8 12'), row('想法', '0')])
    const report = driftMarkdown({ summary, meta: ['test run'], failures: [{ screen: '设置', state: 'watches', reason: 'timeout' }] })
    expect(report).toContain('| Row | 2 | 2 | padding | 3 |')
    expect(report).toContain('| padding | 2 | `0` ×1 (想法)<br>`8 12` ×1 (项目) |')
    expect(report).toContain('- 设置 · watches: timeout')
  })
})
