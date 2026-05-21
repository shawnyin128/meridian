---
type: "concept"
title: "Lookup-table inference"
status: "active"
created: "2026-05-21"
updated: "2026-05-21"
aliases:
  - "lookup-table inference"
  - "LUT inference"
  - "LUT-based inference"
  - "lookup table"
sources:
  - "papers/1909-13144v2.md"
  - "papers/2511-10645v1.md"
  - "papers/3549-Train-Freeze-or-Exit-Dyna.md"
  - "papers/Blumenberg-et-al-2025-Improving-Block-Wise-LLM-Quantization-by-4-bit-Block-Wise-Optimal-Float-BOF4-Analysis-and-Variati.md"
  - "papers/Chee-et-al-2024-QuIP-2-Bit-Quantization-of-Large-Language-Models-With-Guarantees.md"
  - "papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models.md"
  - "papers/DeepSeek-V4.md"
  - "papers/Dettmers-et-al-2022-8-bit-Optimizers-via-Block-wise-Quantization.md"
  - "papers/Dettmers-et-al-2023-QLoRA-Efficient-Finetuning-of-Quantized-LLMs.md"
  - "papers/Dong-et-al-2024-Self-Boosting-Large-Language-Models-with-Synthetic-Preference-Data.md"
  - "papers/ERNIE-Technical-Report.md"
  - "papers/Frantar-et-al-2023-GPTQ-Accurate-Post-Training-Quantization-for-Generative-Pre-trained-Transformers.md"
  - "papers/Gope-et-al-2024-Highly-Optimized-Kernels-and-Fine-Grained-Codebooks-for-LLM-Inference-on-Arm-CPUs.md"
  - "papers/Guo-2025-Fast-Matrix-Multiplications-for-Lookup-Table-Quantized-LLMs.md"
  - "papers/Kuroki-et-al-2025-Binary-Quadratic-Quantization-Beyond-First-Order-Quantization-for-Real-Valued-Matrix-Compression.md"
  - "papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression.md"
  - "papers/Li-et-al-2020-Additive-Powers-of-Two-Quantization-An-Efficient-Non-uniform-Discretization-for-Neural-Networks.md"
  - "papers/Li-et-al-2025-Gumiho-A-Hybrid-Architecture-to-Prioritize-Early-Tokens-in-Speculative-Decoding.md"
  - "papers/Li-et-al-2025-MBQ-Modality-Balanced-Quantization-for-Large-Vision-Language-Models.md"
  - "papers/Li-et-al-MoE-SVD-Structured-Mixture-of-Experts-LLMs-Compression-via-Singular-Value-Decomposition.md"
source_papers:
  - "papers/1909-13144v2.md"
  - "papers/2511-10645v1.md"
  - "papers/3549-Train-Freeze-or-Exit-Dyna.md"
  - "papers/Blumenberg-et-al-2025-Improving-Block-Wise-LLM-Quantization-by-4-bit-Block-Wise-Optimal-Float-BOF4-Analysis-and-Variati.md"
  - "papers/Chee-et-al-2024-QuIP-2-Bit-Quantization-of-Large-Language-Models-With-Guarantees.md"
  - "papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models.md"
  - "papers/DeepSeek-V4.md"
  - "papers/Dettmers-et-al-2022-8-bit-Optimizers-via-Block-wise-Quantization.md"
  - "papers/Dettmers-et-al-2023-QLoRA-Efficient-Finetuning-of-Quantized-LLMs.md"
  - "papers/Dong-et-al-2024-Self-Boosting-Large-Language-Models-with-Synthetic-Preference-Data.md"
  - "papers/ERNIE-Technical-Report.md"
  - "papers/Frantar-et-al-2023-GPTQ-Accurate-Post-Training-Quantization-for-Generative-Pre-trained-Transformers.md"
  - "papers/Gope-et-al-2024-Highly-Optimized-Kernels-and-Fine-Grained-Codebooks-for-LLM-Inference-on-Arm-CPUs.md"
  - "papers/Guo-2025-Fast-Matrix-Multiplications-for-Lookup-Table-Quantized-LLMs.md"
  - "papers/Kuroki-et-al-2025-Binary-Quadratic-Quantization-Beyond-First-Order-Quantization-for-Real-Valued-Matrix-Compression.md"
  - "papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression.md"
  - "papers/Li-et-al-2020-Additive-Powers-of-Two-Quantization-An-Efficient-Non-uniform-Discretization-for-Neural-Networks.md"
  - "papers/Li-et-al-2025-Gumiho-A-Hybrid-Architecture-to-Prioritize-Early-Tokens-in-Speculative-Decoding.md"
  - "papers/Li-et-al-2025-MBQ-Modality-Balanced-Quantization-for-Large-Vision-Language-Models.md"
  - "papers/Li-et-al-MoE-SVD-Structured-Mixture-of-Experts-LLMs-Compression-via-Singular-Value-Decomposition.md"
