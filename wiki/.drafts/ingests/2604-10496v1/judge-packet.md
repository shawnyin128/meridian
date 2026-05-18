# Paper Wiki Judge Packet

## Rubric

# LLM-as-Judge Rubric: Paper Wiki Quality v0

You are judging whether a paper ingest produced useful, auditable, retrieval-ready LLM Wiki state.

Judge the artifacts as a wiki packet, not as a standalone summary. Reward faithful source grounding, clear object decomposition, retrieval usefulness, and correct human-gate behavior.

## Inputs

You may receive:

- case JSON
- `run.json`
- `paper.md`
- `claims.jsonl`
- `methods.jsonl`
- `evidence.jsonl`
- `index.md` and `log.md` or their diffs
- selected source text/images
- existing wiki context packet
- optional user notes

## Hard Rules

Fail the packet if any of these occur:

- A fabricated or unsupported claim is presented as a paper fact.
- Core claims lack page, section, table, figure, or equation provenance.
- Source facts, wiki synthesis, and user insight are collapsed into one undifferentiated voice.
- YAML/JSONL is invalid enough to break retrieval or automation.
- The quality gate says `pass` while obvious extraction, provenance, or schema failures remain.

## Scoring

Score each dimension from 1 to 5:

1. `source_fidelity`: Is the paper represented faithfully?
2. `provenance_quality`: Can important claims and methods be audited?
3. `paper_model_depth`: Does it capture mechanism, assumptions, evidence strength, limitations, and implications?
4. `object_decomposition`: Are paper, claims, methods, evidence, concepts, and synthesis candidates separated appropriately?
5. `retrieval_readiness`: Will future queries retrieve the right page/context?
6. `wiki_integration`: Does it update or propose links to existing wiki state without pollution?
7. `uncertainty_handling`: Are gaps, weak evidence, conflicts, and low-confidence regions explicit?
8. `human_gate_discipline`: Does it avoid mandatory review for routine low-risk ingests while escalating hard cases?
9. `research_usefulness`: Does it help future implementation, experiment design, hypothesis refinement, or reading decisions?
10. `format_schema_validity`: Are Markdown, frontmatter, JSONL, index, and log machine-readable and stable?

## Weighted Decision

Weights:

- source_fidelity: 2
- provenance_quality: 2
- paper_model_depth: 2
- object_decomposition: 1
- retrieval_readiness: 1.5
- wiki_integration: 1
- uncertainty_handling: 1.5
- human_gate_discipline: 1
- research_usefulness: 2
- format_schema_validity: blocking

Decision:

- `pass`: weighted score >= 4.0 and no blocking issue
- `needs_refine`: weighted score 3.0-3.9 or one serious local issue
- `fail`: weighted score < 3.0 or any hard-rule failure

## Output JSON

Return only JSON:

```json
{
  "schema_version": "paper_wiki_judge_result.v0",
  "case_id": "",
  "decision": "pass",
  "weighted_score": 0.0,
  "dimension_scores": {
    "source_fidelity": 0,
    "provenance_quality": 0,
    "paper_model_depth": 0,
    "object_decomposition": 0,
    "retrieval_readiness": 0,
    "wiki_integration": 0,
    "uncertainty_handling": 0,
    "human_gate_discipline": 0,
    "research_usefulness": 0,
    "format_schema_validity": 0
  },
  "blocking_issues": [],
  "findings": [
    {
      "severity": "major",
      "dimension": "provenance_quality",
      "artifact": "claims.jsonl",
      "problem": "",
      "evidence": "",
      "suggested_fix": ""
    }
  ],
  "calibration_questions_for_human": [],
  "recommended_refine_bucket": "workflow"
}
```

## Run Manifest

```json
{
  "schema_version": "paper_wiki_ingest.v0",
  "created_at": "2026-05-18T20:58:33.981193+00:00",
  "source_pdf": "/Users/shawn/Desktop/2604.10496v1.pdf",
  "title": "CodeQuant: Unified Clustering and Quantization for Enhanced Outlier Smoothing in Low-Precision Mixture-of-Experts",
  "write_policy": "draft_only",
  "draft_artifacts": {
    "review_packet": "wiki/.drafts/ingests/2604-10496v1/review.md",
    "paper_page": "wiki/.drafts/ingests/2604-10496v1/paper.md",
    "claims": "wiki/.drafts/ingests/2604-10496v1/claims.jsonl",
    "methods": "wiki/.drafts/ingests/2604-10496v1/methods.jsonl",
    "evidence": "wiki/.drafts/ingests/2604-10496v1/evidence.jsonl"
  },
  "quality_gate": {
    "schema_version": "paper_wiki_quality_gate.v0",
    "decision": "warn",
    "review_state": "needs_review",
    "confidence": "medium",
    "errors": [],
    "warnings": [
      "manual_content_quality_needs_evaluation",
      "canonical_publish_not_run"
    ]
  },
  "review_packet": "wiki/.drafts/ingests/2604-10496v1/review.md",
  "paper_page": "wiki/.drafts/ingests/2604-10496v1/paper.md",
  "extraction_dir": "wiki/.drafts/ingests/2604-10496v1/extraction",
  "page_count": 19,
  "canonical_wiki_mutated": false
}
```

