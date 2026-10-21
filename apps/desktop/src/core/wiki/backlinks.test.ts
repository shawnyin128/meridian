import { describe, expect, it } from 'vitest'
import { wikiBacklinks, type BacklinkContext } from './backlinks.js'
import type { WikiData } from './model.js'

const DATA: WikiData = {
  requireQuote: true,
  kinds: {
    topic: { dir: 'topics', label: '主题', describe: { section: '问题', hint: '' } },
    method: { dir: 'methods', label: '方法', describe: { section: '机制', hint: '' } },
  },
  sections: [],
  pages: {
    'papers/eagle': {
      kind: 'paper', fm: { title: 'EAGLE: Speculative Sampling', short: 'EAGLE', updated: '2026-09-01' },
      body: '见 [[topics/sd|推测解码]]，以及自己 [[papers/eagle]]。',
    },
    'papers/medusa': { kind: 'paper', fm: { title: 'Medusa', updated: '2026-09-01' }, body: '比 [[papers/eagle]] 早。' },
    'topics/sd': { kind: 'topic', fm: { title: 'Speculative decoding', updated: '2026-09-01' }, body: '[[papers/eagle|EAGLE]] 与 [[papers/eagle]]。' },
    'methods/heads': {
      kind: 'method', fm: { title: 'Draft heads', updated: '2026-09-01' },
      body: '结论 [[topics/sd#^knee|拐点]]；不是链接的 topics/sd 与 [[topics/sd-old]]。',
    },
    'topics/quiet': { kind: 'topic', fm: { title: 'KV', updated: '2026-09-01' }, body: '' },
  },
}

const CONTEXT: BacklinkContext = {
  projects: [
    { id: 'p-links', name: '链接论文的项目', papers: ['eagle'], pages: [] },
    { id: 'p-rel', name: '关联主题的项目', papers: [], pages: ['topics/sd'] },
    { id: 'p-other', name: '无关项目', papers: ['medusa'], pages: ['topics/quiet-old'] },
  ],
  ideas: [
    { id: 'i-eagle', title: '从 EAGLE 读出的想法', paper: 'eagle' },
    { id: 'i-free', title: '与论文无关的想法' },
  ],
  chats: [
    { id: 'c-read', title: 'EAGLE 阅读', paper: 'eagle', sent: ['草稿头为什么够用？'] },
    { id: 'c-short', title: '用短标题提到', sent: ['@eagle 的树宽怎么定'] },
    { id: 'c-topic', title: '提到主题', sent: ['先问别的', '@Speculative decoding 还成立吗'] },
    { id: 'c-prefix', title: '只是前缀相同', sent: ['@EAGLEX 是另一篇', '@KVQuant 的做法'] },
    { id: 'c-later', title: '提到没有放在开头', sent: ['这和 @EAGLE 有关吗'] },
  ],
}

const of = (id: string) => wikiBacklinks(DATA, id, CONTEXT)

describe('wiki backlinks', () => {
  it('论文页：正文链到它的别的页（主题在论文前）、链接这篇论文的项目、来自它的想法、读它或用 @ 提到它的对话，各一次', () => {
    expect(of('papers/eagle')).toEqual([
      { kind: 'page', id: 'topics/sd', title: 'Speculative decoding', kindLabel: '主题' },
      { kind: 'page', id: 'papers/medusa', title: 'Medusa' },
      { kind: 'project', id: 'p-links', title: '链接论文的项目' },
      { kind: 'idea', id: 'i-eagle', title: '从 EAGLE 读出的想法' },
      { kind: 'chat', id: 'c-read', title: 'EAGLE 阅读' },
      { kind: 'chat', id: 'c-short', title: '用短标题提到' },
    ])
  })

  it('聚合页：链到它某条结论的页也算；关联它的项目与 @ 提到它标题的对话；想法只认论文来源', () => {
    expect(of('topics/sd')).toEqual([
      { kind: 'page', id: 'methods/heads', title: 'Draft heads', kindLabel: '方法' },
      { kind: 'page', id: 'papers/eagle', title: 'EAGLE', fullTitle: 'EAGLE: Speculative Sampling' },
      { kind: 'project', id: 'p-rel', title: '关联主题的项目' },
      { kind: 'chat', id: 'c-topic', title: '提到主题' },
    ])
  })

  it('没有任何东西指向的页给空表：同名前缀、没写成链接的 id 和不在开头的 @ 都不算', () => {
    expect(of('topics/quiet')).toEqual([])
    expect(of('papers/medusa')).toEqual([{ kind: 'project', id: 'p-other', title: '无关项目' }])
  })

  it('页不存在时报 not-found', () => {
    expect(() => of('topics/sd-old')).toThrow(expect.objectContaining({ reason: 'not-found' }))
  })
})