related_methods:
  - "hardware-aware quantization"
  - "non-uniform weight quantization"
  - "learned quantization intervals"
related_topics:
  - "lookup-table inference"
  - "hardware-aware quantization"
  - "low-bit quantization"
related_claims:
related_evidence:
prerequisite_for:
  - "hardware-aware quantization"
  - "non-uniform weight quantization"
  - "learned quantization intervals"
supports:
contradicts:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "concept-06c16ea2b2"
---
# Lookup-table inference

## What It Is

`Lookup-table inference` is a compiled preliminary-knowledge concept: a recurring mechanism or implementation background that appears across papers/methods and affects how a researcher understands, implements, debugs, or ablates the method family.

## Why It Matters

- A quantization method that depends on lookup tables must align quantizer design with memory layout, table access cost, and kernel support; otherwise accuracy gains can disappear at deployment.

## Where It Appears

- [[papers/1909-13144v2]]
- [[papers/2511-10645v1]]
- [[papers/3549-Train-Freeze-or-Exit-Dyna]]
- [[papers/Blumenberg-et-al-2025-Improving-Block-Wise-LLM-Quantization-by-4-bit-Block-Wise-Optimal-Float-BOF4-Analysis-and-Variati]]
- [[papers/Chee-et-al-2024-QuIP-2-Bit-Quantization-of-Large-Language-Models-With-Guarantees]]
- [[papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models]]
- [[papers/DeepSeek-V4]]
- [[papers/Dettmers-et-al-2022-8-bit-Optimizers-via-Block-wise-Quantization]]
- [[papers/Dettmers-et-al-2023-QLoRA-Efficient-Finetuning-of-Quantized-LLMs]]
- [[papers/Dong-et-al-2024-Self-Boosting-Large-Language-Models-with-Synthetic-Preference-Data]]
- [[papers/ERNIE-Technical-Report]]
- [[papers/Frantar-et-al-2023-GPTQ-Accurate-Post-Training-Quantization-for-Generative-Pre-trained-Transformers]]
- [[papers/Gope-et-al-2024-Highly-Optimized-Kernels-and-Fine-Grained-Codebooks-for-LLM-Inference-on-Arm-CPUs]]
- [[papers/Guo-2025-Fast-Matrix-Multiplications-for-Lookup-Table-Quantized-LLMs]]
- [[papers/Kuroki-et-al-2025-Binary-Quadratic-Quantization-Beyond-First-Order-Quantization-for-Real-Valued-Matrix-Compression]]
- [[papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression]]
- [[papers/Li-et-al-2020-Additive-Powers-of-Two-Quantization-An-Efficient-Non-uniform-Discretization-for-Neural-Networks]]
- [[papers/Li-et-al-2025-Gumiho-A-Hybrid-Architecture-to-Prioritize-Early-Tokens-in-Speculative-Decoding]]
- [[papers/Li-et-al-2025-MBQ-Modality-Balanced-Quantization-for-Large-Vision-Language-Models]]
- [[papers/Li-et-al-MoE-SVD-Structured-Mixture-of-Experts-LLMs-Compression-via-Singular-Value-Decomposition]]

## Used By Methods

