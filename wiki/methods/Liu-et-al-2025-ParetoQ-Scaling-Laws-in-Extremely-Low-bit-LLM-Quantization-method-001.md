---
type: "method"
title: "Liu et al. - 2025 - ParetoQ Scaling Laws in Extremely Low-bit LLM Quantization"
status: "draft"
sources:
  - "[[papers/Liu-et-al-2025-ParetoQ-Scaling-Laws-in-Extremely-Low-bit-LLM-Quantization|Liu et al. - 2025 - ParetoQ Scaling Laws in Extremely Low-bit LLM Quantization]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Liu-et-al-2025-ParetoQ-Scaling-Laws-in-Extremely-Low-bit-LLM-Quantization.md"
related_papers:
  - "papers/Liu-et-al-2025-ParetoQ-Scaling-Laws-in-Extremely-Low-bit-LLM-Quantization.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-0e22f5896f"
consolidation_target: "methods/calibration-aware-PTQ"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Liu et al. - 2025 - ParetoQ Scaling Laws in Extremely Low-bit LLM Quantization

- Source paper: [[papers/Liu-et-al-2025-ParetoQ-Scaling-Laws-in-Extremely-Low-bit-LLM-Quantization|Liu et al. - 2025 - ParetoQ Scaling Laws in Extremely Low-bit LLM Quantization]]
- Summary: While prior work favored learnable poli- cies for activations but used statistics-based quantization for weights (Liu et al., 2023b), we find that, with appropri- ate gradient scaling, learnable scales yield stable, superior performance for weights. We present ParetoQ, the first unified framework that facilitates rigorous comparisons across 1-bit, 1.58-bit, 2-bit, 3-bit, and 4-bit quan- tization settings. The key contributions of this study are as follows: • We present a comprehensive study on the intertwined ef- fects of QAT budget allocation and the specific choices of quantization functions across 8 models (125M to 3B) and 5 quantization strategies.
- Inputs: token embeddings, query/key/value projections, positional or attention bias terms, calibration or runtime activations, model weights
- Outputs: contextual token representations, sequence-model predictions, low-bit quantized model representation, rotation-transformed equivalent model, latency or memory-efficiency measurements
- Assumptions: attention computation and positional representation capture the dependencies required by the sequence task
- Provenance: p. 5; p. 10; p. 1
