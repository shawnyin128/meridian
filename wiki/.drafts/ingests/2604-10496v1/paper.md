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
