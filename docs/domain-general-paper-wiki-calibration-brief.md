---
type: "calibration_brief"
title: "Domain-General Paper Wiki Calibration Brief"
status: "draft"
created: "2026-05-20"
updated: "2026-05-20"
tags:
  - llm-wiki
  - paper-ingest
  - retrieval-eval
---

# Domain-General Paper Wiki Calibration Brief

## Scope

This calibration checks whether Meridian Paper Wiki remains useful outside the quantization-heavy calibration set.

Artifacts:

- Ingest cases: `eval/cases/domain_general_paper_ingest.jsonl`
- Ingest rubric: `eval/rubrics/domain_general_paper_wiki_quality_v0.md`
- Final cross-domain ingest run: `eval/runs/2026-05-20-domain-general-r10/`
- Idea-level retrieval cases: `eval/cases/domain_general_idea_retrieval.jsonl`
- Final idea retrieval run: `eval/runs/2026-05-20-domain-general-idea-retrieval-r4/`

## Domain Coverage

The run covers quantization/systems ML, attention kernels, preference optimization, test-time RL, agent workflow execution, audio-language modeling, video representation learning, scientific ML/PINN, clustering theory, survey synthesis, KV-cache compression, and a source-quality edge case.

## Results

Final ingest self-check over 12 real papers:

- Passes: 12 / 12
- Average quality score: 4.958
- Minimum quality score: 4.822
- Lowest-scoring cases: PINN and source-quality hold, due mostly to extraction/metadata limits rather than quantization bias.

Final idea-level retrieval over 6 complex research intents:

- Deterministic passes: 6 / 6
- Required recall@5: 1.000
- Section hit rate: 1.000
- Judge packets written for later LLM-as-Judge review.

## Bias Check

Current evidence does not support the claim that the ingest skill is quantization-specific.

Fixes made during this round removed observed cross-domain contamination:

- FlashAttention is routed as attention-kernel scheduling, IO-aware attention, hardware-aware attention, and GPU attention-kernel setting instead of PTQ.
- PyramidKV is routed as KV-cache compression and long-context decoding with compressed KV cache instead of clustering algorithm or KV-cache quantization.
- Speculative Actions is routed as agent workflow acceleration and speculative action execution instead of token-level speculative decoding or computer architecture.
- Qwen-Audio is routed as audio-language modeling and multimodal instruction setting.
- V-JEPA is routed as video representation learning and joint embedding predictive learning instead of rotation or long-context quantization.
- K-means/PCA clustering stays clustering theory and does not inherit quantization centroid/codebook routing.

Remaining bias risk:

- The quality checker is deterministic and schema-aware; it is not a substitute for a real LLM-as-Judge semantic read.
- Some candidate record summaries still carry long extracted source sentences in the candidate-record appendix, although the main `What To Remember` and `Mechanism` purpose now use domain contracts.
- Generic metric extraction can still over-collect broad metrics such as accuracy/precision/recall when papers mention them in unrelated contexts.

## Mechanism Fixes

Implemented generalized fixes rather than hand-editing paper pages:

- Added domain-specific contracts for KV-cache compression, attention kernels, agent workflow speculation, audio-language modeling, video representation learning, survey synthesis, PINN, clustering, and preference optimization.
- Gated quantization routing with quantization-research context, preventing low-precision hardware, representation learning, and clustering papers from becoming PTQ pages.
- Split KV-cache compression from clustering research so papers that select or cluster token positions do not become clustering-theory pages.
- Replaced long source-sentence `What To Remember` for single-method papers with contract-driven mechanism narratives.
- Replaced mechanism `Purpose` text with concise contract-based purpose statements.
- Expanded retrieval section intent vocabulary for evidence, evaluation, tradeoffs, failure boundaries, risks, and uncertainty.
- Increased matched section retention so context packets do not drop useful sections merely because a page has more than five relevant sections.
- Added agent-specific limitations for speculative-action papers around verifier, rollback, environment/tool state, task success, and wasted speculative work.

## Retrieval Readiness

The final idea-level retrieval cases show that the wiki can support multi-domain research retrieval, not only paper self-recall:

- KV-cache memory idea retrieves PyramidKV with mechanism, evidence, implementation, and scope sections.
- Preference optimization versus test-time RL retrieves both DPO and TTRL.
- Clustering objective plus representation learning retrieves K-means/PCA without quantization pollution and permits V-JEPA as adjacent context.
- Agent speculative execution retrieves Speculative Actions and the LLM-agent survey as adjacent taxonomy context.
- Audio-language alignment retrieves Qwen-Audio with mechanism/evidence/implementation hooks.
- PDE scientific ML retrieves PINN without RL, agent, or quantization contamination.

## Current Limitations

The system is usable as a domain-general Paper Wiki MVP, but not final paper-reading automation.

Most important remaining limitations:

- Visual, table, and equation semantics are still shallow; page-level evidence pointers exist, but multimodal understanding is not deep.
- Candidate records can include noisy extracted sentences; canonical promotion should keep candidate status unless judged or reviewed.
- LLM-as-Judge aggregation is prepared through packets but was not executed by an external model in this run.
- Non-ML domains beyond PINN/geoscience-style scientific ML still need more calibration examples.

## Next Domain Examples

Most useful next examples:

- database/systems papers with protocols and throughput claims
- theory-heavy ML papers with proofs rather than experiments
- human-computer interaction or qualitative studies
- robotics papers with real-world hardware experiments
- biology/medicine papers where claims, datasets, and evidence norms differ from ML benchmarks
