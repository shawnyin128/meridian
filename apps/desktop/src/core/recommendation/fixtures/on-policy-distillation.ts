import type { DiscoveryPaper } from '../types.js'

export type DiscoverySamplePaper = {
  arxiv: string
  title: string
  authors: string[]
  abstract: string
}

/**
 * Stage-one discovery sample supplied by the product owner. Five related papers form a project
 * profile; Osprey is the expected unseen result. The fixture intentionally stores metadata only,
 * never downloaded PDFs or generated wiki pages.
 */
export const ON_POLICY_DISTILLATION_SAMPLE: {
  seeds: DiscoverySamplePaper[]
  expected: DiscoveryPaper
} = {
  seeds: [
    {
      arxiv: '2605.29343',
      title: 'Draft-OPD: On-Policy Distillation for Speculative Draft Models',
      authors: ['Haodi Lei', 'Yafu Li', 'Haoran Zhang'],
      abstract: 'On-policy distillation trains speculative draft models on draft-induced errors exposed by verification.',
    },
    {
      arxiv: '2604.14084',
      title: 'TIP: Token Importance in On-Policy Distillation',
      authors: ['Yuanda Xu', 'Hejian Sang', 'Zhengze Zhou'],
      abstract: 'Token importance in on-policy distillation combines student entropy and teacher-student divergence.',
    },
    {
      arxiv: '2605.26844',
      title: 'Not All Disagreement Is Learnable: Token Teachability in On-Policy Distillation',
      authors: ['Yuanyi Wang', 'Su Lu', 'Yanggan Gu'],
      abstract: 'Teachability-aware OPD selects compatible teacher signals rather than raw disagreement alone.',
    },
    {
      arxiv: '2510.15982',
      title: 'AMiD: Knowledge Distillation for LLMs with α-mixture Assistant Distribution',
      authors: ['Donghyeok Shin', 'Yeongmin Kim', 'Suhyeon Jo'],
      abstract: 'A generalized family of assistant distributions stabilizes knowledge distillation for language models.',
    },
    {
      arxiv: '2505.04560',
      title: 'ABKD: Pursuing a Proper Allocation of the Probability Mass in Knowledge Distillation via α-β-Divergence',
      authors: ['Guanghui Wang', 'Zhiyong Yang', 'Zitai Wang'],
      abstract: 'Alpha-beta divergence balances hardness and confidence concentration in knowledge distillation.',
    },
  ],
  expected: {
    semanticId: 'ARXIV:2609.09338',
    id: '2609.09338',
    title: 'Osprey: Target-agnostic Pre-training Makes Stronger Drafters in Speculative Decoding',
    authors: ['Fengxiang Bie', 'Yuqing Jian', 'Yifan Yu'],
    abstract: 'Target-agnostic pre-training and lightweight adaptation produce stronger speculative decoding drafters.',
    submitted: '2026-09-08',
    journalRef: 'EMNLP 2026',
    pdf: 'https://arxiv.org/pdf/2609.09338',
    ranking: {
      relevance: 1,
      published: true,
      citationCount: 0,
      influentialCitationCount: 0,
      submitted: '2026-09-08',
    },
  },
}