## Artifact: draft.review_packet

Path: `wiki/.drafts/ingests/2604-10496v1/review.md`

```markdown
---
type: "ingest_review"
title: "One-Paper Ingest Review Packet: CodeQuant"
status: "draft"
created: "2026-05-18"
updated: "2026-05-18"
source_pdf: "/Users/shawn/Desktop/2604.10496v1.pdf"
paper_page: "paper.md"
paper_id: "arxiv:2604.10496v1"
artifacts:
  - "paper.md"
  - "claims.jsonl"
  - "methods.jsonl"
  - "evidence.jsonl"
  - "extraction/pages.jsonl"
tags:
  - "llm-wiki"
  - "paper-ingest"
  - "review-packet"
  - "quantization"
  - "mixture-of-experts"
confidence: "medium"
write_policy: "review_before_publish"
canonical_wiki_mutated: false
---
# One-Paper Ingest Review Packet: CodeQuant

> Status: draft-only review packet. This file is for human review and does not publish canonical wiki pages.

## Paper Identity

- Title: CodeQuant: Unified Clustering and Quantization for Enhanced Outlier Smoothing in Low-Precision Mixture-of-Experts
- Venue/status in PDF: ICLR 2026 conference paper
- Authors: Xiangyang Yin, Xingyu Liu, Tianhua Xia, Bo Bao, Vithursan Thangarasa, Valavan Manohararajah, Eric Sather, Sai Qian Zhang
- Source PDF: `/Users/shawn/Desktop/2604.10496v1.pdf`
- Draft artifact root: `wiki/.drafts/ingests/2604-10496v1/`
- Page count: 19
- Write policy: draft only; no canonical wiki pages were modified
- Code link stated by paper: `https://github.com/SAI-Lab-NYU/CodeQuant` (p. 1)

## Problem / Motivation

The paper targets post-training quantization (PTQ) for Mixture-of-Experts (MoE) LLMs under low-bit constraints. Its motivation is that MoE models are deployment-heavy because total parameter count and memory/communication costs remain large even though only a subset of experts is active per token. Low-precision quantization is therefore attractive, but activation and weight outliers make 4-bit PTQ unreliable, especially for MoE models. The paper frames outliers as the main source of accuracy degradation after quantization and argues that existing rotation/smoothing methods reduce but do not remove the problem. Provenance: p. 1, p. 2.

The central product claim is that clustering/codebook quantization can absorb extreme weight values into centroids, while learnable rotation reduces activation outliers; together with a LUT-oriented kernel, this gives a better accuracy/efficiency tradeoff for MoE deployment. Provenance: p. 1, p. 2.

## Core Method

CodeQuant is a four-stage compression/deployment framework:

1. **Activation-oriented Outlier Smoothing (AOS)**: learn an orthogonal rotation matrix using a Cayley transform so rotated activations are easier to quantize. The rotation is shared across MoE router and experts to avoid online computation and preserve invariance. Provenance: p. 2, p. 4.
2. **Adaptive Weight Clustering and Centroid Finetuning (ACCF)**: replace uniform weight quantization with row-wise codebook clustering, then fine-tune centroids to minimize output mismatch. For MoE FFN layers, the objective includes the MoE weighted sum and a KL term on router logits to preserve token-expert assignment. Provenance: p. 4, p. 5.
3. **Permutation-Invariant Outlier Grouping (POG)**: reorder columns/subgroups in rotated weight matrices so block-wise clustering groups are better conditioned. The permutation is folded into adjacent weight matrices to avoid online runtime cost. Provenance: p. 6, p. 16.
4. **LUT-based kernel/system implementation**: use lookup table precomputation and table lookup for clustered weight/quantized activation multiplication, with GPU simulation and CPU benchmarking. Provenance: p. 7, p. 10, p. 18.

Implementation-relevant reading: AOS and ACCF are the actual compression algorithms; POG is a grouping/initialization improvement mainly relevant to block-wise settings; LUT kernel design is the system acceleration story.

## Assumptions

- MoE FFN/router/expert transformations can share a rotation without online compute while preserving the module output under the stated algebraic invariance. Provenance: p. 4.
- Activation quantization remains a dominant bottleneck after replacing weight quantization with clustering, motivating learned rotations rather than random rotations. Provenance: p. 4, p. 10.
- Router stability matters enough that centroid fine-tuning for MoE FFN should include a KL divergence term on router outputs. Provenance: p. 5, p. 10, p. 18.
- Block-wise clustering quality depends on how weights are grouped; permuting subgroups can reduce within-group variance and improve clusterability. Provenance: p. 6, p. 16, p. 18.
- LUT-based computation can realize the efficiency benefits of clustering, but GPU results rely on simulation with hardware assumptions, while CPU results use a T-MAC/Llama.cpp-style benchmark path. Provenance: p. 7, p. 10, p. 18.

