import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { feedReport, readCoreLog } from './feed-report.mjs'

const measures = (at, level, delivered, added, dismissed, known, owned, directions) => (
  `${at} ${level} [feed] measures project:p path=api delivered=${delivered} shown=8 added=${added} dismissed=${dismissed} `
  + `known=${known} owned-shown=${owned} added-rate=0.100 dismiss-rate=0.100 known-share=0.000 directions=${directions}`
)

const LOG = [
  measures('2026-10-20T10:00:00.000Z', 'info', 10, 1, 1, 0, 0, 'd1:0.500,d2:0.500'),
  '2026-10-20T11:00:00.000Z info [feed] gap direction:p:d1 papers=20 overlap@10=0.100 ndcg@10=0.100 spearman=0.100',
  measures('2026-10-22T10:00:00.000Z', 'info', 20, 4, 3, 1, 0, 'd1:0.750,d2:0.250'),
  '2026-10-22T10:00:01.000Z info [feed] gap direction:p:d1 papers=20 overlap@10=0.800 ndcg@10=0.900 spearman=0.700',
  '2026-10-22T10:00:02.000Z info [harness] codex: 5.1 s',
  '2026-10-23T10:00:00.000Z info [feed] gap direction:p:d1 papers=18 overlap@10=0.600 ndcg@10=0.800 spearman=0.500',
  '2026-10-23T11:00:00.000Z warn [feed] fallback reason=rate-limit: paper embeddings fell back to TF-IDF for this refresh',
  measures('2026-10-24T10:00:00.000Z', 'error', 30, 6, 5, 2, 1, 'd1:0.625,d2:0.375'),
  '2026-10-24T11:00:00.000Z error [feed] fallback reason=auth: Semantic Scholar refused the saved key',
  measures('2026-10-26T10:00:00.000Z', 'info', 40, 9, 5, 2, 0, 'd1:0.500,d2:0.500'),
].join('\n')

describe('feed report', () => {
  it('按期间汇总:推送量取期间首尾的差,方向份额取期间里各次刷新的均值,差距给均值和首末两次,回退按原因计数', () => {
    expect(feedReport(LOG, { since: '2026-10-21', until: '2026-10-25' })).toBe([
      'Feed measures from 2026-10-21T00:00:00.000Z to 2026-10-25T00:00:00.000Z',
      '',
      'Live measures by scope and path: cards delivered in the period and how they left',
      '  project:p api: 2 refreshes, 20 delivered, added 5 (25.0%), dismissed 4 (20.0%), known 2 (10.0%), '
      + 'owned papers shown 1 in 1 refresh (must be 0), directions d1 68.8% d2 31.3%',
      '',
      'Gap of the fallback to the API by scope: mean over API runs (first -> latest)',
      '  direction:p:d1: 2 runs, overlap@10 0.700 (0.800 -> 0.600), nDCG@10 0.850 (0.900 -> 0.800), Spearman 0.600 (0.700 -> 0.500)',
      '',
      'Fallbacks by reason: rate-limit 1, auth 1',
    ].join('\n'))
  })

  it('期间里什么都没记时每一节写 none', () => {
    expect(feedReport(LOG, { since: '2026-11-01', until: '2026-11-02' })).toBe([
      'Feed measures from 2026-11-01T00:00:00.000Z to 2026-11-02T00:00:00.000Z',
      '',
      'Live measures by scope and path: cards delivered in the period and how they left',
      '  none',
      '',
      'Gap of the fallback to the API by scope: mean over API runs (first -> latest)',
      '  none',
      '',
      'Fallbacks by reason: none',
    ].join('\n'))
  })

  it('读日志文件夹里轮换下来的几份,从最旧的读起', () => {
    const dir = mkdtempSync(join(tmpdir(), 'meridian-feed-report-'))
    try {
      writeFileSync(join(dir, 'core.2.log'), 'oldest\n')
      writeFileSync(join(dir, 'core.1.log'), 'older\n')
      writeFileSync(join(dir, 'core.log'), 'newest\n')
      writeFileSync(join(dir, 'other.log'), 'not core\n')
      expect(readCoreLog(dir)).toBe('oldest\n\nolder\n\nnewest\n')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
