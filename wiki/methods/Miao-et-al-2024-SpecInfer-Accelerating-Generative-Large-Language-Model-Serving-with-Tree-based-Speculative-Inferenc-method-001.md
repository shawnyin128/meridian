---
type: "method"
title: "Miao et al. - 2024 - SpecInfer Accelerating Generative Large Language Model Serving with Tree-based Speculative Inferenc"
status: "draft"
sources:
  - "[[papers/Miao-et-al-2024-SpecInfer-Accelerating-Generative-Large-Language-Model-Serving-with-Tree-based-Speculative-Inferenc|Miao et al. - 2024 - SpecInfer Accelerating Generative Large Language Model Serving with Tree-based Speculative Inferenc]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Miao-et-al-2024-SpecInfer-Accelerating-Generative-Large-Language-Model-Serving-with-Tree-based-Speculative-Inferenc.md"
related_papers:
  - "papers/Miao-et-al-2024-SpecInfer-Accelerating-Generative-Large-Language-Model-Serving-with-Tree-based-Speculative-Inferenc.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-4092ba07b4"
consolidation_target: "methods/KV-cache-compression"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Miao et al. - 2024 - SpecInfer Accelerating Generative Large Language Model Serving with Tree-based Speculative Inferenc

- Source paper: [[papers/Miao-et-al-2024-SpecInfer-Accelerating-Generative-Large-Language-Model-Serving-with-Tree-based-Speculative-Inferenc|Miao et al. - 2024 - SpecInfer Accelerating Generative Large Language Model Serving with Tree-based Speculative Inferenc]]
- Summary: To this end, we introduce tree attention, which generalizes the attention mechanism [48] from sequence to tree structure. Existing LLM systems generally use an incremental decod- ing approach to serving a request where the system computes the activations for all prompt tokens in a single step and then iteratively decodes one new token using the input prompt and all previously generated tokens [27]. In addition, the attention mechanism of Transformer [48] requires accessing the keys and values of all previous tokens to compute the attention output of a new token.
- Inputs: token embeddings, query/key/value projections, positional or attention bias terms, draft model proposals, target model verification logits, acceptance or tree budget, calibration or runtime activations, model weights, KV-cache tensors
- Outputs: contextual token representations, sequence-model predictions, verified accepted tokens, inference speedup without target-distribution change, low-bit quantized model representation, latency or memory-efficiency measurements
- Assumptions: attention computation and positional representation capture the dependencies required by the sequence task, target-model verification preserves the original decoding distribution
- Provenance: p. 3; p. 6; p. 2
