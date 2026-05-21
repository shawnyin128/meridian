---
type: "concept"
title: "Quantization error propagation"
status: "active"
created: "2026-05-21"
updated: "2026-05-21"
aliases:
  - "error propagation"
  - "quantization error"
  - "PTQ error"
sources:
  - "papers/1808-05779v3.md"
  - "papers/1909-13144v2.md"
  - "papers/2511-10645v1.md"
  - "papers/3549-Train-Freeze-or-Exit-Dyna.md"
  - "papers/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization.md"
  - "papers/Ashkboos-et-al-2024-QuaRot-Outlier-Free-4-Bit-Inference-in-Rotated-LLMs.md"
  - "papers/Bhalgat-et-al-2020-LSQ-Improving-low-bit-quantization-through-learnable-offsets-and-better-initialization.md"
  - "papers/Blumenberg-et-al-2025-Improving-Block-Wise-LLM-Quantization-by-4-bit-Block-Wise-Optimal-Float-BOF4-Analysis-and-Variati.md"
  - "papers/Bouda-et-al-2016-Box-Counting-Dimension-Revisited-Presenting-an-Efficient-Method-of-Minimizing-Quantization-Error-an.md"
  - "papers/Cai-et-al-2024-Medusa-Simple-LLM-Inference-Acceleration-Framework-with-Multiple-Decoding-Heads.md"
  - "papers/Chee-et-al-2024-QuIP-2-Bit-Quantization-of-Large-Language-Models-With-Guarantees.md"
  - "papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models.md"
  - "papers/Dai-2024-DeepSeekMoE-Towards-Ultimate-Expert-Specialization-in-Mixture-of-Experts-Language-Models.md"
  - "papers/DeepSeek-AI-2025-DeepSeek-V3-Technical-Report.md"
  - "papers/DeepSeek-V4.md"
  - "papers/Dettmers-et-al-2022-8-bit-Optimizers-via-Block-wise-Quantization.md"
  - "papers/Dettmers-et-al-2022-LLM-int8-8-bit-Matrix-Multiplication-for-Transformers-at-Scale.md"
  - "papers/Dettmers-et-al-2023-QLoRA-Efficient-Finetuning-of-Quantized-LLMs.md"
  - "papers/ERNIE-Technical-Report.md"
  - "papers/Frantar-et-al-2023-GPTQ-Accurate-Post-Training-Quantization-for-Generative-Pre-trained-Transformers.md"
source_papers:
  - "papers/1808-05779v3.md"
  - "papers/1909-13144v2.md"
  - "papers/2511-10645v1.md"
  - "papers/3549-Train-Freeze-or-Exit-Dyna.md"
  - "papers/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization.md"
  - "papers/Ashkboos-et-al-2024-QuaRot-Outlier-Free-4-Bit-Inference-in-Rotated-LLMs.md"
  - "papers/Bhalgat-et-al-2020-LSQ-Improving-low-bit-quantization-through-learnable-offsets-and-better-initialization.md"
  - "papers/Blumenberg-et-al-2025-Improving-Block-Wise-LLM-Quantization-by-4-bit-Block-Wise-Optimal-Float-BOF4-Analysis-and-Variati.md"
  - "papers/Bouda-et-al-2016-Box-Counting-Dimension-Revisited-Presenting-an-Efficient-Method-of-Minimizing-Quantization-Error-an.md"
  - "papers/Cai-et-al-2024-Medusa-Simple-LLM-Inference-Acceleration-Framework-with-Multiple-Decoding-Heads.md"
  - "papers/Chee-et-al-2024-QuIP-2-Bit-Quantization-of-Large-Language-Models-With-Guarantees.md"
  - "papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models.md"
  - "papers/Dai-2024-DeepSeekMoE-Towards-Ultimate-Expert-Specialization-in-Mixture-of-Experts-Language-Models.md"
  - "papers/DeepSeek-AI-2025-DeepSeek-V3-Technical-Report.md"
  - "papers/DeepSeek-V4.md"
  - "papers/Dettmers-et-al-2022-8-bit-Optimizers-via-Block-wise-Quantization.md"
  - "papers/Dettmers-et-al-2022-LLM-int8-8-bit-Matrix-Multiplication-for-Transformers-at-Scale.md"
  - "papers/Dettmers-et-al-2023-QLoRA-Efficient-Finetuning-of-Quantized-LLMs.md"
  - "papers/ERNIE-Technical-Report.md"
  - "papers/Frantar-et-al-2023-GPTQ-Accurate-Post-Training-Quantization-for-Generative-Pre-trained-Transformers.md"
related_methods:
  - "post-training quantization"
  - "layer-wise PTQ"
  - "reconstruction-based quantization"
related_topics:
  - "quantization"
related_claims:
related_evidence:
prerequisite_for:
  - "post-training quantization"
  - "layer-wise PTQ"
  - "reconstruction-based quantization"
supports:
contradicts:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "concept-65b86ccef7"
---
# Quantization error propagation

## What It Is

`Quantization error propagation` is a compiled preliminary-knowledge concept: a recurring mechanism or implementation background that appears across papers/methods and affects how a researcher understands, implements, debugs, or ablates the method family.

## Why It Matters

- Quantization error is not only a local reconstruction problem; upstream activation or weight error can change downstream inputs, routing, and evaluation behavior.

## Where It Appears