Needs review:

- The paper states code availability on p. 1, while the reproducibility statement says code was not released at submission time and would be released upon acceptance. This may simply reflect acceptance-time revision, but the wiki should mark code availability as date-sensitive. Provenance: p. 1, p. 11.
- The exact relationship between CodeQuant's clustering objective and full-Hessian/GPTQ-style objectives should be compared carefully if this paper is used for CodeQuant2 implementation decisions. Provenance: p. 5.

## Main Claims

- **Claim: CodeQuant improves low-bit MoE PTQ accuracy over uniform quantization and prior smoothing/rotation baselines.**
  - Evidence: Table 1 reports strong A4W4 results across Phi-mini-MoE-Instruct, DeepSeek-V2-Lite, Qwen3-30B-A3B, and Mixtral 8x7B. CodeQuant consistently improves over RTN, SqueezeLLM, SmoothQuant, and QuaRot in the reported aggregate accuracy/perplexity settings. Provenance: p. 8, p. 9.
  - Confidence: high for reported experiments; external reproducibility not yet assessed.

- **Claim: CodeQuant is especially helpful under very low-bit/extreme compression.**
  - Evidence: Table 6 compares A4W2/A4W3/A4W4 on DeepSeek-V2-Lite and reports CodeQuant outperforming SqueezeLLM across all budgets, with a wider advantage at smaller centroid budgets. Provenance: p. 10.
  - Confidence: medium-high; only one model is visible in the main ablation.

- **Claim: AOS learned rotation improves over random rotation.**
  - Evidence: Table 4 on DeepSeek-V2-Lite A4W4 embedding-wise shows AOS reducing WikiText2/C4 perplexity and increasing aggregate accuracy compared with random rotation. Provenance: p. 10.
  - Confidence: medium; ablation is targeted but limited.

- **Claim: KL router penalty improves performance and stabilizes routing.**
  - Evidence: Table 5 improves Phi-mini and DeepSeek metrics with KL; Table 11 reports lower router top-k change rates when KL is used. Provenance: p. 10, p. 18.
  - Confidence: medium-high; both accuracy and router-change evidence are provided.

- **Claim: POG helps block-wise clustering.**
  - Evidence: Table 10 reports small but consistent gains with POG on Phi-mini-MoE-Instruct and DeepSeek-V2-Lite under A4W4 block-wise configuration; appendix explains why POG has effect in block-wise but not embedding-wise settings. Provenance: p. 16, p. 18.
  - Confidence: medium; improvements are modest.

- **Claim: CodeQuant provides speedups.**
  - Evidence: Figure 5 reports average GPU simulated speedups over BF16/QuaRot/SqueezeLLM, and Table 9 reports CPU latency improvements with up to 4.15x speedup over BF16 baselines. Provenance: p. 10, p. 18.
  - Confidence: medium; GPU is simulated, CPU path is real benchmark.

## Evidence Notes

- The accuracy evidence is broad across four MoE architectures in A4W4 embedding-wise and two models in A4W4 block-wise. Provenance: Table 1, p. 8.
- Mathematical reasoning is tested separately on GSM8K and MATH500; CodeQuant remains closer to BF16 than QuaRot on DeepSeek-V2-Lite and Qwen3-30B-A3B. Provenance: Table 3, p. 9.
- Ablations provide direct support for the three algorithmic components: AOS, KL penalty in ACCF, and POG. Provenance: p. 10, p. 18.
- System efficiency evidence mixes simulation and real CPU measurements. The paper is transparent that GPU performance is evaluated with Accel-Sim rather than a full hardware implementation. Provenance: p. 7, p. 10.
- Reproducibility details mention fixed seeds, public datasets, baseline reimplementation, and compute resources. Provenance: p. 11.

## Figures / Tables / Equations Notes

- **Figure 1, p. 2**: Best overview of the paper. It shows the four-stage CodeQuant pipeline: AOS, POG, ACCF, and LUT kernel. This figure should anchor the wiki paper page.
- **Figure 2 / Eq. 1-3, p. 4**: Explains the rotation-invariance story in MoE FFN and the Cayley-transform parameterization for learnable orthogonal rotations. Important for implementation notes.
- **Eq. 4-9, p. 5**: Defines weight reconstruction from centroids and assignment tensor, output-mismatch objectives, MoE-specific objective with KL router term, and diagonal approximation for assignment update. Important for implementation/reproduction.
- **Figure 3, p. 6**: Shows POG intuition: subgroup permutation redistributes high/low variance components to lower clustering error in block-wise clustering.
- **Figure 4, p. 7**: Shows LUT precomputation and lookup path; the key system argument is replacing repeated multiply-accumulate operations with table lookup.
- **Table 1, p. 8**: Main accuracy/perplexity table. Must be reviewed before creating any strong "SOTA" claim page.
- **Table 2-3, p. 9**: Rotation baseline comparison and math reasoning evaluation.
- **Tables 4-6 / Figure 5, p. 10**: Main ablations and speedup chart.
- **Algorithm 1, p. 16**: POG algorithm. Worth a standalone implementation note if this paper feeds CodeQuant2.
- **Tables 7-11, p. 17-18**: Appendix tables for A8W4, CPU latency, POG impact, and KL router stability.

