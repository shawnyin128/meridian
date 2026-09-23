import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import changes from '../core/fixtures/changes.json' with { type: 'json' }
import chats from '../core/fixtures/chats.json' with { type: 'json' }
import feed from '../core/fixtures/feed.json' with { type: 'json' }
import inbox from '../core/fixtures/inbox.json' with { type: 'json' }
import later from '../core/fixtures/later.json' with { type: 'json' }
import papers from '../core/fixtures/papers.json' with { type: 'json' }
import projects from '../core/fixtures/projects.json' with { type: 'json' }
import watches from '../core/fixtures/watches.json' with { type: 'json' }
import wikiFixture from '../core/fixtures/wiki.json' with { type: 'json' }
import { createFixtureStore } from '../core/fixture-store.js'
import {
  wikiAggregation, wikiPaper, wikiSearchIndex, type WikiData,
} from '../core/wiki/index.js'
import {
  ChangeEntrySchema,
  ChangelogDeleteParamsSchema,
  ChatActionSchema,
  ConclusionSchema,
  ChatAppendParamsSchema,
  ChatCreateParamsSchema,
  ChatForPaperParamsSchema,
  ChatMessageSchema,
  ChatMessagesParamsSchema,
  ChatSessionSchema,
  ChatSetArchivedParamsSchema,
  DeliverySettingsSchema,
  FeedAppendParamsSchema,
  FeedEntrySchema,
  GraphNodeSchema,
  HarnessCancelParamsSchema,
  HarnessCancelResultSchema,
  HarnessModelConnectionCheckResultSchema,
  HarnessPlanSchema,
  HarnessPaperWikiQualitySchema,
  HarnessRejectPaperWikiParamsSchema,
  HarnessModelSettingsUpdateSchema,
  HarnessPrepareParamsSchema,
  HarnessRunReceiptSchema,
  HarnessStartParamsSchema,
  InboxDismissParamsSchema,
  InboxDownloadParamsSchema,
  InboxDownloadResultSchema,
  InboxEntrySchema,
  InboxReadLaterParamsSchema,
  LaterEntrySchema,
  LaterRemoveParamsSchema,
  LibraryBackupParamsSchema,
  LibraryBackupSchema,
  LibraryConfigureParamsSchema,
  LibraryLocationSchema,
  LibraryResetResultSchema,
  ListParamsSchema,
  PaperColumnsSchema,
  PaperImportResultSchema,
  PaperReadingSchema,
  PaperRowSchema,
  ProjectDetailSchema,
  ProjectOverviewSchema,
  ProjectPaperParamsSchema,
  PapersFacetsParamsSchema,
  PapersImportParamsSchema,
  PapersMutateReadingParamsSchema,
  PapersRenameOptionParamsSchema,
  PapersSetColumnTypeParamsSchema,
  PapersUpdateParamsSchema,
  ProjectCreateAttachmentParamsSchema,
  ProjectCreateConclusionParamsSchema,
  ProjectCreateMilestoneParamsSchema,
  ProjectCreateParamsSchema,
  ProjectCreateRelationParamsSchema,
  ProjectCreateTaskParamsSchema,
  ProjectBindWorkspaceParamsSchema,
  ProjectDeleteParamsSchema,
  ProjectSummarySchema,
  ProjectSetConclusionStateParamsSchema,
  ProjectUpdateParamsSchema,
  ProjectUpdateMilestoneParamsSchema,
  ProjectUpdateTaskParamsSchema,
  ProposalOpSchema,
  ProposalSchema,
  ResearchIdeaDeleteParamsSchema,
  ResearchIdeaPlaceOnGraphParamsSchema,
  ResearchIdeaPromoteParamsSchema,
  ResearchIdeaSchema,
  ResearchIdeaUpdateParamsSchema,
  SearchHitSchema,
  SearchParamsSchema,
  TaskSchema,
  TrashEntrySchema,
  TrashPurgeParamsSchema,
  TrashRestoreParamsSchema,
  WatchCreateParamsSchema,
  WatchDeleteParamsSchema,
  WatchSchema,
  WatchSetActiveParamsSchema,
  WatchSuggestionParamsSchema,
  WatchSuggestionResultSchema,
  WatchUpdateParamsSchema,
  WikiAggregationCardSchema,
  WikiAggregationParamsSchema,
  WikiAggregationSchema,
  WikiHomeSchema,
  WikiPaperParamsSchema,
  WikiPaperSchema,
} from './contract.js'
import { PROJECT_STATUSES, READ_STATES, UNREAD_PAPER } from './vocabulary.js'

const PROJECT = {
  id: 'draft', name: 'draft 效率', status: '进行中', priority: 'p0',
  topic: 'speculative decoding', focus: '宽树实验补 B≥8',
  start: '2026-06-02', due: '2026-09-15', memo: '拐点是 batch size 的函数。',
  conclusions: { verified: 1, pending: 0, conflicting: 1 },
  conclusionList: [{
    id: 'c1', text: '拐点是 batch size 的函数', state: 'verified',
    date: '2026-06-25', source: '手动添加',
  }],
  paperCount: 4,
  papers: ['p1', 'p2', 'p3', 'p4'],
  paperTitles: { p1: 'A', p2: 'B', p3: 'C', p4: 'D' },
  tasks: [{ id: 't1', title: '宽树实验 B≥8', start: '2026-08-18', end: '2026-08-28', state: 'act', priority: 'p0' }],
  milestones: [{ id: 'm1', date: '2026-08-28', title: '宽树实验补 B≥8', done: false }],
  events: [{ date: '2026-06-02', text: '开始这条研究线' }],
  relations: [{ group: 'Wiki', items: [{ id: 'r1', text: '树宽收益拐点' }] }],
  attachments: [{ id: 'f1', name: 'width-sweep-b4b8.csv', size: '412 KB' }],
  graph: {
    nodes: [
      { id: 'root', label: 'draft 效率', state: 'act', x: 10, y: 95, width: 110, writebacks: [] },
      {
        id: 'knee', label: '树宽收益拐点', state: 'done', x: 220, y: 30, width: 130,
        writebacks: [{ page: 'topics/ptq', text: '拐点不是一个数', date: '2026-06-25' }],
      },
    ],
    edges: [['root', 'knee']],
  },
  agentSessions: [{
    id: 'a1',
    title: '实验 #3 · 分桶统计脚本固化',
    when: '2026-08-05',
    steps: [{ time: '16:10', text: '接到任务:把分支浪费按深度分桶的统计固化成可复跑脚本' }],
    outcome: '2 个文件改动 · 结果与手工分析一致 · 共 31 分钟',
  }],
}

