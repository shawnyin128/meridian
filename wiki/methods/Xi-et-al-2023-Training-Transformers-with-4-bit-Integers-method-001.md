---
type: "method"
title: "Xi et al. - 2023 - Training Transformers with 4-bit Integers"
status: "draft"
sources:
  - "[[papers/Xi-et-al-2023-Training-Transformers-with-4-bit-Integers|Xi et al. - 2023 - Training Transformers with 4-bit Integers]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Xi-et-al-2023-Training-Transformers-with-4-bit-Integers.md"
related_papers:
  - "papers/Xi-et-al-2023-Training-Transformers-with-4-bit-Integers.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-1f0d324052"
consolidation_target: "methods/outlier-aware-quantization"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Xi et al. - 2023 - Training Transformers with 4-bit Integers

- Source paper: [[papers/Xi-et-al-2023-Training-Transformers-with-4-bit-Integers|Xi et al. - 2023 - Training Transformers with 4-bit Integers]]
- Summary: To suppress outliers, we propose a Hadamard quantizer, which quantizes a transformed version of the activation matrix. SmoothQuant [57] migrates the quantization difficulty of activation outliers to weights and achieves 8-bit PTQ for large language models, such as OPT-175B. 3.2 Activation Outliers Simply applying LSQ for FQT with 4-bit activation/weights leads to accuracy degradation due to activation outliers [57].
- Inputs: token embeddings, query/key/value projections, positional or attention bias terms, calibration or runtime activations, model weights
- Outputs: contextual token representations, sequence-model predictions, low-bit quantized model representation, rotation-transformed equivalent model, latency or memory-efficiency measurements
- Assumptions: attention computation and positional representation capture the dependencies required by the sequence task
- Provenance: p. 2; p. 9; p. 3
