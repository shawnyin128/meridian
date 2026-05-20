# Retrieval Optimization Research

Meridian retrieval v0 is useful but still naive: it scores paper pages mostly from frontmatter overlap, controlled vocabulary terms, and section previews. That works for self-recall, but it does not prove that a research query gets the right paper families, the right sections, the right evidence, or a compact packet that a later agent can reason from.

## Source-Grounded Takeaways

- BM25/BM25F remains the right no-API first-stage baseline for a Markdown wiki because it rewards exact term evidence and can weight fields differently. Robertson and Zaragoza's BM25 overview is the relevant classical source for probabilistic lexical ranking and field weighting.
- Dense Passage Retrieval shows why lexical retrieval alone misses semantic paraphrases, but it requires a trained embedding model and an index backend. Meridian should expose a backend seam for dense retrieval later, not make it a hard dependency now.
- ColBERT's late interaction is a useful design analogy: keep token/section-level matching late enough that a paper is not selected only because the page title matched. Meridian's deterministic substitute is section-aware scoring and read-first section ranking.
- SPLADE-style sparse expansion suggests a future path between lexical and dense retrieval: keep sparse, inspectable terms but expand query/document vocabulary. For now, Meridian approximates this with controlled vocabulary normalization and facet/domain expansion.
- BEIR is a reminder that retrieval evaluation must be heterogeneous and zero-shot-like. Meridian's eval set should cover domains and intents, not only quantization self-recall.
- RAGAS-style evaluation separates context relevance, faithfulness, and answerability. Meridian's judge packets follow that split at the context-packet layer rather than judging generated final answers.
- Lost-in-the-Middle argues against dumping too many chunks into a packet. Meridian should rerank, truncate, and compress context so key sections appear early.

Primary references:

- Robertson and Zaragoza, "The Probabilistic Relevance Framework: BM25 and Beyond": https://doi.org/10.1561/1500000019
- Karpukhin et al., "Dense Passage Retrieval for Open-Domain Question Answering": https://arxiv.org/abs/2004.04906
- Khattab and Zaharia, "ColBERT: Efficient and Effective Passage Search via Contextualized Late Interaction over BERT": https://arxiv.org/abs/2004.12832
- Formal et al., "SPLADE v2: Sparse Lexical and Expansion Model for Information Retrieval": https://arxiv.org/abs/2109.10086
- Thakur et al., "BEIR: A Heterogeneous Benchmark for Zero-shot Evaluation of Information Retrieval Models": https://arxiv.org/abs/2104.08663
- Es et al., "RAGAS: Automated Evaluation of Retrieval Augmented Generation": https://arxiv.org/abs/2309.15217
- Liu et al., "Lost in the Middle: How Language Models Use Long Contexts": https://arxiv.org/abs/2307.03172

## Retrieval Architecture Options

| Option | Helps | Cost | Meridian decision |
| --- | --- | --- | --- |
| Lexical/BM25 | Exact method, metric, dataset, and paper-family terms | Misses paraphrases | Implement deterministic BM25-style field/section scoring in v1 |
| Frontmatter/facet routing | Keeps aliases, topics, methods, settings, source state explicit | Depends on ingest metadata quality | Keep as first-class routing source |
| Section-level retrieval | Finds mechanism/evidence/limitation sections instead of whole pages only | Requires section indexing and evaluation | Implement read-first section scoring |
| Query decomposition | Handles comparison or multi-family requests | Can over-expand if unconstrained | Implement lightweight intent/domain detection first |
| Graph expansion | Recovers adjacent paper families through topic/method links | Can drift into broad hubs | Implement capped topic/method expansion |
| Hybrid lexical + semantic | Handles paraphrase and conceptual analogy | Needs API/local embedding backend | Design backend seam; no hard dependency in v1 |
| Reranking | Improves precision and context order | Requires extra model or deterministic features | Implement deterministic reranking with domain/source/section features |
| Context packet construction | Reduces downstream reasoning noise | Needs compression rules | Limit read-first sections and include query analysis |
| Hard negative handling | Prevents false matches in crowded domains | Requires explicit eval distractors | Add scenario hard distractors and source-quality guards |

## Retrieval v1 Design

Retrieval v1 is a deterministic hybrid strategy:

1. Query analysis extracts normalized tokens, domains, desired sections, source-quality intent, and facet terms.
2. Candidate generation reads the canonical paper catalog and computes weighted lexical evidence over title, frontmatter, and important sections.
3. Field-weighted scoring treats aliases, methods, topics, and settings as stronger routing fields than claims.
4. Section-aware scoring boosts sections implied by the query intent, such as `Implementation Hooks` for coding/probe requests and `Limitations / Uncertainty` for boundary requests.
5. Domain/facet alignment boosts papers in the detected domain and penalizes cross-domain drift.
6. Source-quality guard boosts source-quality holds only for cleanup queries and demotes them for normal scientific retrieval.
7. Graph-style expansion gives capped boosts to papers sharing matched topic/method/settings facets with high-scoring seeds.
8. Context packet assembly exposes query analysis, selection reasons, domains, frontmatter matches, and a compact read-first list.

Implemented optimization additions:

- query setting-contrast detection for requests such as weight-only versus weight-activation quantization;
- overbroad-setting penalties for polluted routing metadata;
- coverage/diversity reranking for multi-family research intents;
- family-group evaluation so a case can require "one page from each useful family" instead of one fixed paper path;
- section-group evaluation so comparison packets can require the right sections from any acceptable family exemplar.

## Evaluation As Optimizer

The v1 evaluation runner should not only report pass/fail. It should create side-by-side v0/v1 artifacts, score deterministic metrics, generate judge packets, and make failure buckets visible so the next change can target the responsible mechanism.

Metrics:

- required recall at k
- mean reciprocal rank for required families
- section hit rate
- evidence hit rate
- hard distractor rate
- source-quality failure rate
- context compactness
- redundancy rate
- family coverage
- query-intent coverage

Repair buckets:

- query understanding
- vocabulary/facet routing
- paper/section indexing
- scoring/ranking
- graph expansion
- context packing
- source-quality routing
- wiki schema or ingest metadata

## Backend Roadmap

Current no-API mode is deterministic and fully local. Future optional backends should fit behind the same retrieval strategy boundary:

- `semantic-local`: sentence-transformer or vLLM embedding index over sections;
- `semantic-api`: API embedding backend;
- `rerank-local`: local cross-encoder or LLM reranker over top lexical candidates;
- `rerank-api`: API reranker or judge-assisted reranking.

These should not replace Markdown/frontmatter as source of truth. They should only improve candidate generation or reranking while preserving provenance and inspectable context packets.
