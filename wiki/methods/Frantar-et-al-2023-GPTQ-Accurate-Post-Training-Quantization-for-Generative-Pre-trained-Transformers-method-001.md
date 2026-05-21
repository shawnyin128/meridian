---
type: "method"
title: "Frantar et al. - 2023 - GPTQ Accurate Post-Training Quantization for Generative Pre-trained Transformers"
status: "draft"
sources:
  - "[[papers/Frantar-et-al-2023-GPTQ-Accurate-Post-Training-Quantization-for-Generative-Pre-trained-Transformers|Frantar et al. - 2023 - GPTQ Accurate Post-Training Quantization for Generative Pre-trained Transformers]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Frantar-et-al-2023-GPTQ-Accurate-Post-Training-Quantization-for-Generative-Pre-trained-Transformers.md"
related_papers:
  - "papers/Frantar-et-al-2023-GPTQ-Accurate-Post-Training-Quantization-for-Generative-Pre-trained-Transformers.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-6c3c812e3a"
consolidation_target: "methods/post-training-quantization"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Frantar et al. - 2023 - GPTQ Accurate Post-Training Quantization for Generative Pre-trained Transformers

- Source paper: [[papers/Frantar-et-al-2023-GPTQ-Accurate-Post-Training-Quantization-for-Generative-Pre-trained-Transformers|Frantar et al. - 2023 - GPTQ Accurate Post-Training Quantization for Generative Pre-trained Transformers]]
- Summary: Moreover, we also show that our method can still provide reasonable accuracy in the extreme quantization regime, in which weights are quantized to 2-bit or even ternary quantization levels. LLM.int8() observes that activation outliers in a few feature dimensions break the quantization of larger models, and proposes to ﬁx this problem by keeping those dimensions in higher preci- sion. Our method more than doubles the compression gains rel- ative to previously-proposed one-shot quantization methods, preserving accuracy, allowing us for the ﬁrst time to execute an 175 billion-parameter model inside a single GPU for generative inference.
- Inputs: calibration or runtime activations, model weights, KV-cache tensors
- Outputs: low-bit quantized model representation, latency or memory-efficiency measurements
- Assumptions: the paper's stated setting and evaluation protocol are the right scope for reusing the method
- Provenance: p. 3; p. 4; p. 8