## Experiments / Datasets / Metrics / Baselines

- Models: Phi-mini-MoE-Instruct, DeepSeek-V2-Lite, Qwen3-30B-A3B, Mixtral 8x7B. Provenance: p. 7.
- Language modeling metrics: perplexity on WikiText2 and C4. Provenance: p. 7.
- Zero-shot QA metrics: ARC-Challenge, ARC-Easy, HellaSwag, MMLU, PIQA, WinoGrande. Provenance: p. 7.
- Math reasoning: GSM8K 8-shot and MATH500 4-shot. Provenance: p. 9.
- Baselines: RTN, SmoothQuant, QuaRot, SqueezeLLM; additional rotation baselines include DuQuant and SpinQuant with online Hadamard transforms. Provenance: p. 7, p. 9.
- Configurations: A4W4/A8W4; embedding-wise and block-wise clustering/quantization. Provenance: p. 8, p. 17.
- Kernel evaluation: A100 GPU simulation via Accel-Sim; CPU benchmark using A8W4 T-MAC kernel against Llama.cpp BF16/A8W4 baselines. Provenance: p. 7, p. 10, p. 18.
- Calibration/training details visible in main text: AOS uses WikiText2 calibration samples and iterative optimization; ACCF fine-tunes centroids with KL coefficient set to 1.0 in the described experiments. Provenance: p. 7, p. 10.

Fair-comparison caveats:

- SqueezeLLM is used as a weight-clustering plus activation-quantization baseline without the same GPU architectural modifications; this helps isolate system gains but may not compare identical kernels. Provenance: p. 8.
- CodeQuant speedups on GPU are simulated, not measured on an implemented CodeQuant tensor-core path. Provenance: p. 7, p. 10.
- Appendix A8W4/block-wise results show some settings where gains are smaller; the paper itself notes DeepSeek-V2-Lite can already be near BF16 in A8W4. Provenance: p. 9, p. 17.

## Limitations

- The paper does not appear to include a full released implementation inside the PDF itself; code availability should be verified externally before treating reproduction as easy. Provenance: p. 1, p. 11.
- GPU speedups depend on simulation and hardware-structure assumptions; real GPU kernel implementation is not fully demonstrated in the main PDF. Provenance: p. 7, p. 10.
- POG's gains are modest in the appendix tables, so it should be treated as a useful initialization/grouping refinement rather than the main source of accuracy. Provenance: p. 18.
- The paper reports strong results across multiple models, but reproducibility will likely depend on calibration choices, rotation optimization, centroid fine-tuning details, router KL implementation, and kernel support.
- Figure/table extraction in this draft was page-level; standalone figure/table crops were not extracted in v0. Human review should inspect page images for exact visual details.

## Open Questions

- What exact objective/approximation should be used if we compare CodeQuant's ACCF assignment update against GPTQ-style Hessian objectives?
- Does the row-wise centroid codebook design map cleanly to the current CodeQuant2 codebase, or does it require a different parameterization?
- How sensitive is AOS to calibration sample count, optimization iterations, and Cayley-transform implementation details?
- How important is the KL router term for models with different top-k routing, shared experts, or expert counts?
- Is POG worth implementing before ACCF is stable, given that reported gains are smaller than the main clustering/rotation gains?
- What parts of the LUT kernel story are implementable in software-only experiments versus requiring hardware/simulator assumptions?

## Candidate Wiki Updates

- Paper page:
  - `[[CodeQuant]]` or `[[CodeQuant Unified Clustering and Quantization for MoE]]`

- Claim candidates:
  - `[[Clustering can absorb weight outliers better than uniform quantization in MoE PTQ]]`
  - `[[Learned rotation reduces activation quantization error for MoE PTQ]]`
  - `[[Router KL regularization stabilizes quantized MoE expert assignment]]`
  - `[[POG improves block-wise weight clustering by balancing subgroup variance]]`
  - `[[LUT-based clustered GEMM can improve low-bit MoE inference latency]]`

- Method/concept candidates:
  - `[[Activation-oriented Outlier Smoothing]]`
  - `[[Adaptive Weight Clustering and Centroid Finetuning]]`
  - `[[Permutation-Invariant Outlier Grouping]]`
  - `[[MoE PTQ]]`
  - `[[LUT-based GEMM]]`
  - `[[Router stability under quantization]]`

