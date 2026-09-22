import type { RecommendationSeed } from '../types.js'

export type RecommendationProfileFixture = {
  name: string
  projectName: string
  anchorText: string
  seeds: Array<Omit<RecommendationSeed, 'source'>>
  expectedClusters: string[][]
}

/**
 * Metadata-only profiles that exercise unrelated projects and coherent sub-directions. They are
 * deliberately synthetic so the offline quality gate stays deterministic and source-free.
 */
export const MIXED_PROJECT_PROFILE_FIXTURES: RecommendationProfileFixture[] = [
  {
    name: 'RAG 与图检索保持为两个方向',
    projectName: '可靠 RAG',
    anchorText: 'retrieval augmented generation faithful citation',
    seeds: [
      {
        paperId: 'rag-adaptive',
        title: 'Retrieval Augmented Generation with Adaptive Document Retrieval',
        abstract: '',
      },
      {
        paperId: 'rag-citation',
        title: 'Faithful Retrieval Augmented Generation with Citation Verification',
        abstract: '',
      },
      {
        paperId: 'graph-neural',
        title: 'Graph Neural Retrieval for Molecular Property Prediction',
        abstract: '',
      },
      {
        paperId: 'graph-contrastive',
        title: 'Graph Contrastive Retrieval for Molecular Discovery',
        abstract: '',
      },
    ],
    expectedClusters: [
      ['rag-adaptive', 'rag-citation'],
      ['graph-neural', 'graph-contrastive'],
    ],
  },
  {
    name: '量化与参数高效微调不会平均',
    projectName: '高效模型部署',
    anchorText: 'post training quantization efficient transformer inference',
    seeds: [
      {
        paperId: 'quant-inference',
        title: 'Post Training Quantization for Efficient Transformer Inference',
        abstract: '',
      },
      {
        paperId: 'quant-calibration',
        title: 'Calibration Aware Post Training Quantization',
        abstract: '',
      },
      {
        paperId: 'lora-efficient',
        title: 'Low Rank Adaptation for Efficient Model Fine Tuning',
        abstract: '',
      },
      {
        paperId: 'lora-stable',
        title: 'Rank Stabilized Low Rank Adaptation for Fine Tuning',
        abstract: '',
      },
    ],
    expectedClusters: [
      ['quant-inference', 'quant-calibration'],
      ['lora-efficient', 'lora-stable'],
    ],
  },
  {
    name: '单一研究方向不会被过度拆分',
    projectName: '因果表征',
    anchorText: 'causal representation learning interventions',
    seeds: [
      {
        paperId: 'causal-base',
        title: 'Causal Representation Learning with Interventions',
        abstract: '',
      },
      {
        paperId: 'causal-sparse',
        title: 'Causal Representation Learning from Sparse Interventions',
        abstract: '',
      },
      {
        paperId: 'causal-identifiable',
        title: 'Identifiable Causal Representation Learning under Interventions',
        abstract: '',
      },
    ],
    expectedClusters: [['causal-base', 'causal-sparse', 'causal-identifiable']],
  },
]
