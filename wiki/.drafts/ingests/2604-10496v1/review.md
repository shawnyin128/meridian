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