- Experiment/result candidates:
  - `[[CodeQuant A4W4 MoE evaluation]]`
  - `[[CodeQuant AOS ablation]]`
  - `[[CodeQuant KL router ablation]]`
  - `[[CodeQuant POG ablation]]`
  - `[[CodeQuant CPU and GPU latency evaluation]]`

- Links likely needed:
  - SmoothQuant, QuaRot, SpinQuant, DuQuant, SqueezeLLM, GPTQ, AWQ, MoEQuant, T-MAC, LUT-GEMM.

## Uncertainty / Gaps

- Needs human review: exact title/page naming conventions before publishing.
- Needs human review: whether to make ACCF, AOS, and POG separate method pages immediately or keep them as sections under the CodeQuant paper page until more papers link to them.
- Needs external verification: current GitHub repo state and whether code matches the PDF.
- Needs deeper implementation review: equations 5-9 and appendix algorithm should be checked against actual code before using them as implementation guidance.
- Needs figure/table audit: page images should be reviewed for any visual nuance missed by text extraction, especially Figures 1-5 and Tables 1-6.

## Publish Proposal

Recommended initial policy: `review_before_publish`.

Canonical wiki mutation: `none` in this ingest run.

Suggested next human decisions:

1. Approve or correct the high-level paper model.
2. Decide whether AOS / ACCF / POG become standalone method pages now.
3. Decide whether to prioritize implementation-oriented notes for CodeQuant2.
4. Verify code availability and whether the repo should be added as a raw source.
5. Select which claims should become durable claim pages with page-level provenance.

## Page-Level Extraction Notes

- p. 1: abstract, motivation, high-level claim, code link, intro starts.
- p. 2: Figure 1 framework overview; contributions; related work begins.
- p. 3: outlier-aware quantization background and relation to SmoothQuant, rotation methods, and non-uniform/clustering methods.
- p. 4: AOS and rotation invariance in MoE FFN; Cayley transform objective.
- p. 5: ACCF objective; MoE-specific weighted-sum plus router KL objective; assignment update derivation.
- p. 6: POG intuition and permutation folding; LUT kernel section starts.
- p. 7: LUT kernel details and experiment setup.
- p. 8: main Table 1 and A4W4 results.
- p. 9: rotation baseline comparison, math reasoning, latency section.
- p. 10: AOS/KL/bitwidth ablations, speedup chart, conclusion.
- p. 11: ethics, reproducibility, LLM-use statement, references begin.
- p. 12-15: references.
- p. 16: POG algorithm and block-wise analysis.
- p. 17: A8W4 appendix results.
- p. 18: rotation comparison, CPU latency, POG/KL appendix tables.
- p. 19: continuation of KL router analysis.
```

## Artifact: draft.paper_page

Path: `wiki/.drafts/ingests/2604-10496v1/paper.md`

```markdown
---
type: "paper"
title: "CodeQuant: Unified Clustering and Quantization for Enhanced Outlier Smoothing in Low-Precision Mixture-of-Experts"
status: "draft"
created: "2026-05-18"
updated: "2026-05-18"
aliases:
  - "CodeQuant"
paper_id: "arxiv:2604.10496v1"
source_pdf: "/Users/shawn/Desktop/2604.10496v1.pdf"
sources:
  - "/Users/shawn/Desktop/2604.10496v1.pdf"
page_count: 19
tags:
  - "llm-wiki"
  - "paper"
  - "quantization"
  - "mixture-of-experts"
  - "post-training-quantization"
topics:
  - "MoE quantization"
  - "outlier smoothing"
  - "weight clustering"
  - "LUT inference"
methods:
  - "Activation-oriented Outlier Smoothing"
  - "Adaptive Weight Clustering and Centroid Finetuning"
  - "Permutation-Invariant Outlier Grouping"
  - "LUT-based clustered GEMM"
models:
  - "Phi-mini-MoE-Instruct"
  - "DeepSeek-V2-Lite"
  - "Qwen3-30B-A3B"
  - "Mixtral-8x7B"
datasets:
  - "WikiText2"
  - "C4"
  - "ARC-Challenge"
  - "ARC-Easy"
  - "HellaSwag"
  - "MMLU"
  - "PIQA"
  - "WinoGrande"
  - "GSM8K"
  - "MATH500"
metrics:
  - "perplexity"
  - "accuracy"
  - "latency"
  - "memory"
claims:
  - "claim-codequant-accuracy"
  - "claim-codequant-low-bit"
  - "claim-aos-learned-rotation"
  - "claim-router-kl-stability"
  - "claim-pog-blockwise"
  - "claim-lut-speedup"
related:
  - "SmoothQuant"
  - "QuaRot"
  - "SpinQuant"
  - "DuQuant"
  - "SqueezeLLM"
  - "GPTQ"
  - "AWQ"
  - "MoEQuant"