- [[papers/1808-05779v3]]
- [[papers/1909-13144v2]]
- [[papers/2511-10645v1]]
- [[papers/3549-Train-Freeze-or-Exit-Dyna]]
- [[papers/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization]]
- [[papers/Ashkboos-et-al-2024-QuaRot-Outlier-Free-4-Bit-Inference-in-Rotated-LLMs]]
- [[papers/Bhalgat-et-al-2020-LSQ-Improving-low-bit-quantization-through-learnable-offsets-and-better-initialization]]
- [[papers/Blumenberg-et-al-2025-Improving-Block-Wise-LLM-Quantization-by-4-bit-Block-Wise-Optimal-Float-BOF4-Analysis-and-Variati]]
- [[papers/Bouda-et-al-2016-Box-Counting-Dimension-Revisited-Presenting-an-Efficient-Method-of-Minimizing-Quantization-Error-an]]
- [[papers/Cai-et-al-2024-Medusa-Simple-LLM-Inference-Acceleration-Framework-with-Multiple-Decoding-Heads]]
- [[papers/Chee-et-al-2024-QuIP-2-Bit-Quantization-of-Large-Language-Models-With-Guarantees]]
- [[papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models]]
- [[papers/Dai-2024-DeepSeekMoE-Towards-Ultimate-Expert-Specialization-in-Mixture-of-Experts-Language-Models]]
- [[papers/DeepSeek-AI-2025-DeepSeek-V3-Technical-Report]]
- [[papers/DeepSeek-V4]]
- [[papers/Dettmers-et-al-2022-8-bit-Optimizers-via-Block-wise-Quantization]]
- [[papers/Dettmers-et-al-2022-LLM-int8-8-bit-Matrix-Multiplication-for-Transformers-at-Scale]]
- [[papers/Dettmers-et-al-2023-QLoRA-Efficient-Finetuning-of-Quantized-LLMs]]
- [[papers/ERNIE-Technical-Report]]
- [[papers/Frantar-et-al-2023-GPTQ-Accurate-Post-Training-Quantization-for-Generative-Pre-trained-Transformers]]

## Used By Methods

- [[methods/post-training-quantization|post-training quantization]]
- [[methods/layer-wise-PTQ|layer-wise PTQ]]
- [[methods/reconstruction-based-quantization|reconstruction-based quantization]]

## Implementation Implications

- Measure local reconstruction error and downstream metric change separately.
- When a layer looks harmless locally, probe whether later layers amplify the perturbation.

## Common Failure Modes

- Optimizing one layer independently masks accumulated error.
- Metrics degrade only after a later nonlinear or routing operation.

## Minimal Checks / Probes

- Run layer-drop or layer-only quantization sweeps.
- Compare error before and after normalization, routing, or attention blocks.

## Evidence / Provenance

- [[papers/1808-05779v3|1808.05779v3]]: 1808 05779v3 qil quantization interval learning low bit quantization quantization error learned quantization intervals transformer architecture quantization aware training learned quantization intervals quantization aware training setting weight activation qua...
- [[papers/1909-13144v2|1909.13144v2]]: 1909 13144v2 1909 13144v2 low bit quantization non uniform quantization hardware aware quantization lookup table inference learned quantization intervals post training quantization calibration aware ptq non uniform weight quantization hardware aware quantizati...
- [[papers/2511-10645v1|2511.10645v1]]: 2511 10645v1 2511 10645v1 post training quantization low bit quantization quantization error rotation based quantization hardware aware quantization lookup table inference benchmark evaluation survey synthesis survey synthesis post training quantization outlie...
- [[papers/3549-Train-Freeze-or-Exit-Dyna|3549_Train_Freeze_or_Exit_Dyna]]: 3549 train freeze or exit dyna 3549 train freeze or exit dyna low bit quantization hardware aware quantization lookup table inference self speculative decoding transformer architecture performance evaluation parameter efficient adaptation transformer architect...
- [[papers/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization|Arai and Ichikawa - 2025 - Quantization Error Propagation Revisiting Layer-Wise Post-Training Quantization]]: arai and ichikawa 2025 quantization error propagation revisiting layer wise post training quantization layer wise qep quantization error propagation post training quantization layer wise ptq low bit quantization quantization error error propagation post traini...
- [[papers/Ashkboos-et-al-2024-QuaRot-Outlier-Free-4-Bit-Inference-in-Rotated-LLMs|Ashkboos et al. - 2024 - QuaRot Outlier-Free 4-Bit Inference in Rotated LLMs]]: ashkboos et al 2024 quarot outlier free 4 bit inference in rotated llms quarot randomized hadamard rotation for end to end int4 inference low bit quantization calibration data selection equivalent transformation rotation based quantization hardware aware quant...
- [[papers/Bhalgat-et-al-2020-LSQ-Improving-low-bit-quantization-through-learnable-offsets-and-better-initialization|Bhalgat et al. - 2020 - LSQ+ Improving low-bit quantization through learnable offsets and better initialization]]: bhalgat et al 2020 lsq improving low bit quantization through learnable offsets and better initialization lsq lsq learned step size with offset quantization low bit quantization learned quantizer scale quantization aware training learned step size quantization...
- [[papers/Blumenberg-et-al-2025-Improving-Block-Wise-LLM-Quantization-by-4-bit-Block-Wise-Optimal-Float-BOF4-Analysis-and-Variati|Blumenberg et al. - 2025 - Improving Block-Wise LLM Quantization by 4-bit Block-Wise Optimal Float (BOF4) Analysis and Variati]]: blumenberg et al 2025 improving block wise llm quantization by 4 bit block wise optimal float bof4 analysis and variati block wise bof4 blumenberg et al 2025 improving block wise llm quantization by 4 bit block wise optimal float bof4 analysis and variati low...

## Related Concepts

- [[concepts/Activation-outliers|Activation outliers]]
- [[concepts/Hessian-aware-reconstruction|Hessian-aware reconstruction]]

## Open Questions

- Which linked papers provide the strongest source-grounded evidence for this concept?
- Which methods fail when this concept is ignored?

## Retrieval Hooks

- Use for ablation planning around PTQ, QAT, smoothing, reconstruction, and error attribution.