describe('contract schemas', () => {
  it('Harness 只接受有界计划与明确费用确认', () => {
    const plan = {
      id: 'plan-1', workflow: 'paper-wiki', targetId: 'p1', scopeDigest: 'digest',
      action: 'create', label: '生成 Wiki',
      scope: {
        paperTitle: 'Paper', paperPages: 12, highlights: 2, annotatedHighlights: 1,
        notes: 3, hasRemark: true, existingWikiChars: 0,
      },
      model: { provider: 'demo', name: 'demo', configured: true, billable: false },
      expiresAt: '2026-09-17T12:10:00.000Z',
    }
    expect(HarnessPlanSchema.parse(plan)).toEqual(plan)
    expect(HarnessPrepareParamsSchema.parse({ workflow: 'paper-wiki', paperId: 'p1' }))
      .toEqual({ workflow: 'paper-wiki', paperId: 'p1' })
    expect(HarnessStartParamsSchema.parse({
      planId: 'plan-1', scopeDigest: 'digest', acknowledgeCost: true,
    }).acknowledgeCost).toBe(true)
    expect(() => HarnessStartParamsSchema.parse({
      planId: 'plan-1', scopeDigest: 'digest', acknowledgeCost: false,
    })).toThrow()
    expect(HarnessCancelParamsSchema.parse({ planId: 'plan-1' })).toEqual({ planId: 'plan-1' })
    expect(HarnessCancelResultSchema.parse({ planId: 'plan-1', cancelled: true }))
      .toEqual({ planId: 'plan-1', cancelled: true })
    expect(HarnessRunReceiptSchema.parse({
      id: 'run-1', planId: 'plan-1', workflow: 'paper-wiki', targetId: 'p1',
      startedAt: '2026-09-17T12:00:00.000Z', state: 'demo-complete', message: 'done',
    }).state).toBe('demo-complete')
    expect(HarnessModelConnectionCheckResultSchema.parse({
      state: 'connected', modelCalls: 1, maxOutputTokens: 1,
    }).state).toBe('connected')
    expect(HarnessModelConnectionCheckResultSchema.parse({
      state: 'failed', reason: 'authentication', detail: 'HTTP 401: invalid API key',
      modelCalls: 1, maxOutputTokens: 1,
    }).state).toBe('failed')
    expect(() => HarnessModelConnectionCheckResultSchema.parse({
      state: 'failed', reason: 'authentication', modelCalls: 1, maxOutputTokens: 1,
    })).toThrow()
    expect(() => HarnessModelConnectionCheckResultSchema.parse({
      state: 'failed', reason: 'authentication', detail: 'x'.repeat(501),
      modelCalls: 1, maxOutputTokens: 1,
    })).toThrow()
    expect(() => HarnessModelConnectionCheckResultSchema.parse({
      state: 'connected', modelCalls: 1, maxOutputTokens: 2,
    })).toThrow()

    for (const provider of ['openai', 'anthropic', 'google-gemini'] as const) {
      const baseUrl = provider === 'openai'
        ? 'https://api.openai.com/v1'
        : provider === 'anthropic'
          ? 'https://api.anthropic.com'
          : 'https://generativelanguage.googleapis.com/v1beta'
      const protocol = provider === 'openai'
        ? 'responses'
        : provider === 'anthropic' ? 'messages' : 'generate-content'
      expect(HarnessModelSettingsUpdateSchema.parse({
        provider, protocol, baseUrl, model: 'model-id', authentication: 'api-key',
      }).provider).toBe(provider)
    }
    expect(HarnessModelSettingsUpdateSchema.parse({
      provider: 'openai-compatible', protocol: 'chat-completions',
      baseUrl: 'https://api.example.com/v1',
      model: 'third-party-model', authentication: 'api-key', apiKey: 'secret',
    }).protocol).toBe('chat-completions')
    expect(HarnessModelSettingsUpdateSchema.parse({
      provider: 'openai-compatible', protocol: 'responses',
      baseUrl: 'http://127.0.0.1:11434/v1',
      model: 'local', authentication: 'none',
    }).provider).toBe('openai-compatible')
    expect(() => HarnessModelSettingsUpdateSchema.parse({
      provider: 'openai-compatible', protocol: 'chat-completions',
      baseUrl: 'http://provider.example/v1',
      model: 'remote', authentication: 'api-key', apiKey: 'secret',
    })).toThrow('远程模型接口必须使用 HTTPS')
    expect(() => HarnessModelSettingsUpdateSchema.parse({
      provider: 'anthropic', protocol: 'messages', baseUrl: 'https://proxy.example/v1',
      model: 'claude', authentication: 'api-key',
    })).toThrow()
  })

  it('Paper Wiki 质量报告的七个维度与问题汇总必须一致', () => {
    const dimensions = [
      'grounding', 'separation', 'retrieval', 'mechanism', 'evidence', 'implementation', 'uncertainty',
    ] as const
    const quality = {
      schemaVersion: 'meridian.paper-wiki-calibration.v1', caseId: 'p1', passed: false,
      dimensions: dimensions.map((id) => ({ id, passed: id !== 'mechanism' })),
      findings: [{
        dimension: 'mechanism', code: 'generic-contract', path: 'mechanism[0]',
        message: 'Mechanism fields are placeholders.',
      }],
    }
    expect(HarnessPaperWikiQualitySchema.parse(quality)).toEqual(quality)
    expect(() => HarnessPaperWikiQualitySchema.parse({
      ...quality, dimensions: dimensions.map((id) => ({ id, passed: true })),
    })).toThrow()
    expect(() => HarnessPaperWikiQualitySchema.parse({
      ...quality, passed: true,
    })).toThrow()
  })

  it('Paper Wiki 丢弃反馈可选且拒绝重复原因', () => {
    expect(HarnessRejectPaperWikiParamsSchema.parse({ proposalId: 'proposal-1' }))
      .toEqual({ proposalId: 'proposal-1' })
    expect(HarnessRejectPaperWikiParamsSchema.parse({
      proposalId: 'proposal-1',
      feedback: {
        reasons: ['source-inaccurate', 'missing-important'],
        note: 'Page 4 contradicts this summary.',
      },
    }).feedback).toEqual({
      reasons: ['source-inaccurate', 'missing-important'],
      note: 'Page 4 contradicts this summary.',
    })
    expect(() => HarnessRejectPaperWikiParamsSchema.parse({
      proposalId: 'proposal-1',
      feedback: { reasons: ['weak-grounding', 'weak-grounding'] },
    })).toThrow()
  })

  it('项目工作区连接只接收本地目录或不含凭据的 SSH 地址', () => {
    expect(ProjectBindWorkspaceParamsSchema.parse({
      id: 'p1', binding: { kind: 'local', root: '/repo' },
    })).toEqual({ id: 'p1', binding: { kind: 'local', root: '/repo' } })
    expect(ProjectBindWorkspaceParamsSchema.parse({
      id: 'p1', binding: { kind: 'ssh', host: 'gpu-lab', path: '/srv/repo', port: 2222 },
    })).toEqual({
      id: 'p1', binding: { kind: 'ssh', host: 'gpu-lab', path: '/srv/repo', port: 2222 },
    })
    expect(ProjectBindWorkspaceParamsSchema.parse({ id: 'p1', binding: null }))
      .toEqual({ id: 'p1', binding: null })
    expect(() => ProjectBindWorkspaceParamsSchema.parse({
      id: 'p1', binding: { kind: 'ssh', host: 'gpu-lab', path: '/srv/repo', password: 'secret' },
    })).toThrow()
  })

  it('库设置只收一个根目录，内部派生路径不跨到页面', () => {
    const location = {
      root: '/library',
      source: 'configured',
      locked: false,
      restartRequired: true,
      openError: null,
    }
    expect(LibraryConfigureParamsSchema.parse({ root: '/library' })).toEqual({ root: '/library' })
    expect(LibraryLocationSchema.parse(location)).toEqual(location)
    expect(LibraryResetResultSchema.parse({
      root: '/library', backupRoot: '/library-backup-20260915-182838Z',
    })).toEqual({ root: '/library', backupRoot: '/library-backup-20260915-182838Z' })
    expect(LibraryBackupSchema.parse({
      id: 'library-backup-20260915-182838Z',
      path: '/library-backup-20260915-182838Z',
      createdAt: '2026-09-15T18:28:38.000Z',
    })).toMatchObject({ id: 'library-backup-20260915-182838Z' })
    expect(LibraryBackupParamsSchema.parse({ id: 'library-backup-20260915-182838Z' }))
      .toEqual({ id: 'library-backup-20260915-182838Z' })
    expect(() => LibraryBackupParamsSchema.parse({ id: 'backup', path: '/anything' })).toThrow()
    expect(() => LibraryConfigureParamsSchema.parse({
      root: '/library', wiki: '/somewhere-else',
    })).toThrow()
    expect(() => LibraryLocationSchema.parse({
      ...location, wiki: '/library/wiki',
    })).toThrow()
  })

  it('论文推送上限只接受 1–100 的整数', () => {
    expect(DeliverySettingsSchema.parse({ maxItemsPerRun: 20 })).toEqual({ maxItemsPerRun: 20 })
    expect(() => DeliverySettingsSchema.parse({ maxItemsPerRun: 0 })).toThrow()
    expect(() => DeliverySettingsSchema.parse({ maxItemsPerRun: 101 })).toThrow()
    expect(() => DeliverySettingsSchema.parse({ maxItemsPerRun: 2.5 })).toThrow()
  })

  it('论文上传只收 PDF 文件名与结构化克隆的二进制', () => {
    const bytes = Uint8Array.from([37, 80, 68, 70, 45])
    expect(PapersImportParamsSchema.parse({ filename: 'paper.pdf', bytes }).bytes).toEqual(bytes)
    expect(() => PapersImportParamsSchema.parse({ filename: 'paper.pdf', bytes: 'JVBERi0=' })).toThrow()
  })

  it('阅读状态保留高亮锚点与个人笔记,mutation 不接受 renderer 指派的 id', () => {
    const reading = {
      paperId: 'p1',
      highlights: [{
        id: 'highlight-1', page: 2, quote: 'quoted evidence',
        rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.02 }],
        color: 'yellow', note: '我的判断', created: '2026-09-14', updated: '2026-09-14',
      }],
      notes: [{
        id: 'note-1', page: 3, text: '复现实验', created: '2026-09-14', updated: '2026-09-14',
      }],
    }
    expect(PaperReadingSchema.parse(reading)).toEqual({ ...reading, remark: '' })
    expect(PaperImportResultSchema.parse({ kind: 'added', paper: {
      id: 'p1', title: 'Paper', venue: '', topics: [], methods: [], datasets: [], metrics: [],
      pageState: 'draft', readState: '未读', projects: [],
      pageCount: 0, noteCount: 0, conclusionCount: 0,
      updated: '2026-09-14', custom: {},
    } }).kind).toBe('added')
    expect(PapersMutateReadingParamsSchema.parse({
      id: 'p1', mutation: {
        kind: 'highlight.add', page: 2, quote: 'quoted evidence', color: 'yellow',
        rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.02 }],
      },
    }).mutation.kind).toBe('highlight.add')
    expect(() => PapersMutateReadingParamsSchema.parse({
      id: 'p1', mutation: {
        kind: 'highlight.add', id: 'renderer-picked', page: 2, quote: 'x', color: 'yellow',
        rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.02 }],
      },
    })).toThrow()
    expect(PapersMutateReadingParamsSchema.parse({
      id: 'p1', mutation: { kind: 'remark.set', text: '整篇的随想' },
    }).mutation.kind).toBe('remark.set')
    expect(() => PapersMutateReadingParamsSchema.parse({
      id: 'p1', mutation: { kind: 'progress.set', page: 0 },
    })).toThrow()
  })

  it('接受一条裁剪后的论文行', () => {
    const row = {
      id: 'paper-pdf-d9571fc4fe92',
      title: 'FIPO: Eliciting Deep Reasoning with Future-KL Influenced Policy Optimization',
      year: 2026,
      venue: 'arXiv',
      topics: ['speculative decoding'],
      methods: ['speculative decoding'],
      datasets: ['GSM8K'],
      metrics: ['accuracy'],
      pageState: 'draft',
      readState: '未读',
      projects: [],
      pageCount: 35,
      noteCount: 0,
      conclusionCount: 5,
      updated: '2026-05-20',
      custom: {},
    }
    expect(PaperRowSchema.parse(row)).toEqual(row)
  })

  it('论文行带它挂着的项目,每一项只有 id 与名字', () => {
    const row = {
      id: 'p1', title: 't', venue: '', topics: [], methods: [], datasets: [], metrics: [],
      pageState: 'draft', readState: '未读', projects: [{ id: 'draft', name: 'draft 效率' }],
      pageCount: 1, noteCount: 0, conclusionCount: 0, updated: '2026-05-20', custom: {},
    }
    expect(PaperRowSchema.parse(row).projects).toEqual([{ id: 'draft', name: 'draft 效率' }])
    expect(() => PaperRowSchema.parse({ ...row, projects: [{ id: 'draft' }] })).toThrow()
  })

  it('发表年份可以没有,来源没写年份的论文不带这一项', () => {
    const { year, ...withoutYear } = {
      id: 'paper-pdf-a6b750e25a61', title: 'STAR', year: 2026, venue: '',
      topics: [], methods: [], datasets: [], metrics: [],
      pageState: 'draft', readState: '未读', projects: [],
      pageCount: 17, noteCount: 0, conclusionCount: 5, updated: '2026-05-20', custom: {},
    }
    expect(year).toBe(2026)
    expect(PaperRowSchema.parse(withoutYear).year).toBeUndefined()
    expect(() => PaperRowSchema.parse({ ...withoutYear, year: '2026' })).toThrow()
    expect(PaperRowSchema.parse({
      ...withoutYear, addedAt: '2026-09-15T14:03:02.001Z',
    }).addedAt).toBe('2026-09-15T14:03:02.001Z')
    expect(() => PaperRowSchema.parse({ ...withoutYear, addedAt: '2026-09-15' })).toThrow()
  })

  it('拒绝 vault 里那些不该跨边界的字段', () => {
    const withNoise = {
      id: 'p1', title: 't', year: 2026, venue: 'arXiv',
      topics: [], methods: [], datasets: [], metrics: [],
      pageState: 'draft', readState: '未读', projects: [],
      pageCount: 1, noteCount: 0, conclusionCount: 1, updated: '2026-05-20', custom: {},
      draft_artifact_root: 'eval/runs/...',
    }
    expect(() => PaperRowSchema.parse(withNoise)).toThrow()
  })

  it('论文的两个状态各有各的词表:页面状态照抄库,阅读状态只收四档', () => {
    const row = {
      id: 'p1', title: 't', venue: '', topics: [], methods: [], datasets: [], metrics: [],
      pageState: 'draft', readState: '未读', projects: [],
      pageCount: 1, noteCount: 0, conclusionCount: 0, updated: '2026-05-20', custom: {},
    }
    // Page-state vocabulary belongs to the vault and is intentionally unconstrained here.
    for (const pageState of ['draft', 'published', '库里以后新加的状态']) {
      expect(PaperRowSchema.parse({ ...row, pageState }).pageState).toBe(pageState)
    }
    expect(READ_STATES).toEqual(['未读', '在读', '已读', '稍后阅读'])
    for (const readState of READ_STATES) {
      expect(PaperRowSchema.parse({ ...row, readState }).readState).toBe(readState)
    }
    // Reading-state vocabulary belongs to the app, so unknown vault values cannot cross the boundary.
    for (const readState of ['draft', '读过', '未读 ', '']) {
      expect(() => PaperRowSchema.parse({ ...row, readState })).toThrow()
    }
    // Both fields are required; either omission invalidates the row.
    expect(() => PaperRowSchema.parse({ ...row, pageState: undefined })).toThrow()
    expect(() => PaperRowSchema.parse({ ...row, readState: undefined })).toThrow()
  })

  it('项目详情的日期是 ISO 字符串而不是 Date', () => {
    expect(ProjectDetailSchema.parse(PROJECT).start).toBe('2026-06-02')
  })

  it('任务的分时窗口只收两小时刻度,旧任务仍可不带窗口', () => {
    const task = {
      id: 't-slot', title: '分时计划', start: '2026-09-15', end: '2026-09-15',
      window: { start: '14:00', end: '18:00' }, state: 'plan', priority: 'p1',
    }
    expect(TaskSchema.parse(task).window).toEqual({ start: '14:00', end: '18:00' })
    expect(TaskSchema.parse({ ...task, window: undefined }).window).toBeUndefined()
    expect(() => TaskSchema.parse({ ...task, window: { start: '14:30', end: '18:00' } })).toThrow()
    expect(ProjectUpdateTaskParamsSchema.parse({
      projectId: 'draft', taskId: 't-slot', patch: { window: null },
    }).patch.window).toBeNull()
  })

  it('一条结论只收三档状态与 ISO 日期,所引论文可以没有', () => {
    const item = {
      id: 'c1', text: '拐点', state: 'pending', date: '2026-09-01', source: '手动添加',
    }
    expect(ConclusionSchema.parse(item)).toEqual(item)
    expect(ConclusionSchema.parse({ ...item, paper: '2404.00456' }).paper).toBe('2404.00456')
    expect(() => ConclusionSchema.parse({ ...item, state: 'done' })).toThrow()
    expect(() => ConclusionSchema.parse({ ...item, date: '09/01' })).toThrow()
    expect(() => ProjectUpdateParamsSchema.parse({ id: 'draft', patch: { conclusionList: [] } })).toThrow()
  })

  it('新建结论要一句不空的话,所引会话与论文可以没有;改档只收三档', () => {
    expect(ProjectCreateConclusionParamsSchema.parse({
      projectId: 'draft', text: ' 拐点 ',
    }).text).toBe('拐点')
    expect(() => ProjectCreateConclusionParamsSchema.parse({
      projectId: 'draft', text: '  ',
    })).toThrow()
    expect(() => ProjectSetConclusionStateParamsSchema.parse({
      projectId: 'draft', conclusionId: 'c1', state: 'done',
    })).toThrow()
  })

  it('项目关联论文只收项目与论文两个 id', () => {
    expect(ProjectPaperParamsSchema.parse({ projectId: 'draft', paperId: 'p1' }))
      .toEqual({ projectId: 'draft', paperId: 'p1' })
    expect(() => ProjectPaperParamsSchema.parse({
      projectId: 'draft', paperId: 'p1', title: '不能顺带写标题',
    })).toThrow()
  })

  it('阻塞是可选的一项,没有阻塞的项目不带它', () => {
    expect(ProjectDetailSchema.parse(PROJECT).block).toBeUndefined()
    expect(ProjectDetailSchema.parse({ ...PROJECT, block: '等 A100 机时(周四释放)' }).block)
      .toBe('等 A100 机时(周四释放)')
  })

  it('改项目时阻塞收一句话或 null,空串不收', () => {
    expect(ProjectUpdateParamsSchema.parse({ id: 'draft', patch: { block: null } }).patch.block)
      .toBeNull()
    expect(ProjectUpdateParamsSchema.parse({ id: 'draft', patch: { block: ' 等机时 ' } }).patch.block)
      .toBe('等机时')
    expect(() => ProjectUpdateParamsSchema.parse({ id: 'draft', patch: { block: '  ' } }))
      .toThrow()
  })

  it('项目概要只带列表屏读的那些字段,成列的内容不跨边界', () => {
    const summary = {
      id: 'draft', name: 'draft 效率', status: '进行中', priority: 'p0',
      topic: 'speculative decoding', focus: '宽树实验补 B≥8',
      conclusions: { verified: 1, pending: 0, conflicting: 1 },
      paperCount: 4,
      milestones: [{ date: '2026-08-28', done: false }],
      recentEvents: [{ date: '2026-08-14', text: '解决冲突:改写为单请求 / 批量两条结论' }],
      control: { next: { source: 'missing' as const, text: '需要定义任务' } },
    }
    expect(ProjectSummarySchema.parse(summary)).toEqual(summary)
    expect(ProjectSummarySchema.parse({ ...summary, block: '等 A100 机时(周四释放)' }).block)
      .toBe('等 A100 机时(周四释放)')
    for (const extra of [
      { tasks: [] }, { memo: '' }, { events: [] }, { relations: [] }, { attachments: [] },
      { graph: { nodes: [], edges: [] } }, { agentSessions: [] },
    ]) {
      expect(() => ProjectSummarySchema.parse({ ...summary, ...extra })).toThrow()
    }
    // Summary milestones expose only date and completion; title and ID remain in details.
    expect(() => ProjectSummarySchema.parse({
      ...summary, milestones: [{ id: 'm2', date: '2026-08-28', title: '宽树实验补 B≥8', done: false }],
    })).toThrow()
  })

  it('总览的一条项目带计划、科研记录与紧凑科研图投影,其余详情不跨边界', () => {
    const row = {
      id: 'draft', name: 'draft 效率', status: '进行中', priority: 'p0', focus: '宽树实验补 B≥8',
      start: '2026-06-02', due: '2026-09-15',
      conclusions: { verified: 1, pending: 0, conflicting: 1 },
      tasks: [{
        id: 't1', title: '跑延迟测量', start: '2026-08-27', end: '2026-08-27',
        window: { start: '08:00', end: '10:00' }, state: 'act', priority: 'p0',
      }],
      milestones: [{ id: 'm1', date: '2026-08-28', title: '宽树实验补 B≥8', done: false }],
      events: [{ date: '2026-06-02', text: '开始这条研究线' }],
      research: {
        pathState: 'active',
        activeNodes: [
          { id: 'root', label: 'draft 效率', state: 'done', mode: 'supported' },
          { id: 'wide', label: '宽树补 B≥8', state: 'act', mode: 'repairable' },
        ],
        branches: { active: 1, supported: 1, failed: 1, shelved: 0 },
      },
    }
    expect(ProjectOverviewSchema.parse(row)).toEqual(row)
    expect(ProjectOverviewSchema.parse({ ...row, block: '等 A100 机时(周四释放)' }).block)
      .toBe('等 A100 机时(周四释放)')
    // Overview omits topics, paper count, conflict page, and other detailed collections.
    for (const extra of [
      { topic: 'speculative decoding' }, { paperCount: 4 }, { conflictPage: 'knee' },
      { conclusionList: [] }, { memo: '' }, { relations: [] }, { attachments: [] },
      { graph: { nodes: [], edges: [] } }, { agentSessions: [] },
    ]) {
      expect(() => ProjectOverviewSchema.parse({ ...row, ...extra })).toThrow()
    }
    // Gantt tips, next milestones, and attention items need titles that summary milestones do not carry.
    expect(() => ProjectOverviewSchema.parse({
      ...row, milestones: [{ date: '2026-08-28', done: false }],
    })).toThrow()
  })

  it('科研图的边是两个节点 id,多一个少一个都不收', () => {
    expect(ProjectDetailSchema.parse(PROJECT).graph.edges[0]).toEqual(['root', 'knee'])
    for (const edges of [[['root']], [['root', 'knee', 'wide']], [['root', 2]]]) {
      expect(() => ProjectDetailSchema.parse({ ...PROJECT, graph: { ...PROJECT.graph, edges } })).toThrow()
    }
  })

  it('节点可投影 Agent Markdown 与研究状态;旧写回只作兼容且日期必须是 ISO', () => {
    const node = { id: 'knee', label: '树宽收益拐点', state: 'done', x: 220, y: 30, width: 130 }
    const writeback = { page: 'topics/ptq', text: '拐点不是一个数', date: '2026-06-25' }
    expect(GraphNodeSchema.parse({
      ...node,
      mode: 'supported',
      markdown: '#### Evidence\n\nWidth sweep passed.',
      markdownPath: '.meridian/threads/spec.md',
      markdownAnchor: 'node-b-knee',
      writebacks: [writeback],
    })).toMatchObject({ mode: 'supported', markdown: '#### Evidence\n\nWidth sweep passed.' })
    expect(() => GraphNodeSchema.parse({ ...node, writebacks: [], page: 'topics/ptq' })).toThrow()
    expect(() => GraphNodeSchema.parse({ ...node, writebacks: [{ ...writeback, date: '06/25' }] })).toThrow()
  })

  it('科研记录的一条可以挂在科研图的一个节点上,没挂的没有这一项', () => {
    const events = [
      { date: '2026-06-09', text: '结论「树宽收益拐点」', node: 'knee' },
      { date: '2026-08-14', text: '解决冲突' },
    ]
    expect(ProjectDetailSchema.parse({ ...PROJECT, events }).events).toEqual(events)
    expect(ProjectDetailSchema.parse(PROJECT).events[0]!.node).toBeUndefined()
  })

  it('agent 会话的一步是时刻与正文两段,别的键不收', () => {
    const session = ProjectDetailSchema.parse(PROJECT).agentSessions[0]!
    expect(session.steps[0]).toEqual({
      time: '16:10', text: '接到任务:把分支浪费按深度分桶的统计固化成可复跑脚本',
    })
    expect(session.outcome).toBe('2 个文件改动 · 结果与手工分析一致 · 共 31 分钟')
    const noisyStep = { ...PROJECT.agentSessions[0]!.steps[0], state: 'done' }
    const noisy = { ...PROJECT.agentSessions[0], steps: [noisyStep] }
    expect(() => ProjectDetailSchema.parse({ ...PROJECT, agentSessions: [noisy] })).toThrow()
  })

  it('导出的 fixture 全部符合契约', () => {
    expect(papers.length).toBe(291)
    // Fixtures mirror vault shape: paper pages omit readState and receive a default on read.
    expect(papers.every((row) => !('readState' in row))).toBe(true)
    // File identity defines the page; referenced source is a page field that does not cross this boundary.
    // Example wiki page IDs happen to equal their arXiv source IDs rather than synthesized PDF hashes.
    expect(papers.every((row) => /^paper-pdf-[0-9a-f]{12}$/.test(row.sourceId) || /^\d{4}\.\d{5}$/.test(row.sourceId)))
      .toBe(true)
    const FixtureRowSchema = PaperRowSchema.extend({ sourceId: z.string() })
    for (const row of papers) FixtureRowSchema.parse({ ...row, readState: UNREAD_PAPER, projects: [] })
  })

  it('fixture 里每条论文的 id 唯一,记着的原文也各不相同', () => {
    expect(new Set(papers.map(p => p.id)).size).toBe(papers.length)
    expect(new Set(papers.map(p => p.sourceId)).size).toBe(papers.length)
  })

  it('papers.update 收人工可校正的书目字段与个人字段,系统写的与派生的仍拒绝', () => {
    expect(PapersUpdateParamsSchema.parse({ id: 'p1', patch: { topics: ['kv cache'] } }).patch.topics)
      .toEqual(['kv cache'])
    expect(PapersUpdateParamsSchema.parse({ id: 'p1', patch: { readState: '在读' } }).patch.readState)
      .toBe('在读')
    expect(PapersUpdateParamsSchema.parse({
      id: 'p1', patch: { title: '改个名', shortTitle: '简称', year: 2020, venue: 'ICML', rating: 4 },
    }).patch).toMatchObject({ title: '改个名', shortTitle: '简称', year: 2020, venue: 'ICML', rating: 4 })
    // Read state is user-authored, but values outside the vocabulary are still rejected.
    expect(() => PapersUpdateParamsSchema.parse({ id: 'p1', patch: { readState: '读过' } })).toThrow()
    const rejected = [
      // Three counts derived by the vault.
      { pageCount: 9 }, { noteCount: 9 }, { conclusionCount: 9 },
      // Manual correction cannot overwrite extracted collections, system page state, or update time.
      { methods: ['kv cache'] },
      { datasets: ['GSM8K'] }, { metrics: ['accuracy'] },
      { pageState: 'published' }, { updated: '2026-05-21' },
      // ID locates the source; changing it would break lookup of the corresponding PDF filename.
      { id: 'other' },
      { notAField: 'x' },
    ]
    for (const patch of rejected) {
      expect(() => PapersUpdateParamsSchema.parse({ id: 'p1', patch })).toThrow()
    }
  })

  it('列配置:三个默认值把老配置补齐,多一项不收', () => {
    const old = { hidden: ['datasets'], custom: [{ key: 'note', label: '备注' }] }
    expect(PaperColumnsSchema.parse(old)).toEqual({
      hidden: ['datasets'],
      custom: [{ key: 'note', label: '备注', type: 'text', options: [] }],
      groups: ['topics', 'projects', 'readState'],
    })
    expect(() => PaperColumnsSchema.parse({ ...old, widths: {} })).toThrow()
    expect(() => PaperColumnsSchema.parse({
      ...old, custom: [{ key: 'a', label: 'x', type: 'lookup', options: [] }],
    })).toThrow()
  })

  it('多选格子是一列值,单选与文本格子是一个值,两种都过得了边界', () => {
    const patch = { custom: { note: '读到一半', tags: ['综述', '必读'] } }
    expect(PapersUpdateParamsSchema.parse({ id: 'a', patch }).patch.custom).toEqual(patch.custom)
    expect(() => PapersUpdateParamsSchema.parse({ id: 'a', patch: { custom: { n: 1 } } })).toThrow()
  })

  it('patch 的 custom 只带改了的格,null 是清空这一格', () => {
    const patch = { custom: { note: null, tags: ['综述'] } }
    expect(PapersUpdateParamsSchema.parse({ id: 'a', patch }).patch.custom).toEqual(patch.custom)
    expect(() => PapersUpdateParamsSchema.parse({ id: 'a', patch: { custom: { note: undefined } } })).toThrow()
  })

  it('分组字段收得下自定义列的 key', () => {
    expect(PapersFacetsParamsSchema.parse({ field: 'du-fa' }).field).toBe('du-fa')
    expect(ListParamsSchema.parse({ page: 1, size: 10, facet: { field: 'du-fa', value: '精读' } })
      .facet?.field).toBe('du-fa')
    expect(() => PapersFacetsParamsSchema.parse({ field: '' })).toThrow()
  })

  it('选项改名的入参:列、旧名、新名三项齐全,多一项不收', () => {
    const params = { key: 'du-fa', from: '精读', to: '细读' }
    expect(PapersRenameOptionParamsSchema.parse(params)).toEqual(params)
    for (const bad of [
      { from: '精读', to: '细读' },
      { key: 'du-fa', to: '细读' },
      { key: 'du-fa', from: '精读' },
      { ...params, label: '读法' },
    ]) {
      expect(() => PapersRenameOptionParamsSchema.parse(bad)).toThrow()
    }
  })

  it('改类型的入参:列与类型两项齐全,类型只收三档,多一项不收', () => {
    expect(PapersSetColumnTypeParamsSchema.parse({ key: 'tags', type: 'text' })).toEqual({ key: 'tags', type: 'text' })
    for (const bad of [
      { type: 'text' }, { key: 'tags' }, { key: 'tags', type: 'date' }, { key: 'tags', type: 'text', label: '标签' },
    ]) {
      expect(() => PapersSetColumnTypeParamsSchema.parse(bad)).toThrow()
    }
  })

  it('project.updateTask 的 patch 只收任务自身的字段,id 与契约之外的键都拒绝', () => {
    expect(ProjectUpdateTaskParamsSchema
      .parse({ projectId: 'draft', taskId: 't1', patch: { state: 'done' } }).patch.state).toBe('done')
    for (const patch of [
      { notAField: 'x' },
      // `taskId` selects the record and the patch cannot change its identity.
      { id: 'other' },
    ]) {
      expect(() => ProjectUpdateTaskParamsSchema.parse({ projectId: 'draft', taskId: 't1', patch })).toThrow()
    }
  })

  it('项目状态只收词表里那三个,别的字符串一律拒绝', () => {
    for (const status of PROJECT_STATUSES) {
      expect(ProjectDetailSchema.parse({ ...PROJECT, status }).status).toBe(status)
    }
    for (const status of ['归档', '进行中 ', 'active', '']) {
      expect(() => ProjectDetailSchema.parse({ ...PROJECT, status })).toThrow()
      expect(() => ProjectUpdateParamsSchema.parse({ id: 'draft', patch: { status } })).toThrow()
    }
  })

  it('project.update 的 patch 只收项目自身的字段,聚合出来的与成列的都拒绝', () => {
    expect(ProjectUpdateParamsSchema.parse({ id: 'draft', patch: { status: '搁置' } }).patch.status).toBe('搁置')
    expect(ProjectUpdateParamsSchema.parse({ id: 'draft', patch: { memo: '改过的随笔' } }).patch.memo)
      .toBe('改过的随笔')
    const rejected = [
      { tasks: [] }, { milestones: [] }, { events: [] }, { relations: [] }, { attachments: [] },
      { conclusions: { verified: 9, pending: 0, conflicting: 0 } }, { conclusionList: [] },
      { paperCount: 9 },
      { graph: { nodes: [], edges: [] } }, { agentSessions: [] }, { notAField: 'x' },
      // The vault recognizes projects by ID, which the patch cannot change.
      { id: 'other' },
    ]
    for (const patch of rejected) {
      expect(() => ProjectUpdateParamsSchema.parse({ id: 'draft', patch })).toThrow()
    }
  })

  it('新建项目只收名字,别的键都不收', () => {
    expect(ProjectCreateParamsSchema.parse({ name: '新项目' }).name).toBe('新项目')
    for (const bad of [{}, { name: '新项目', id: 'p9' }, { name: '新项目', status: '进行中' }]) {
      expect(() => ProjectCreateParamsSchema.parse(bad)).toThrow()
    }
  })

  it('删除项目只收一个项目 id', () => {
    expect(ProjectDeleteParamsSchema.parse({ id: 'draft' }).id).toBe('draft')
    expect(() => ProjectDeleteParamsSchema.parse({ id: 'draft', name: '新项目' })).toThrow()
  })

  it('新建关联与附件的入参不收 id,id 由 core 指派', () => {
    const relation = { group: 'Wiki', text: '树宽收益拐点' }
    expect(ProjectCreateRelationParamsSchema.parse({ projectId: 'draft', relation }).relation.group).toBe('Wiki')
    expect(ProjectCreateRelationParamsSchema.parse({
      projectId: 'draft', relation: { ...relation, page: 'topics/speculative-decoding' },
    }).relation.page).toBe('topics/speculative-decoding')
    expect(() =>
      ProjectCreateRelationParamsSchema.parse({ projectId: 'draft', relation: { ...relation, id: 'r9' } }),
    ).toThrow()

    const attachment = { name: 'sweep.csv', size: '12 KB', path: '/tmp/sweep.csv' }
    expect(ProjectCreateAttachmentParamsSchema.parse({ projectId: 'draft', attachment }).attachment.size)
      .toBe('12 KB')
    expect(() =>
      ProjectCreateAttachmentParamsSchema.parse({ projectId: 'draft', attachment: { ...attachment, id: 'f9' } }),
    ).toThrow()
  })

  it('project.updateMilestone 的 patch 只收里程碑自身的字段,id 与契约之外的键都拒绝', () => {
    expect(ProjectUpdateMilestoneParamsSchema
      .parse({ projectId: 'draft', milestoneId: 'm1', patch: { done: true } }).patch.done).toBe(true)
    for (const patch of [
      { notAField: 'x' },
      // `milestoneId` selects the record and the patch cannot change its identity.
      { id: 'other' },
    ]) {
      expect(() =>
        ProjectUpdateMilestoneParamsSchema.parse({ projectId: 'draft', milestoneId: 'm1', patch })).toThrow()
    }
  })

  it('papers.list 的排序键与方向只收契约里的取值,分组字段不能是空串', () => {
    const params = {
      page: 1, size: 10, sort: 'title', direction: 'desc',
      facet: { field: 'topics', value: 'speculative decoding' },
    }
    expect(ListParamsSchema.parse(params)).toEqual(params)
    expect(ListParamsSchema.parse({ page: 1, size: 10, sort: 'authors' }).sort).toBe('authors')
    expect(ListParamsSchema.parse({ page: 1, size: 10, sort: 'addedAt' }).sort).toBe('addedAt')
    for (const bad of [{ sort: 'venue' }, { direction: 'up' }, { facet: { field: '', value: 'arXiv' } }]) {
      expect(() => ListParamsSchema.parse({ page: 1, size: 10, ...bad })).toThrow()
    }
  })

  it('papers.facets 收下内置可分组字段,筛选词可选', () => {
    expect(PapersFacetsParamsSchema.parse({ field: 'readState' }).field).toBe('readState')
    expect(PapersFacetsParamsSchema.parse({ field: 'readState', filter: 'quantization' }).filter)
      .toBe('quantization')
  })

  it('垃圾桶条目只有 id、类型、标题、删除时刻与能否恢复五项,类型只收契约里的五种', () => {
    const entry = {
      id: 'trash-1', kind: 'paper', title: 'LongSpec', deletedAt: 1787000000000, restorable: true,
    }
    expect(TrashEntrySchema.parse(entry)).toEqual(entry)
    expect(TrashEntrySchema.parse({ ...entry, kind: 'attachment' }).kind).toBe('attachment')
    expect(TrashEntrySchema.parse({ ...entry, kind: 'project' }).kind).toBe('project')
    expect(TrashEntrySchema.parse({ ...entry, kind: 'inbox' }).kind).toBe('inbox')
    expect(TrashEntrySchema.parse({ ...entry, kind: 'idea' }).kind).toBe('idea')
    expect(() => TrashEntrySchema.parse({ ...entry, kind: '项目' })).toThrow()
    // Automatic retention is calculated from deletion time, which every record carries as epoch milliseconds.
    expect(() => TrashEntrySchema.parse({ id: entry.id, kind: entry.kind, title: entry.title }))
      .toThrow()
    expect(() => TrashEntrySchema.parse({ ...entry, deletedAt: '2026-08-25' })).toThrow()
    // Every record carries the restorable flag that controls the restore button.
    expect(() => TrashEntrySchema.parse({ ...entry, restorable: undefined })).toThrow()
  })

  it('最近变动的一条带日期、来源、逐行 diff 与撤没撤过,来源收的是那四种', () => {
    const entry = {
      id: 'chg-1',
      title: '你的结论「分支浪费」 · v2 → v3',
      meta: '昨天 · 实验 #3 的结果回流',
      date: '2026-08-24',
      source: '实验',
      diff: ['- v2:长上下文下效应更强(推测)', '+ v3:batch≥8 实测确认(实验 #3)'],
      undone: false,
      undoable: true,
      archived: false,
    }
    expect(ChangeEntrySchema.parse(entry)).toEqual(entry)
    expect(ChangeEntrySchema.parse({ ...entry, source: '笔记' }).source).toBe('笔记')
    // The user-authored source is intentionally added beyond the demo's four source filters.
    expect(ChangeEntrySchema.parse({ ...entry, source: '我' }).source).toBe('我')
    expect(() => ChangeEntrySchema.parse({ ...entry, source: '你' })).toThrow()
    // Date drives sectioning and must be ISO rather than human-readable metadata.
    expect(() => ChangeEntrySchema.parse({ ...entry, date: '昨天' })).toThrow()
    // Every entry carries date, undo state, current undoability, and archive state.
    for (const missing of ['date', 'undone', 'undoable', 'archived']) {
      expect(() => ChangeEntrySchema.parse({ ...entry, [missing]: undefined })).toThrow()
    }
    // Restoration snapshots and fingerprints stay entirely inside Core.
    expect(() => ChangeEntrySchema.parse({ ...entry, restore: { kind: 'trash', entry: 'trash-1' } }))
      .toThrow()
    expect(ChangelogDeleteParamsSchema.parse({ id: entry.id })).toEqual({ id: entry.id })
    expect(() => ChangelogDeleteParamsSchema.parse({ id: entry.id, reason: '不需要了' })).toThrow()
  })

  it('最近变动的 fixture 全部符合契约', () => {
    expect(changes.length).toBe(4)
    // Legacy fixture entries predate undo and archive support; reads supply the three missing fields.
    expect(changes.every((entry) =>
      !('undone' in entry) && !('undoable' in entry) && !('archived' in entry))).toBe(true)
    for (const entry of changes) {
      ChangeEntrySchema.parse({ ...entry, undone: false, undoable: false, archived: false })
    }
  })

  it('动态的正文是一串带排版角色的分段,角色只收 demo 用到的那三种', () => {
    const entry = {
      id: 'feed-3',
      source: 'steward',
      day: '昨天',
      time: '昨天 22:16',
      body: {
        kind: 'runs',
        runs: [
          { kind: 'text', text: '你的问题已记下:' },
          { kind: 'cite', text: '「树宽收益有拐点」' },
          { kind: 'strong', text: '单请求' },
        ],
      },
    }
    expect(FeedEntrySchema.parse(entry)).toEqual(entry)
    expect(FeedEntrySchema.parse({
      ...entry, createdAt: '2026-09-19T14:03:02.001Z',
    }).createdAt).toBe('2026-09-19T14:03:02.001Z')
    expect(() => FeedEntrySchema.parse({ ...entry, createdAt: '刚刚' })).toThrow()
    expect(() => FeedEntrySchema.parse({ ...entry, source: '你' })).toThrow()
    expect(() => FeedEntrySchema.parse({
      ...entry, body: { kind: 'runs', runs: [{ kind: 'em', text: '单请求' }] },
    })).toThrow()
  })

  it('动态的另一种正文是简报,两种正文混着写不收', () => {
    const brief = {
      id: 'feed-5',
      source: 'steward',
      day: '今天',
      time: '早报',
      body: {
        kind: 'brief',
        heading: '昨晚整理了 11 处(都可撤销)· 1 件需要你看',
        items: [{
          id: 'brief-1',
          tag: '两条结论冲突',
          text: '「树宽收益有拐点」vs「批量场景仍净赚」',
          action: '看看',
        }],
      },
    }
    expect(FeedEntrySchema.parse(brief)).toEqual(brief)
    expect(() => FeedEntrySchema.parse({
      ...brief, body: { ...brief.body, runs: [{ kind: 'text', text: '你的问题已记下:' }] },
    })).toThrow()
    // The demo hard-codes the destination of the display-only action label, so it has no contract field.
    expect(() => FeedEntrySchema.parse({
      ...brief,
      body: { ...brief.body, items: [{ ...brief.body.items[0], target: 'chat' }] },
    })).toThrow()
  })

  it('动态的 fixture 全部符合契约', () => {
    expect(feed.length).toBe(5)
    for (const entry of feed) FeedEntrySchema.parse(entry)
  })

  it('主题关注保持最小字段,作者可带经用户确认的稳定身份', () => {
    const watch = { id: 'spec', type: 'topic', name: 'speculative decoding', active: true }
    expect(WatchSchema.parse(watch)).toEqual(watch)
    expect(WatchSchema.parse({ ...watch, type: 'author' }).type).toBe('author')
    const author = {
      id: 'dao', type: 'author', name: 'Tri Dao', active: true,
      identity: {
        source: 'semantic-scholar', id: 'author-1', affiliations: ['Princeton University'],
      },
    }
    expect(WatchSchema.parse(author)).toEqual(author)
    expect(() => WatchSchema.parse({ ...watch, identity: author.identity })).toThrow()
    expect(() => WatchSchema.parse({ ...watch, type: '主题' })).toThrow()
    // The UI combines type and name into a watch display label; the contract stores neither composite.
    expect(() => WatchSchema.parse({ ...watch, label: '主题 · speculative decoding' })).toThrow()
  })

  it('新建与更新关注不收 id 与启停,作者身份可选以兼容旧关注', () => {
    const watch = {
      type: 'author', name: 'A. Gu',
      identity: { source: 'semantic-scholar', id: 'author-2', affiliations: ['MIT'] },
    }
    expect(WatchCreateParamsSchema.parse({ watch }).watch).toEqual(watch)
    expect(() => WatchCreateParamsSchema.parse({ watch: { ...watch, id: 'w1' } })).toThrow()
    expect(() => WatchCreateParamsSchema.parse({ watch: { ...watch, active: true } })).toThrow()
    expect(WatchUpdateParamsSchema.parse({ id: 'dao', watch })).toEqual({ id: 'dao', watch })
    expect(() => WatchUpdateParamsSchema.parse({ watch })).toThrow()
    expect(WatchSetActiveParamsSchema.parse({ id: 'spec', active: false }).active).toBe(false)
    expect(() => WatchSetActiveParamsSchema.parse({ id: 'spec' })).toThrow()
    expect(WatchDeleteParamsSchema.parse({ id: 'spec' }).id).toBe('spec')
  })

  it('关注建议限定来源、数量和作者稳定身份，并拒绝额外字段', () => {
    expect(WatchSuggestionParamsSchema.parse({
      source: 'focus', focus: 'efficient inference with speculative decoding',
    })).toEqual({ source: 'focus', focus: 'efficient inference with speculative decoding' })
    expect(WatchSuggestionParamsSchema.parse({ source: 'project', projectId: 'draft' }))
      .toEqual({ source: 'project', projectId: 'draft' })
    expect(() => WatchSuggestionParamsSchema.parse({
      source: 'focus', focus: 'speculative decoding', projectId: 'draft',
    })).toThrow()

    const result = {
      topics: [{ name: 'speculative decoding', relatedPapers: 12 }],
      authors: [{
        source: 'openalex' as const, id: 'author-1', name: 'Ada Expert', affiliations: ['MIT'], relatedPapers: 4,
        paperCount: 120, citationCount: 8_000, hIndex: 42,
      }],
      paperCount: 24,
    }
    expect(WatchSuggestionResultSchema.parse(result)).toEqual(result)
    expect(() => WatchSuggestionResultSchema.parse({ ...result, model: 'none' })).toThrow()
    expect(() => WatchSuggestionResultSchema.parse({
      ...result, authors: [{ ...result.authors[0], relatedPapers: 0 }],
    })).toThrow()
  })

  it('收件的一条带来路快照与可选的 PDF 地址,不带入库时才用得上的那几项', () => {
    const entry = {
      id: 'specdec', watch: 'spec', source: '主题 · speculative decoding',
      title: 'Fast Inference from Transformers via Speculative Decoding',
      authors: 'Yaniv Leviathan, Matan Kalman, Yossi Matias',
      venue: 'ICML 2023 Oral · arXiv:2211.17192',
      abstract: 'Inference from large autoregressive models like Transformers is slow',
      rec: '主题订阅回填的奠基文', downloaded: false, paper: 'paper-pdf-e0b2ea3a1a54',
      pdf: 'https://arxiv.org/pdf/2211.17192',
    }
    expect(InboxEntrySchema.parse(entry)).toEqual({
      ...entry, kind: 'watch', project: '', reasons: [],
    })
    expect(InboxEntrySchema.parse({ ...entry, venue: '' }).venue).toBe('')
    // Frozen provenance is required so section headers survive watch removal.
    expect(() => InboxEntrySchema.parse({ ...entry, source: undefined })).toThrow()
    // The imported paper ID is required because reading targets it rather than the recommendation ID.
    expect(() => InboxEntrySchema.parse({ ...entry, paper: undefined })).toThrow()
    // Every recommendation carries a source URL; Core migrates legacy records to an empty string.
    expect(InboxEntrySchema.parse(entry).pdf).toBe('https://arxiv.org/pdf/2211.17192')
    expect(() => InboxEntrySchema.parse({ ...entry, pdf: undefined })).toThrow()
    expect(InboxEntrySchema.parse({
      ...entry,
      ranking: {
        relevance: 0.9, published: true, citationCount: 100,
        influentialCitationCount: 8, submitted: '2022-11-30',
      },
    }).ranking?.citationCount).toBe(100)
    // Import topics are vault-only data not needed by the UI boundary.
    expect(() => InboxEntrySchema.parse({
      ...entry, vault: { topic: 'speculative decoding' },
    })).toThrow()
  })

  it('入库的结果说清是写了还是撞上了库里已有的那一篇', () => {
    expect(InboxDownloadResultSchema.parse({ kind: 'added', paper: 'paper-pdf-e0b2ea3a1a54' }))
      .toEqual({ kind: 'added', paper: 'paper-pdf-e0b2ea3a1a54' })
    // Existing-source results include the authoritative vault page title for the notice.
    const existing = { kind: 'existing', paper: 'paper-pdf-e0b2ea3a1a54', title: 'LONGSPEC' }
    expect(InboxDownloadResultSchema.parse(existing)).toEqual(existing)
    expect(() => InboxDownloadResultSchema.parse({ kind: 'existing', paper: 'p1' })).toThrow()
    expect(() => InboxDownloadResultSchema.parse({ kind: 'added', paper: 'p1', title: 'x' })).toThrow()
    expect(() => InboxDownloadResultSchema.parse({ kind: '已入库', paper: 'p1' })).toThrow()
  })

  it('收件的三个写入口各只收一个条目 id', () => {
    expect(InboxDismissParamsSchema.parse({ id: 'specdec' }).id).toBe('specdec')
    expect(InboxReadLaterParamsSchema.parse({ id: 'specdec' }).id).toBe('specdec')
    expect(InboxDownloadParamsSchema.parse({ id: 'specdec' }).id).toBe('specdec')
    expect(LaterRemoveParamsSchema.parse({ id: 'specdec' }).id).toBe('specdec')
    expect(() => InboxDismissParamsSchema.parse({ id: 'specdec', watch: 'spec' })).toThrow()
  })

  it('稍后阅读的一条带 ISO 的入队日期与算好的分段', () => {
    const entry = {
      id: 'thunderkv', title: 'ThunderKV: Fused Attention Kernels for Long-Context Serving',
      source: '作者 · T. Dao', added: '2026-08-24', day: '昨天',
      authors: 'Dao, Fu, Rodriguez', venue: 'MLSys 2026', abstract: 'We introduce ThunderKV',
      downloaded: false, paper: 'paper-pdf-44a807f9f2db',
    }
    expect(LaterEntrySchema.parse(entry)).toEqual(entry)
    expect(() => LaterEntrySchema.parse({ ...entry, added: '8/24' })).toThrow()
    expect(() => LaterEntrySchema.parse({ ...entry, watch: 'dao' })).toThrow()
    // Reading targets the referenced paper, not the queue entry's own ID.
    expect(() => LaterEntrySchema.parse({ ...entry, paper: undefined })).toThrow()
    // Every entry carries the downloaded flag that controls whether reading is available.
    expect(() => LaterEntrySchema.parse({ ...entry, downloaded: undefined })).toThrow()
  })

  it('收件、稍后阅读与关注的 fixture 全部符合契约', () => {
    expect(inbox.length).toBe(6)
    expect(later.length).toBe(4)
    expect(watches.length).toBe(3)
    // Stored records contain extra inbox linkage plus derived queue grouping and download state.
    for (const { vault, ...entry } of inbox) {
      expect(vault).toBeDefined()
      InboxEntrySchema.parse(entry)
    }
    for (const entry of later) LaterEntrySchema.omit({ day: true, downloaded: true }).parse(entry)
    for (const watch of watches) WatchSchema.parse(watch)
    expect(inbox.filter((e) => e.pdf !== '').map((e) => e.id)).toHaveLength(6)
  })

  it('聚合卡只收卡面那几项,卡面之外的东西不跨边界', () => {
    const card = {
      id: 'topics/leaf', kind: 'topic', kindLabel: '问题', title: 'Leaf', summary: '叶子。',
      updated: '2026-09-09', childCount: 0, memberCount: 2, parentCount: 1,
    }
    expect(WikiAggregationCardSchema.parse(card)).toEqual(card)
    expect(() => WikiAggregationCardSchema.parse({ ...card, lede: '导语' })).toThrow()
    // Update date is ISO rather than human-readable relative text.
    expect(() => WikiAggregationCardSchema.parse({ ...card, updated: '8 月 5 日' })).toThrow()
  })

  it('wiki 首页三项齐全,旧首页的页数、领域与主题格不再收', () => {
    const home = {
      aggregationCount: 3,
      kinds: [{ key: 'topic', label: '问题', dir: 'topics', count: 2 }],
      roots: [],
    }
    expect(WikiHomeSchema.parse(home)).toEqual(home)
    expect(() => WikiHomeSchema.parse({
      pageCount: 8, domain: {}, topics: [],
    })).toThrow()
  })

  it('wiki 的两个按 id 取的入口各只收一个 id', () => {
    expect(WikiAggregationParamsSchema.parse({ id: 'topics/leaf' }).id).toBe('topics/leaf')
    expect(WikiPaperParamsSchema.parse({ id: 'papers/a' }).id).toBe('papers/a')
    expect(() => WikiAggregationParamsSchema.parse({ id: 'topics/leaf', kind: 'topic' })).toThrow()
    expect(() => WikiPaperParamsSchema.parse({})).toThrow()
  })

  it('第六种 op 是 setParents;source 多一个 user', () => {
    const proposal = {
      source: 'user', title: '把 X 挂到 Y 下',
      ops: [{ op: 'setParents', page: 'topics/x', parents: ['topics/y', 'topics/z'] }],
    }
    expect(ProposalSchema.parse(proposal)).toEqual(proposal)
    expect(() => ProposalSchema.parse({ ...proposal, source: 'ui' })).toThrow()
    expect(() => ProposalOpSchema.parse({ op: 'setParents', page: 'topics/x' })).toThrow()
  })

  it('wiki 的 fixture 全部符合契约:每页聚合与每篇论文都过得了契约', () => {
    const data = wikiFixture as WikiData
    const aggregationIds = wikiSearchIndex(data).map((hit) => hit.target)
    expect(aggregationIds.length).toBeGreaterThan(0)
    for (const id of aggregationIds) WikiAggregationSchema.parse(wikiAggregation(data, id))
    for (const row of papers) WikiPaperSchema.parse(wikiPaper(data, `papers/${row.id}`))
  })

  it('项目里那几处 wiki 跳转的目标都指向真的聚合页', () => {
    const data = wikiFixture as WikiData
    const ids = new Set(wikiSearchIndex(data).map((hit) => hit.target))
    const targets = projects.flatMap((p) => [
      ...(p.conflictPage === undefined ? [] : [p.conflictPage]),
      ...p.graph.nodes.flatMap((n) => n.writebacks.map((w) => w.page)),
      ...p.relations.flatMap((r) => r.items.flatMap((i) => ('page' in i ? [i.page] : []))),
    ])
    expect(targets.length).toBeGreaterThan(0)
    for (const target of targets) expect(ids.has(target)).toBe(true)
    const store = createFixtureStore()
    for (const project of projects) ProjectDetailSchema.parse(store.getProject(project.id))
  })

  it('恢复与彻底删除只收一个垃圾桶条目 id', () => {
    expect(TrashRestoreParamsSchema.parse({ id: 'trash-1' }).id).toBe('trash-1')
    expect(TrashPurgeParamsSchema.parse({ id: 'trash-1' }).id).toBe('trash-1')
    expect(() => TrashRestoreParamsSchema.parse({ id: 'trash-1', kind: 'paper' })).toThrow()
    expect(() => TrashPurgeParamsSchema.parse({})).toThrow()
  })

  it('消息的正文按排版角色分段,角色只收对话造得出的那两种', () => {
    const message = {
      id: 'am1',
      role: 'you',
      runs: [
        { kind: 'mention', text: '@draft 效率' },
        { kind: 'text', text: ' 这条线还剩什么' },
      ],
      actions: [],
    }
    expect(ChatMessageSchema.parse(message)).toEqual(message)
    expect(ChatMessageSchema.parse({ ...message, role: 'ai' }).role).toBe('ai')
    expect(ChatMessageSchema.parse({ ...message, role: 'status' }).role).toBe('status')
    expect(() => ChatMessageSchema.parse({ ...message, role: 'steward' })).toThrow()
    // Chat cannot produce feed-style emphasis or citation runs, so those kinds are absent here.
    for (const kind of ['strong', 'cite', 'hint', 'em']) {
      expect(() => ChatMessageSchema.parse({ ...message, runs: [{ kind, text: '可能都对' }] })).toThrow()
    }
    // Only timestamp and speaker cross the boundary because demo messages carry no additional metadata.
    expect(() => ChatMessageSchema.parse({ ...message, time: '刚刚' })).toThrow()
  })

  it('消息下面的按钮只有写回一种,必须指到项目', () => {
    const runs = [{ kind: 'text', text: '已加载项目《draft 效率》' }]
    const withAction = (actions: unknown[]) => ({ id: 'am3', role: 'ai', runs, actions })
    expect(ChatMessageSchema.parse(withAction([
      { kind: 'writeBack', label: '把这条写回科研记录', project: 'draft', text: '来自对话的结论' },
    ])).actions[0]).toEqual({
      kind: 'writeBack', label: '把这条写回科研记录', project: 'draft', text: '来自对话的结论',
    })
    // A write-back without a target cannot form an actionable button.
    expect(() => ChatMessageSchema.parse(withAction([
      { kind: 'writeBack', label: '把这条写回科研记录' },
    ]))).toThrow()
    // Demo split and return-to-source actions have no producer and therefore no contract variants.
    for (const kind of ['split', 'source', 'archive']) {
      expect(() => ChatMessageSchema.parse(withAction([{ kind, label: '分成两条结论' }]))).toThrow()
    }
  })

  it('会话带持久身份与消息条数,论文上下文只额外带论文 id', () => {
    const session = {
      id: 'amortize', title: '摊薄的前提是共享前缀吗', archived: false, messageCount: 2,
    }
    expect(ChatSessionSchema.parse(session)).toEqual(session)
    expect(ChatSessionSchema.parse({ ...session, paperId: 'paper-a' }).paperId).toBe('paper-a')
    expect(() => ChatSessionSchema.parse({ ...session, messages: [] })).toThrow()
    // Pinning is not implemented by this app and has no contract field.
    expect(() => ChatSessionSchema.parse({ ...session, pinned: false })).toThrow()
    // Title-finalization is Core-internal first-message state and does not cross the boundary.
    expect(() => ChatSessionSchema.parse({ ...session, named: true })).toThrow()
    expect(ChatCreateParamsSchema.parse({ title: '新对话', named: false }).named).toBe(false)
    expect(() => ChatCreateParamsSchema.parse({ title: '新对话', named: false, id: 't1' })).toThrow()
    expect(ChatForPaperParamsSchema.parse({ paperId: 'paper-a' }).paperId).toBe('paper-a')
    expect(() => ChatForPaperParamsSchema.parse({ paperId: 'paper-a', title: '伪造标题' })).toThrow()
    expect(ChatSetArchivedParamsSchema.parse({ id: 'amortize', archived: true }).archived).toBe(true)
    expect(() => ChatSetArchivedParamsSchema.parse({ id: 'amortize' })).toThrow()
  })

  it('追加消息的入参不收 id,id 由 core 指派', () => {
    const messages = [{ role: 'you', runs: [{ kind: 'text', text: '再问一句' }], actions: [] }]
    expect(ChatAppendParamsSchema.parse({ id: 'amortize', messages }).messages).toHaveLength(1)
    expect(() => ChatAppendParamsSchema.parse({
      id: 'amortize', messages: [{ ...messages[0], id: 'am9' }],
    })).toThrow()
    expect(ChatMessagesParamsSchema.parse({ id: 'amortize' }).id).toBe('amortize')
  })

  it('按钮可以带「已记过」', () => {
    const action = { kind: 'writeBack', label: '记入科研记录', project: 'draft', text: 'x' }
    expect(ChatActionSchema.parse({ ...action, done: true }).done).toBe(true)
    expect(ChatActionSchema.parse(action).done).toBeUndefined()
  })

  it('想法可关联项目、归档、转项目与进入垃圾桶，老记录默认仍是进行中', () => {
    const old = ResearchIdeaSchema.parse({
      id: 'idea-1', title: '动态树宽', body: '按请求分配预算',
      source: { chatId: 'chat-1', chatTitle: '论文讨论' },
      created: '2026-09-17', updated: '2026-09-17',
    })
    expect(old.archived).toBe(false)
    expect(ResearchIdeaUpdateParamsSchema.parse({
      id: old.id, patch: { project: 'draft', archived: true },
    }).patch.project).toBe('draft')
    expect(ResearchIdeaUpdateParamsSchema.parse({
      id: old.id, patch: { project: null },
    }).patch.project).toBeNull()
    expect(ResearchIdeaPromoteParamsSchema.parse({ id: old.id }).id).toBe(old.id)
    expect(ResearchIdeaPlaceOnGraphParamsSchema.parse({
      id: old.id, placement: { kind: 'create', label: '动态树宽', after: null },
    }).placement.kind).toBe('create')
    expect(ResearchIdeaPlaceOnGraphParamsSchema.parse({
      id: old.id, placement: { kind: 'link', nodeId: 'node-1' },
    }).placement.kind).toBe('link')
    expect(ResearchIdeaPlaceOnGraphParamsSchema.parse({
      id: old.id, placement: { kind: 'unlink' },
    }).placement.kind).toBe('unlink')
    expect(ResearchIdeaDeleteParamsSchema.parse({ id: old.id }).id).toBe(old.id)
    expect(TrashEntrySchema.parse({
      id: 'trash-1', kind: 'idea', title: old.title, deletedAt: 0, restorable: true,
    }).kind).toBe('idea')
  })

  it('对话的 fixture 全部符合契约,消息 id 在会话里唯一', () => {
    expect(chats.length).toBe(2)
    // Stored chats also hold messages and title-finalization state; message count is derived on read.
    for (const { messages, named, ...session } of chats) {
      expect(named).toBeDefined()
      ChatSessionSchema.parse({ ...session, messageCount: messages.length })
      for (const message of messages) ChatMessageSchema.parse(message)
      expect(new Set(messages.map((m) => m.id)).size).toBe(messages.length)
    }
    expect(chats.filter((s) => s.archived)).toHaveLength(1)
  })

  it('新记一条动态只收来源与正文,id、日期段与时刻由 core 填', () => {
    const entry = { source: 'me', body: { kind: 'runs', runs: [{ kind: 'text', text: '闪念:「新想法」' }] } }
    expect(FeedAppendParamsSchema.parse(entry)).toEqual(entry)
    for (const filled of [{ id: 'entry-1' }, { day: '今天' }, { time: '刚刚' }]) {
      expect(() => FeedAppendParamsSchema.parse({ ...entry, ...filled })).toThrow()
    }
  })

  it('新建任务与里程碑的入参不收 id,id 由 core 指派', () => {
    const task = { title: '宽树实验', start: '2026-08-18', end: '2026-08-28', state: 'act', priority: 'p0' }
    expect(ProjectCreateTaskParamsSchema.parse({ projectId: 'draft', task }).task.title).toBe('宽树实验')
    expect(() => ProjectCreateTaskParamsSchema.parse({ projectId: 'draft', task: { ...task, id: 't9' } })).toThrow()

    const milestone = { date: '2026-08-28', title: '补 B≥8', done: false }
    expect(ProjectCreateMilestoneParamsSchema.parse({ projectId: 'draft', milestone }).milestone.done).toBe(false)
    expect(() =>
      ProjectCreateMilestoneParamsSchema.parse({ projectId: 'draft', milestone: { ...milestone, id: 'm9' } }),
    ).toThrow()
  })

  it('搜索命中带类别、落点与显示的两行字,入参只收查询词', () => {
    const hit = { kind: 'aggregation', target: 'topics/leaf', title: '问题:Leaf', meta: 'Wiki' }
    expect(SearchHitSchema.parse(hit)).toEqual(hit)
    // There is no fifth entity kind because the demo's hard-coded notebook has no app entity.
    expect(() => SearchHitSchema.parse({ ...hit, kind: '笔记' })).toThrow()
    expect(() => SearchHitSchema.parse({ ...hit, score: 1 })).toThrow()
    expect(SearchParamsSchema.parse({ query: '摊薄' }).query).toBe('摊薄')
    // The contract owns the result limit rather than accepting it from the renderer.
    expect(() => SearchParamsSchema.parse({ query: '摊薄', limit: 8 })).toThrow()
  })
})
