import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import type { FeedFields, FeedRun } from '../shared/contract.js'
import { FeedAppendParamsSchema, FeedEntrySchema } from '../shared/contract.js'
import { createVaultStore } from './vault-store.js'
import { readStoredList } from './vault/stored-records.js'

/** Test vault the store opens. */
const VAULT = resolve(import.meta.dirname, 'fixtures/vault')

/** The feed-entry schema of App 0.0.15.4 (v0.0.15004), copied with the shapes it reused: every object is strict. */
const RunSchema0154 = z.object({ kind: z.enum(['text', 'strong', 'cite']), text: z.string() }).strict()
const FeedEntrySchema0154 = z.object({
  id: z.string(),
  source: z.enum(['steward', 'me', 'lab', 'inbox']),
  day: z.string(),
  time: z.string(),
  createdAt: z.string().optional(),
  body: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('runs'), runs: z.array(RunSchema0154) }).strict(),
    z.object({
      kind: z.literal('brief'),
      heading: z.string(),
      items: z.array(z.object({ id: z.string(), tag: z.string(), text: z.string(), action: z.string() }).strict()),
    }).strict(),
  ]),
}).strict()

/** An entry as a version that writes targets is to store it: two runs name a paper and a project, one a kind this version does not know. */
const NAMING = {
  id: 'entry-9', source: 'lab', day: '今天', time: '刚刚', createdAt: '2026-10-21T09:00:00.000Z',
  body: {
    kind: 'runs',
    runs: [
      { kind: 'strong', text: '「推测解码加速」', target: { kind: 'project', id: 'project-57' } },
      { kind: 'text', text: '读完' },
      { kind: 'strong', text: '《EAGLE》', target: { kind: 'paper', id: '2401-15077' } },
      { kind: 'text', text: '，记进' },
      { kind: 'cite', text: '「树宽收益拐点」', target: { kind: 'claim', id: 'topics/sd#knee' } },
    ],
  },
}

/** An entry as every version so far has written it: no run names a target. */
const PLAIN = {
  id: 'entry-8', source: 'me', day: '今天', time: '刚刚', createdAt: '2026-10-21T08:00:00.000Z',
  body: { kind: 'runs', runs: [{ kind: 'text', text: '你上传的' }, { kind: 'strong', text: '《QuIP#》' }, { kind: 'text', text: '已入库。' }] },
}

/** The runs of an entry body of type `Body`. */
type RunsOf<Body> = Extract<Body, { kind: 'runs' }> extends { runs: (infer Run)[] } ? Run : never

describe('动态分段点名的实体', () => {
  it('这个版本的 schema 两种都收:带 target 的分段原样读出,kind 不认识的也照收;不带的读出来一字不差', () => {
    expect(FeedEntrySchema.parse(NAMING)).toEqual(NAMING)
    expect(FeedEntrySchema.parse(PLAIN)).toEqual(PLAIN)
    expect(FeedEntrySchema.parse(PLAIN)).toEqual(FeedEntrySchema0154.parse(PLAIN))
  })

  it('App 0.0.15.4 的严格 schema 不收带 target 的分段;它逐条读 feed.json 的读法去掉 target 照常显示,存回时原样放回', () => {
    expect(FeedEntrySchema0154.safeParse(NAMING).error?.issues.map((issue) => [issue.code, issue.path.join('.')])).toEqual([
      ['unrecognized_keys', 'body.runs.0'], ['unrecognized_keys', 'body.runs.2'], ['unrecognized_keys', 'body.runs.4'],
    ])
    const read = readStoredList('feed.json', [NAMING, PLAIN], FeedEntrySchema0154, 'id')
    expect(read.unreadable).toEqual([])
    expect(read.rows[0]!.body).toEqual({ kind: 'runs', runs: NAMING.body.runs.map(({ kind, text }) => ({ kind, text })) })
    expect(read.stored(read.rows)).toEqual([NAMING, PLAIN])
  })

  it('这个版本写 target:追加动态的参数收它,写进去的分段类型里有这个字段', () => {
    const run = { kind: 'strong', text: '《EAGLE》', target: { kind: 'paper', id: '2401-15077' } }
    expect(FeedAppendParamsSchema.parse({ source: 'me', body: { kind: 'runs', runs: [run] } }))
      .toEqual({ source: 'me', body: { kind: 'runs', runs: [run] } })
    expectTypeOf<FeedRun>().toHaveProperty('target')
    expectTypeOf<RunsOf<FeedFields['body']>>().toHaveProperty('target')
  })

  it('这个版本存进 feed.json 的点名分段,App 0.0.15.4 的读法条条读得出、分段照常显示,存回时 target 一个不少', () => {
    const vault = mkdtempSync(join(tmpdir(), 'meridian-feed-compat-'))
    try {
      cpSync(VAULT, vault, { recursive: true })
      const store = createVaultStore(vault)
      const project = store.createProject('推测解码加速')
      const named = { kind: 'text', text: '推测解码加速', target: { kind: 'project', id: project } } as const
      store.appendFeed({ source: 'me', body: { kind: 'runs', runs: [{ kind: 'text', text: '新项目《' }, named, { kind: 'text', text: '》已创建' }] } })
      store.appendFeed(PLAIN as FeedFields)
      const written: unknown[] = JSON.parse(readFileSync(join(vault, '.meridian', 'feed.json'), 'utf8'))
      expect(written.at(-2)).toMatchObject({ body: { runs: [{}, { target: { kind: 'project', id: expect.stringMatching(/^project-/) } }, {}] } })

      const read = readStoredList('feed.json', written, FeedEntrySchema0154, 'id')
      expect(read.unreadable).toEqual([])
      expect(read.rows.slice(-2).map((entry) => entry.body)).toEqual([
        { kind: 'runs', runs: [{ kind: 'text', text: '新项目《' }, { kind: 'text', text: '推测解码加速' }, { kind: 'text', text: '》已创建' }] },
        PLAIN.body,
      ])
      expect(read.stored(read.rows)).toEqual(written)
    } finally {
      rmSync(vault, { recursive: true, force: true })
    }
  })
})
