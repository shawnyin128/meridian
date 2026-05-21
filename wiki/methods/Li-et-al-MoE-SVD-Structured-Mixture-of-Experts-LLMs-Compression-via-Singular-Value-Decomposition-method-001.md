---
type: "method"
title: "Li et al. - MoE-SVD Structured Mixture-of-Experts LLMs Compression via Singular Value Decomposition"
status: "draft"
sources:
  - "[[papers/Li-et-al-MoE-SVD-Structured-Mixture-of-Experts-LLMs-Compression-via-Singular-Value-Decomposition|Li et al. - MoE-SVD Structured Mixture-of-Experts LLMs Compression via Singular Value Decomposition]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Li-et-al-MoE-SVD-Structured-Mixture-of-Experts-LLMs-Compression-via-Singular-Value-Decomposition.md"
related_papers:
  - "papers/Li-et-al-MoE-SVD-Structured-Mixture-of-Experts-LLMs-Compression-via-Singular-Value-Decomposition.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-dfd6954fbc"
consolidation_target: "methods/KV-cache-compression"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Li et al. - MoE-SVD Structured Mixture-of-Experts LLMs Compression via Singular Value Decomposition

- Source paper: [[papers/Li-et-al-MoE-SVD-Structured-Mixture-of-Experts-LLMs-Compression-via-Singular-Value-Decomposition|Li et al. - MoE-SVD Structured Mixture-of-Experts LLMs Compression via Singular Value Decomposition]]
- Summary: In this paper, we present MoE-SVD, a new decomposition-based compression framework tai- lored for MoE LLMs without any extra training. In particular, we propose selective decomposition strategy by measuring sensitivity metrics based on weight singular val- ues and activation statistics to automatically iden- tify decomposable expert layers. (2) Model Statistic Disparities: Activation outliers in OWL (Yin et al., 2023) are an effective pre-layer importance statistic and metric for dense LLM.
- Inputs: calibration or runtime activations, model weights, KV-cache tensors
- Outputs: low-bit quantized model representation, latency or memory-efficiency measurements
- Assumptions: the paper's stated setting and evaluation protocol are the right scope for reusing the method
- Provenance: p. 3; p. 1; p. 2
