import { describe, expect, it } from 'vitest'
import { applyRecommendationSignals } from './signals.js'
import type { DiscoveryPaper, RecommendationIntent, RecommendationProfile } from './types.js'

const paper = (semanticId: string, title: string, abstract: string): DiscoveryPaper => ({
  semanticId, id: semanticId, title, abstract, authors: [], submitted: '2026-09-17',
  journalRef: null, pdf: `https://arxiv.org/pdf/${semanticId}`,
  ranking: {
    relevance: 0.7, published: false, citationCount: 0, influentialCitationCount: 0,
    submitted: '2026-09-17',
  },
})

describe('project-local recommendation signals', () => {
  it('uses canonical Wiki memberships read-only and records only terms matched by the candidate', () => {
    const profile: RecommendationProfile = {
      projectId: 'p', projectName: '项目', anchorText: 'speculative decoding draft model',
      wikiTerms: ['token teachability', 'KV cache'],
      positive: [], negative: [],
    }
    const intent: RecommendationIntent = {
      id: 'core', label: 'draft decoding', score: 1, core: true, enabled: true,
      seeds: [{
        paperId: 'ARXIV:1', title: 'Draft model for speculative decoding', abstract: '',
        source: 'project', wikiTerms: ['token teachability', 'KV cache'],
      }],
    }
    const ranked = applyRecommendationSignals(profile, intent, [
      paper('generic', 'General language model optimization', 'broad systems'),
      paper('matched', 'Token Teachability for Draft Models', 'speculative decoding'),
    ])
    expect(ranked.map((item) => item.semanticId)).toEqual(['matched', 'generic'])
    expect(ranked[0]?.wikiTerms).toEqual(['token teachability'])
    expect(ranked[1]?.wikiTerms).toBeUndefined()
    expect(profile.wikiTerms).toEqual(['token teachability', 'KV cache'])
  })

  it('does not leak another project direction\'s Wiki terms into this intent', () => {
    const profile: RecommendationProfile = {
      projectId: 'p', projectName: '项目', anchorText: 'two directions',
      wikiTerms: ['draft model', 'molecular graph'], positive: [], negative: [],
    }
    const intent: RecommendationIntent = {
      id: 'draft', label: 'draft', score: 1, core: true, enabled: true,
      seeds: [{
        paperId: 'ARXIV:1', title: 'Draft Model', abstract: '', source: 'project',
        wikiTerms: ['draft model'],
      }],
    }
    const [ranked] = applyRecommendationSignals(
      profile, intent, [paper('other', 'Molecular Graph Networks', 'chemistry')],
    )
    expect(ranked?.wikiTerms).toBeUndefined()
  })
})
