---
type: "method"
title: "sparse outlier retention"
status: "active"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
sources:
  - "papers/Kim-et-al-2024-SqueezeLLM-Dense-and-Sparse-Quantization.md"
  - "papers/Dettmers-et-al-2022-LLM-int8-8-bit-Matrix-Multiplication-for-Transformers-at-Scale.md"
source_papers:
  - "papers/Kim-et-al-2024-SqueezeLLM-Dense-and-Sparse-Quantization.md"
  - "papers/Dettmers-et-al-2022-LLM-int8-8-bit-Matrix-Multiplication-for-Transformers-at-Scale.md"
related_papers:
  - "papers/Kim-et-al-2024-SqueezeLLM-Dense-and-Sparse-Quantization.md"
  - "papers/Dettmers-et-al-2022-LLM-int8-8-bit-Matrix-Multiplication-for-Transformers-at-Scale.md"
related_methods:
related_topics:
  - "low-bit quantization"
  - "quantization error"
  - "non-uniform quantization"
  - "sparse outlier retention"
  - "hardware-aware quantization"
supports:
contradicts:
supersedes:
superseded_by:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "knowledge-f6d5689d9c"
---
# sparse outlier retention

## What It Is

This is a compiled method-family page for `sparse outlier retention`. It groups canonical paper pages that use or discuss the method; source-grounded claims remain on the linked paper/evidence pages.

## Mechanism

- [[papers/Kim-et-al-2024-SqueezeLLM-Dense-and-Sparse-Quantization|Kim et al. - 2024 - SqueezeLLM Dense-and-Sparse Quantization]]: ### Sensitivity-based non-uniform quantization - Purpose: Allocates non-uniform quantization centroids according to both weight distribution and sensitivity, so low-bit dense weights preserve model outputs better than uniform bins. - Operat...
- [[papers/Dettmers-et-al-2022-LLM-int8-8-bit-Matrix-Multiplication-for-Transformers-at-Scale|Dettmers et al. - 2022 - LLM.int8() 8-bit Matrix Multiplication for Transformers at Scale]]: ### Vector-wise int8 quantization - Purpose: Uses row-wise activation scales and column-wise weight scales for int8 matrix multiplication so transformer linear layers can run in 8-bit with limited error. - Operates on: activation matrix; we...

## Used By Papers

- [[papers/Kim-et-al-2024-SqueezeLLM-Dense-and-Sparse-Quantization]]
- [[papers/Dettmers-et-al-2022-LLM-int8-8-bit-Matrix-Multiplication-for-Transformers-at-Scale]]

## Implementation Hooks

- [[papers/Kim-et-al-2024-SqueezeLLM-Dense-and-Sparse-Quantization|Kim et al. - 2024 - SqueezeLLM Dense-and-Sparse Quantization]]: - Sensitivity-based non-uniform quantization: Implement weighted k-means/objective explicitly and compare against uniform quantization. - Sensitivity-based non-uniform quantization: Keep sensitivity estimation reproducib...
- [[papers/Dettmers-et-al-2022-LLM-int8-8-bit-Matrix-Multiplication-for-Transformers-at-Scale|Dettmers et al. - 2022 - LLM.int8() 8-bit Matrix Multiplication for Transformers at Scale]]: - Vector-wise int8 quantization: Unit test the scale/dequantization path against FP16 matmul on non-outlier tensors. - Vector-wise int8 quantization: Track row/column scale shapes explicitly to avoid silent broadcasting...

## Failure Modes

- [[papers/Kim-et-al-2024-SqueezeLLM-Dense-and-Sparse-Quantization|Kim et al. - 2024 - SqueezeLLM Dense-and-Sparse Quantization]]: - Calibration-set representativeness is a scope condition; check whether the calibration distribution matches the deployment/evaluation distribution. - Reported gains should be rechecked under the exact bit-width, model...
- [[papers/Dettmers-et-al-2022-LLM-int8-8-bit-Matrix-Multiplication-for-Transformers-at-Scale|Dettmers et al. - 2022 - LLM.int8() 8-bit Matrix Multiplication for Transformers at Scale]]: - Calibration-set representativeness is a scope condition; check whether the calibration distribution matches the deployment/evaluation distribution. - Reported gains should be rechecked under the exact bit-width, model...

## Evidence

- [[papers/Kim-et-al-2024-SqueezeLLM-Dense-and-Sparse-Quantization|Kim et al. - 2024 - SqueezeLLM Dense-and-Sparse Quantization]]: Evidence takeaways: - SqueezeLLM evidence should separate dense non-uniform quantization gains from sparse-retention gains and runtime/memory claims. Claim candidates: - `claim-001`: With 3-bit LLaMA-7B, sensitivity-base...
- [[papers/Dettmers-et-al-2022-LLM-int8-8-bit-Matrix-Multiplication-for-Transformers-at-Scale|Dettmers et al. - 2022 - LLM.int8() 8-bit Matrix Multiplication for Transformers at Scale]]: Evidence takeaways: - LLM.int8 evidence should separate scale-quality claims from mixed-precision outlier handling and from kernel/runtime gains. Claim candidates: - `claim-001`: Additionally, we evaluate zeroshot accura...

## Open Questions

- Which linked papers provide the strongest source-grounded evidence for this method family?
