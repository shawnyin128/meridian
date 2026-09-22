import { describe, expect, it } from 'vitest'
import { ON_POLICY_DISTILLATION_SAMPLE } from './fixtures/on-policy-distillation.js'
import {
  applyRecommendationPreferences, buildRecommendationProfile, clusterRecommendationProfile,
  recommendationFingerprint, recommendationQueryIntent, selectRecommendationIntents,
} from './index.js'

describe('recommendation project profile', () => {
  it('把产品样本拆成 OPD 与通用 KD 两个可检查方向', () => {
    const profile = buildRecommendationProfile({
      projectId: 'opd', projectName: 'OPD 与 speculative drafter',
      anchorText: 'speculative decoding · stronger draft models',
      projectPapers: ON_POLICY_DISTILLATION_SAMPLE.seeds.map((paper) => ({
        paperId: `ARXIV:${paper.arxiv}`, title: paper.title, abstract: paper.abstract,
      })),
      feedbackPapers: [],
    })
    const intents = clusterRecommendationProfile(profile)
    expect(intents).toHaveLength(2)
    expect(intents.map((intent) => intent.seeds.map((seed) => seed.paperId))).toEqual([
      ['ARXIV:2605.29343', 'ARXIV:2604.14084', 'ARXIV:2605.26844'],
      ['ARXIV:2510.15982', 'ARXIV:2505.04560'],
    ])
    expect(intents.every((intent) => intent.label.includes('distillation'))).toBe(true)
    expect(intents[0]?.core).toBe(true)
    expect(intents[0]?.seeds.map((seed) => seed.paperId)).toContain('ARXIV:2605.29343')
  })

  it('正负反馈留在本项目画像里并按 paper id 去重', () => {
    const profile = buildRecommendationProfile({
      projectId: 'p1', projectName: '项目一',
      anchorText: 'One',
      projectPapers: [{ paperId: 'ARXIV:1', title: 'One', abstract: '' }],
      feedbackPapers: [
        { paperId: 'ARXIV:1', title: 'Duplicate', abstract: '', feedback: 'more' },
        { paperId: 's2', title: 'Two', abstract: '', feedback: 'more' },
        { paperId: 's3', title: 'Three', abstract: '', feedback: 'less' },
        { paperId: 's4', title: 'Known', abstract: '', feedback: 'known' },
      ],
    })
    expect(profile.positive.map((seed) => seed.paperId)).toEqual(['ARXIV:1', 's2'])
    expect(profile.negative.map((seed) => seed.paperId)).toEqual(['s3'])
  })

  it('桥接论文不会把两个互不相似的方向串成一个平均簇', () => {
    const profile = buildRecommendationProfile({
      projectId: 'bridge', projectName: '桥接测试', anchorText: 'alpha beta',
      projectPapers: [
        { paperId: 'a', title: 'alpha beta', abstract: '' },
        { paperId: 'bridge', title: 'alpha beta gamma delta', abstract: '' },
        { paperId: 'c', title: 'gamma delta', abstract: '' },
      ],
      feedbackPapers: [],
    })
    const intents = clusterRecommendationProfile(profile)
    expect(intents).toHaveLength(2)
    expect(intents[0]?.core).toBe(true)
    expect(intents[0]?.seeds.map((seed) => seed.paperId)).toEqual(expect.arrayContaining(['a']))
    expect(intents.some((intent) => intent.seeds.some((seed) => seed.paperId === 'c'))).toBe(true)
  })

  it('单槽调度在核心与次要方向之间轮换,多槽始终保留核心', () => {
    const intents = ['core', 'a', 'b'].map((id, at) => ({
      id, label: id, seeds: [{ paperId: id, title: id, abstract: '', source: 'project' as const }],
      score: 1 - at / 10, core: at === 0, enabled: true,
    }))
    const first = selectRecommendationIntents(intents, 1, 0)
    const second = selectRecommendationIntents(intents, 1, first.nextCursor)
    const third = selectRecommendationIntents(intents, 1, second.nextCursor)
    expect([first.selected[0]?.id, second.selected[0]?.id, third.selected[0]?.id])
      .toEqual(['core', 'a', 'core'])
    expect(selectRecommendationIntents(intents, 2, 0).selected.map((intent) => intent.id))
      .toEqual(['core', 'a'])
  })

  it('用户可以固定核心方向或关闭方向,而不改写聚类本身', () => {
    const intents = ['core', 'a', 'b'].map((id, at) => ({
      id, label: id, seeds: [{ paperId: id, title: id, abstract: '', source: 'project' as const }],
      score: 1 - at / 10, core: at === 0, enabled: true,
    }))
    const controlled = applyRecommendationPreferences(intents, {
      coreIntentId: 'b', disabledIntentIds: ['a'],
    })
    expect(controlled.map(({ id, core, enabled }) => ({ id, core, enabled }))).toEqual([
      { id: 'b', core: true, enabled: true },
      { id: 'core', core: false, enabled: true },
      { id: 'a', core: false, enabled: false },
    ])
    expect(selectRecommendationIntents(controlled, 3, 0).selected.map((intent) => intent.id))
      .toEqual(['b', 'core'])
  })

  it('请求指纹同时响应种子与负反馈变化', () => {
    const intent = {
      id: 'core', label: 'core', score: 1, core: true, enabled: true,
      seeds: [{ paperId: 'a', title: 'A', abstract: '', source: 'project' as const }],
    }
    expect(recommendationFingerprint(intent, ['negative']))
      .toBe(recommendationFingerprint(intent, ['negative']))
    expect(recommendationFingerprint(intent, ['negative']))
      .not.toBe(recommendationFingerprint(intent, ['changed']))
  })

  it('聚类保留全部论文,检索只使用与项目锚点最接近的代表种子', () => {
    const profile = buildRecommendationProfile({
      projectId: 'opd', projectName: 'OPD 与 speculative drafter',
      anchorText: 'speculative decoding stronger draft models',
      projectPapers: ON_POLICY_DISTILLATION_SAMPLE.seeds.slice(0, 3).map((paper) => ({
        paperId: `ARXIV:${paper.arxiv}`, title: paper.title, abstract: paper.abstract,
      })),
      feedbackPapers: [],
    })
    const intent = clusterRecommendationProfile(profile)[0]!
    expect(intent.seeds).toHaveLength(3)
    expect(recommendationQueryIntent(intent).seeds.map((seed) => seed.paperId))
      .toEqual(['ARXIV:2605.29343'])
  })
})