- [[methods/hardware-aware-quantization|hardware-aware quantization]]
- [[methods/non-uniform-weight-quantization|non-uniform weight quantization]]
- [[methods/learned-quantization-intervals|learned quantization intervals]]

## Implementation Implications

- Count table reads, metadata movement, and packing layout alongside arithmetic savings.
- Keep the quantizer code path and inference kernel assumptions in the same experiment config.

## Common Failure Modes

- A paper-level method reduces arithmetic but increases memory indirection or table overhead.
- Offline quantization accuracy is measured on a representation that the kernel cannot serve efficiently.

## Minimal Checks / Probes

- Compare kernel-level latency and memory traffic against a uniform quantization baseline.
- Assert that table indices, group sizes, and packed tensor layouts match the deployment kernel.

## Evidence / Provenance

- [[papers/1909-13144v2|1909.13144v2]]: 1909 13144v2 1909 13144v2 low bit quantization non uniform quantization hardware aware quantization lookup table inference learned quantization intervals post training quantization calibration aware ptq non uniform weight quantization hardware aware quantizati...
- [[papers/2511-10645v1|2511.10645v1]]: 2511 10645v1 2511 10645v1 post training quantization low bit quantization quantization error rotation based quantization hardware aware quantization lookup table inference benchmark evaluation survey synthesis survey synthesis post training quantization outlie...
- [[papers/3549-Train-Freeze-or-Exit-Dyna|3549_Train_Freeze_or_Exit_Dyna]]: 3549 train freeze or exit dyna 3549 train freeze or exit dyna low bit quantization hardware aware quantization lookup table inference self speculative decoding transformer architecture performance evaluation parameter efficient adaptation transformer architect...
- [[papers/Blumenberg-et-al-2025-Improving-Block-Wise-LLM-Quantization-by-4-bit-Block-Wise-Optimal-Float-BOF4-Analysis-and-Variati|Blumenberg et al. - 2025 - Improving Block-Wise LLM Quantization by 4-bit Block-Wise Optimal Float (BOF4) Analysis and Variati]]: blumenberg et al 2025 improving block wise llm quantization by 4 bit block wise optimal float bof4 analysis and variati block wise bof4 blumenberg et al 2025 improving block wise llm quantization by 4 bit block wise optimal float bof4 analysis and variati low...
- [[papers/Chee-et-al-2024-QuIP-2-Bit-Quantization-of-Large-Language-Models-With-Guarantees|Chee et al. - 2024 - QuIP 2-Bit Quantization of Large Language Models With Guarantees]]: chee et al 2024 quip 2 bit quantization of large language models with guarantees quip lut lut based system implementation post training quantization low bit quantization non uniform quantization hardware aware quantization lookup table inference performance ev...
- [[papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models|Chen et al. - 2025 - EfficientQAT Efficient Quantization-Aware Training for Large Language Models]]: chen et al 2025 efficientqat efficient quantization aware training for large language models efficientqat chen et al 2025 efficientqat efficient quantization aware training for large language models post training quantization low bit quantization calibration d...
- [[papers/DeepSeek-V4|DeepSeek_V4]]: deepseek v4 deepseek v4 moe quantization hardware aware quantization lookup table inference long context inference sparse attention kv cache compression human preference feedback reward modeling policy optimization context extrapolation long context inference...
- [[papers/Dettmers-et-al-2022-8-bit-Optimizers-via-Block-wise-Quantization|Dettmers et al. - 2022 - 8-bit Optimizers via Block-wise Quantization]]: dettmers et al 2022 8 bit optimizers via block wise quantization dettmers et al 2022 8 bit optimizers via block wise quantization low bit quantization non uniform quantization hardware aware quantization lookup table inference post training quantization outlie...

## Related Concepts

- [[concepts/Per-channel-scaling|Per-channel scaling]]
- [[concepts/Quantization-error-propagation|Quantization error propagation]]

## Open Questions

- Which linked papers provide the strongest source-grounded evidence for this concept?
- Which methods fail when this concept is ignored?

## Retrieval Hooks

- Use for hardware-aware quantization, LUT kernels, and non-uniform quantizer implementation checks.