confidence: "medium"
write_policy: "review_before_publish"
canonical_wiki_mutated: false
---
# CodeQuant

> Draft paper page for retrieval and review. The fuller human-facing packet is `review.md`; structured candidates are in `claims.jsonl`, `methods.jsonl`, and `evidence.jsonl`.

## Retrieval Summary

CodeQuant is a post-training quantization framework for Mixture-of-Experts LLMs. It combines learned activation rotation, row-wise clustered weight quantization with centroid fine-tuning, block-wise permutation grouping, and LUT-oriented inference. This page should be retrieved for questions about MoE PTQ, activation/weight outlier mitigation, clustering/codebook quantization, router stability under quantization, and research implementation choices for CodeQuant-style methods.

## Key Contributions

- Uses learned orthogonal rotation to smooth activation outliers while preserving MoE FFN invariance. Provenance: p. 4.
- Replaces uniform weight quantization with adaptive row-wise clustering and centroid fine-tuning. Provenance: p. 4-5.
- Adds an MoE-specific centroid objective with weighted expert outputs and router KL regularization. Provenance: p. 5, p. 10, p. 18.
- Introduces POG to improve block-wise clustering by permuting subgroups before clustering. Provenance: p. 6, p. 16, p. 18.
- Argues that clustered weights plus quantized activations can be accelerated with LUT-based kernels. Provenance: p. 7, p. 10, p. 18.

## Method Notes

The main algorithmic pieces are AOS, ACCF, POG, and LUT-based GEMM. AOS and ACCF are the highest-value pieces for research implementation. POG appears useful mainly in block-wise settings, with more modest reported gains. The LUT kernel is important for the systems claim but should be separated from algorithmic validity because GPU speedups are simulated.

## Evidence Index

- Main A4W4 accuracy/perplexity results: Table 1, p. 8.
- Rotation baseline comparison and math reasoning evaluation: Table 2-3, p. 9.
- AOS, KL, bitwidth, and speedup ablations: Tables 4-6 and Figure 5, p. 10.
- POG algorithm and block-wise analysis: Algorithm 1, p. 16.
- Appendix A8W4, CPU latency, POG, and KL-router tables: p. 17-18.

## Open Questions

- How should ACCF be compared to GPTQ/full-Hessian objectives in an implementation-oriented wiki?
- Does CodeQuant2 need row-wise centroids, block-wise centroids, or both?
- Is POG worth implementing before AOS and ACCF are stable?
- Which speedup claims should be treated as systems evidence versus simulation evidence?
- Is the public repository consistent with the PDF version?

## Publish Proposal

Do not publish automatically. After human review, likely publish path is:

- canonical paper page for CodeQuant
- method pages for AOS and ACCF first
- claim pages only for accuracy, router KL, and speedup claims that have enough provenance
- implementation note comparing ACCF with GPTQ/full-Hessian variants
```

## Artifact: draft.claims

Path: `wiki/.drafts/ingests/2604-10496v1/claims.jsonl`

```json
{"schema_version":"claim_candidate.v0","id":"claim-codequant-accuracy","status":"draft","paper_title":"CodeQuant: Unified Clustering and Quantization for Enhanced Outlier Smoothing in Low-Precision Mixture-of-Experts","claim":"CodeQuant improves low-bit MoE PTQ accuracy over uniform quantization and prior smoothing/rotation baselines.","claim_type":"source_claim","provenance":[{"page":8,"locator":"Table 1"},{"page":9,"locator":"Table 2-3"}],"evidence_ids":["evidence-main-table","evidence-rotation-math"],"confidence":"high_for_reported_results","review_state":"needs_human_review"}
{"schema_version":"claim_candidate.v0","id":"claim-codequant-low-bit","status":"draft","paper_title":"CodeQuant: Unified Clustering and Quantization for Enhanced Outlier Smoothing in Low-Precision Mixture-of-Experts","claim":"CodeQuant is especially helpful under very low-bit or extreme compression settings.","claim_type":"source_claim","provenance":[{"page":10,"locator":"Table 6"}],"evidence_ids":["evidence-ablation-speed"],"confidence":"medium_high","review_state":"needs_human_review"}
{"schema_version":"claim_candidate.v0","id":"claim-aos-learned-rotation","status":"draft","paper_title":"CodeQuant: Unified Clustering and Quantization for Enhanced Outlier Smoothing in Low-Precision Mixture-of-Experts","claim":"AOS learned rotation improves over random rotation for activation quantization.","claim_type":"source_claim","provenance":[{"page":10,"locator":"Table 4"}],"evidence_ids":["evidence-ablation-speed"],"confidence":"medium","review_state":"needs_human_review"}
{"schema_version":"claim_candidate.v0","id":"claim-router-kl-stability","status":"draft","paper_title":"CodeQuant: Unified Clustering and Quantization for Enhanced Outlier Smoothing in Low-Precision Mixture-of-Experts","claim":"Router KL regularization improves performance and stabilizes MoE routing under quantization.","claim_type":"source_claim","provenance":[{"page":10,"locator":"Table 5"},{"page":18,"locator":"Table 11"}],"evidence_ids":["evidence-ablation-speed","evidence-appendix-kl"],"confidence":"medium_high","review_state":"needs_human_review"}
{"schema_version":"claim_candidate.v0","id":"claim-pog-blockwise","status":"draft","paper_title":"CodeQuant: Unified Clustering and Quantization for Enhanced Outlier Smoothing in Low-Precision Mixture-of-Experts","claim":"POG helps block-wise clustering by improving subgroup grouping before centroid assignment.","claim_type":"source_claim","provenance":[{"page":16,"locator":"Algorithm 1"},{"page":18,"locator":"Table 10"}],"evidence_ids":["evidence-pog-algorithm","evidence-appendix-pog"],"confidence":"medium","review_state":"needs_human_review"}
{"schema_version":"claim_candidate.v0","id":"claim-lut-speedup","status":"draft","paper_title":"CodeQuant: Unified Clustering and Quantization for Enhanced Outlier Smoothing in Low-Precision Mixture-of-Experts","claim":"LUT-based clustered inference can improve low-bit MoE inference latency.","claim_type":"source_claim","provenance":[{"page":10,"locator":"Figure 5"},{"page":18,"locator":"Table 9"}],"evidence_ids":["evidence-ablation-speed","evidence-cpu-latency"],"confidence":"medium_due_to_gpu_simulation","review_state":"needs_human_review"}
```

## Artifact: draft.methods

Path: `wiki/.drafts/ingests/2604-10496v1/methods.jsonl`

```json
{"schema_version":"method_candidate.v0","id":"method-aos","status":"draft","paper_title":"CodeQuant: Unified Clustering and Quantization for Enhanced Outlier Smoothing in Low-Precision Mixture-of-Experts","name":"Activation-oriented Outlier Smoothing","summary":"Learns an orthogonal rotation through a Cayley transform so activations become easier to quantize while preserving MoE FFN invariance.","inputs":["calibration activations","MoE FFN weights"],"outputs":["rotation matrix","rotated activations/weights for downstream quantization"],"assumptions":["shared rotation can be folded without online overhead","activation outliers remain a dominant PTQ bottleneck"],"provenance":[{"page":4,"locator":"Figure 2 and Eq. 1-3"}],"confidence":"medium","review_state":"needs_human_review"}
{"schema_version":"method_candidate.v0","id":"method-accf","status":"draft","paper_title":"CodeQuant: Unified Clustering and Quantization for Enhanced Outlier Smoothing in Low-Precision Mixture-of-Experts","name":"Adaptive Weight Clustering and Centroid Finetuning","summary":"Replaces uniform weight quantization with row-wise codebook clustering and fine-tunes centroids with an output-mismatch objective, including MoE router KL regularization.","inputs":["rotated weights","calibration activations","router logits"],"outputs":["centroids","assignment tensor","quantized clustered weights"],"assumptions":["centroid reconstruction can better absorb weight outliers","router assignment stability should be protected during quantization"],"provenance":[{"page":4,"locator":"ACCF section"},{"page":5,"locator":"Eq. 4-9"},{"page":10,"locator":"Table 5"},{"page":18,"locator":"Table 11"}],"confidence":"medium","review_state":"needs_human_review"}
{"schema_version":"method_candidate.v0","id":"method-pog","status":"draft","paper_title":"CodeQuant: Unified Clustering and Quantization for Enhanced Outlier Smoothing in Low-Precision Mixture-of-Experts","name":"Permutation-Invariant Outlier Grouping","summary":"Permutes subgroups in rotated weight matrices to reduce block-wise clustering error, then folds the permutation into adjacent matrices to avoid online runtime cost.","inputs":["rotated weights","block-wise clustering configuration"],"outputs":["subgroup permutation","better-conditioned block-wise groups"],"assumptions":["grouping variance influences block-wise clustering quality","permutation can be folded into adjacent weights"],"provenance":[{"page":6,"locator":"Figure 3"},{"page":16,"locator":"Algorithm 1"},{"page":18,"locator":"Table 10"}],"confidence":"medium","review_state":"needs_human_review"}
{"schema_version":"method_candidate.v0","id":"method-lut-gemm","status":"draft","paper_title":"CodeQuant: Unified Clustering and Quantization for Enhanced Outlier Smoothing in Low-Precision Mixture-of-Experts","name":"LUT-based clustered GEMM","summary":"Precomputes activation-centroid products and uses table lookup to reduce repeated low-bit multiply-accumulate work for clustered weights.","inputs":["quantized activations","centroids","weight assignments"],"outputs":["lookup-table inference path"],"assumptions":["hardware or kernel path can exploit table lookup efficiently","simulated GPU assumptions transfer to practical deployment"],"provenance":[{"page":7,"locator":"Figure 4"},{"page":10,"locator":"Figure 5"},{"page":18,"locator":"Table 9"}],"confidence":"medium_due_to_system_dependency","review_state":"needs_human_review"}
```

## Artifact: draft.evidence

Path: `wiki/.drafts/ingests/2604-10496v1/evidence.jsonl`

```json
{"schema_version":"evidence_candidate.v0","id":"evidence-framework-overview","status":"draft","evidence_type":"figure","page":2,"locator":"Figure 1","summary":"Pipeline overview showing AOS, POG, ACCF, and LUT kernel stages.","supports":["method-aos","method-accf","method-pog","method-lut-gemm"],"confidence":"medium","review_state":"needs_human_visual_check"}
{"schema_version":"evidence_candidate.v0","id":"evidence-aos-equations","status":"draft","evidence_type":"equation_figure","page":4,"locator":"Figure 2 and Eq. 1-3","summary":"MoE rotation-invariance argument and Cayley-transform parameterization for learnable orthogonal rotation.","supports":["method-aos","claim-aos-learned-rotation"],"confidence":"medium","review_state":"needs_human_equation_check"}
{"schema_version":"evidence_candidate.v0","id":"evidence-accf-objective","status":"draft","evidence_type":"equation","page":5,"locator":"Eq. 4-9","summary":"Centroid reconstruction, output-mismatch objective, MoE weighted objective, router KL term, and diagonal approximation for assignment updates.","supports":["method-accf","claim-router-kl-stability"],"confidence":"medium","review_state":"needs_human_equation_check"}
{"schema_version":"evidence_candidate.v0","id":"evidence-pog-figure","status":"draft","evidence_type":"figure","page":6,"locator":"Figure 3","summary":"POG intuition: subgroup permutation redistributes high/low variance components to improve block-wise clustering.","supports":["method-pog","claim-pog-blockwise"],"confidence":"medium","review_state":"needs_human_visual_check"}
{"schema_version":"evidence_candidate.v0","id":"evidence-lut-figure","status":"draft","evidence_type":"figure","page":7,"locator":"Figure 4","summary":"LUT precomputation and table lookup inference path for clustered weight and quantized activation multiplication.","supports":["method-lut-gemm","claim-lut-speedup"],"confidence":"medium","review_state":"needs_human_visual_check"}
{"schema_version":"evidence_candidate.v0","id":"evidence-main-table","status":"draft","evidence_type":"table","page":8,"locator":"Table 1","summary":"Main A4W4 accuracy/perplexity results across four MoE model families and multiple baselines.","supports":["claim-codequant-accuracy"],"confidence":"high_for_reported_results","review_state":"needs_human_table_check"}
{"schema_version":"evidence_candidate.v0","id":"evidence-rotation-math","status":"draft","evidence_type":"table","page":9,"locator":"Table 2-3","summary":"Rotation baseline comparison and math reasoning evaluation on GSM8K/MATH500.","supports":["claim-codequant-accuracy","claim-aos-learned-rotation"],"confidence":"medium","review_state":"needs_human_table_check"}
{"schema_version":"evidence_candidate.v0","id":"evidence-ablation-speed","status":"draft","evidence_type":"table_figure","page":10,"locator":"Tables 4-6 and Figure 5","summary":"AOS, KL, bitwidth, and speedup ablations, including simulated GPU speedup evidence.","supports":["claim-codequant-low-bit","claim-aos-learned-rotation","claim-router-kl-stability","claim-lut-speedup"],"confidence":"medium","review_state":"needs_human_table_check"}
{"schema_version":"evidence_candidate.v0","id":"evidence-pog-algorithm","status":"draft","evidence_type":"algorithm","page":16,"locator":"Algorithm 1","summary":"POG algorithm and block-wise clustering analysis.","supports":["method-pog","claim-pog-blockwise"],"confidence":"medium","review_state":"needs_human_algorithm_check"}
{"schema_version":"evidence_candidate.v0","id":"evidence-cpu-latency","status":"draft","evidence_type":"table","page":18,"locator":"Table 9","summary":"CPU latency benchmark reporting up to 4.15x speedup over BF16 baselines.","supports":["claim-lut-speedup"],"confidence":"medium","review_state":"needs_human_table_check"}
{"schema_version":"evidence_candidate.v0","id":"evidence-appendix-pog","status":"draft","evidence_type":"table","page":18,"locator":"Table 10","summary":"POG ablation with small but consistent block-wise gains.","supports":["claim-pog-blockwise"],"confidence":"medium","review_state":"needs_human_table_check"}
{"schema_version":"evidence_candidate.v0","id":"evidence-appendix-kl","status":"draft","evidence_type":"table","page":18,"locator":"Table 11","summary":"Router top-k change rate decreases when KL regularization is used.","supports":["claim-router-kl-stability"],"confidence":"medium_high","review_state":"needs_human_table_check"}
```
