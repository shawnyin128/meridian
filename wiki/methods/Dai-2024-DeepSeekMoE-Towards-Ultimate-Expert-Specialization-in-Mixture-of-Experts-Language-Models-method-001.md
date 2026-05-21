---
type: "method"
title: "Dai 等 - 2024 - DeepSeekMoE Towards Ultimate Expert Specialization in Mixture-of-Experts Language Models"
status: "draft"
sources:
  - "[[papers/Dai-2024-DeepSeekMoE-Towards-Ultimate-Expert-Specialization-in-Mixture-of-Experts-Language-Models|Dai 等 - 2024 - DeepSeekMoE Towards Ultimate Expert Specialization in Mixture-of-Experts Language Models]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Dai-2024-DeepSeekMoE-Towards-Ultimate-Expert-Specialization-in-Mixture-of-Experts-Language-Models.md"
related_papers:
  - "papers/Dai-2024-DeepSeekMoE-Towards-Ultimate-Expert-Specialization-in-Mixture-of-Experts-Language-Models.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-989e3023e2"
consolidation_target: "methods/MoE-quantization"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Dai 等 - 2024 - DeepSeekMoE Towards Ultimate Expert Specialization in Mixture-of-Experts Language Models

- Source paper: [[papers/Dai-2024-DeepSeekMoE-Towards-Ultimate-Expert-Specialization-in-Mixture-of-Experts-Language-Models|Dai 等 - 2024 - DeepSeekMoE Towards Ultimate Expert Specialization in Mixture-of-Experts Language Models]]
- Summary: In response, we propose the DeepSeekMoE architecture towards ultimate expert specialization. We introduce DeepSeekMoE, an innovative MoE architecture aiming at achieving ultimate expert specialization, which employs two principal strategies of fine-grained expert segmentation and shared expert isolation. Infrastructures We conduct experiments based on HAI-LLM (High-Flyer, 2023), an efficient and light-weight training framework which integrates multiple parallelism strategies, including tensor paral- lelism (Korthikanti et al., 2023; Narayanan et al., 2021; Shoeybi et al., 2019), ZeRO data paral- lelism (Rajbhandari et al., 2020), PipeDream pipeline parallelism (Harlap et al., 2018), and more specifically, expert parallelism (Lepikhin et al., 2021) by combining data and tensor parallelism.
- Inputs: token embeddings, query/key/value projections, positional or attention bias terms, model weights, KV-cache tensors
- Outputs: contextual token representations, sequence-model predictions, low-bit quantized model representation
- Assumptions: attention computation and positional representation capture the dependencies required by the sequence task
- Provenance: p. 8; p. 4; p. 6
