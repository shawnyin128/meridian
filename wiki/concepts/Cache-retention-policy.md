---
type: "concept"
title: "Cache retention policy"
status: "active"
created: "2026-05-21"
updated: "2026-05-21"
aliases:
  - "retention policy"
  - "cache retention"
  - "KV-cache compression"
  - "token eviction"
sources:
  - "papers/13979-STAR-Speculative-Decodin.md"
  - "papers/1909-13144v2.md"
  - "papers/27323-KVCapsule-Efficient-Temp.md"
  - "papers/3549-Train-Freeze-or-Exit-Dyna.md"
  - "papers/Adnan-et-al-2024-Keyformer-KV-Cache-Reduction-through-Key-Tokens-Selection-for-Efficient-Generative-Inference.md"
  - "papers/Bouda-et-al-2016-Box-Counting-Dimension-Revisited-Presenting-an-Efficient-Method-of-Minimizing-Quantization-Error-an.md"
  - "papers/Cai-et-al-2025-PyramidKV-Dynamic-KV-Cache-Compression-based-on-Pyramidal-Information-Funneling.md"
  - "papers/Computer-Architecture-A-Quantitative-Approach-5th-edition.md"
  - "papers/Dai-2024-DeepSeekMoE-Towards-Ultimate-Expert-Specialization-in-Mixture-of-Experts-Language-Models.md"
  - "papers/DeepSeek-AI-2024-DeepSeek-V2-A-Strong-Economical-and-Efficient-Mixture-of-Experts-Language-Model.md"
  - "papers/DeepSeek-V4.md"
  - "papers/Dehghani-et-al-2019-Universal-Transformers.md"
  - "papers/ERNIE-Technical-Report.md"
  - "papers/Elhoushi-et-al-2024-LayerSkip-Enabling-Early-Exit-Inference-and-Self-Speculative-Decoding.md"
  - "papers/Frantar-et-al-2023-GPTQ-Accurate-Post-Training-Quantization-for-Generative-Pre-trained-Transformers.md"
  - "papers/GLM-5-Team-2026-GLM-5-from-Vibe-Coding-to-Agentic-Engineering.md"
  - "papers/Ge-et-al-2024-Model-Tells-You-What-to-Discard-Adaptive-KV-Cache-Compression-for-LLMs.md"
  - "papers/Gu-and-Dao-2024-Mamba-Linear-Time-Sequence-Modeling-with-Selective-State-Spaces.md"
  - "papers/Hu-et-al-2025-DREAM-Drafting-with-Refined-Target-Features-and-Entropy-Adaptive-Cross-Attention-Fusion-for-Multimo.md"
  - "papers/Hu-et-al-2025-Speculative-Decoding-and-Beyond-An-In-Depth-Survey-of-Techniques.md"
source_papers:
  - "papers/13979-STAR-Speculative-Decodin.md"
  - "papers/1909-13144v2.md"
  - "papers/27323-KVCapsule-Efficient-Temp.md"
  - "papers/3549-Train-Freeze-or-Exit-Dyna.md"
  - "papers/Adnan-et-al-2024-Keyformer-KV-Cache-Reduction-through-Key-Tokens-Selection-for-Efficient-Generative-Inference.md"
  - "papers/Bouda-et-al-2016-Box-Counting-Dimension-Revisited-Presenting-an-Efficient-Method-of-Minimizing-Quantization-Error-an.md"
  - "papers/Cai-et-al-2025-PyramidKV-Dynamic-KV-Cache-Compression-based-on-Pyramidal-Information-Funneling.md"
  - "papers/Computer-Architecture-A-Quantitative-Approach-5th-edition.md"
  - "papers/Dai-2024-DeepSeekMoE-Towards-Ultimate-Expert-Specialization-in-Mixture-of-Experts-Language-Models.md"
  - "papers/DeepSeek-AI-2024-DeepSeek-V2-A-Strong-Economical-and-Efficient-Mixture-of-Experts-Language-Model.md"
  - "papers/DeepSeek-V4.md"
  - "papers/Dehghani-et-al-2019-Universal-Transformers.md"
  - "papers/ERNIE-Technical-Report.md"
  - "papers/Elhoushi-et-al-2024-LayerSkip-Enabling-Early-Exit-Inference-and-Self-Speculative-Decoding.md"
  - "papers/Frantar-et-al-2023-GPTQ-Accurate-Post-Training-Quantization-for-Generative-Pre-trained-Transformers.md"
  - "papers/GLM-5-Team-2026-GLM-5-from-Vibe-Coding-to-Agentic-Engineering.md"
  - "papers/Ge-et-al-2024-Model-Tells-You-What-to-Discard-Adaptive-KV-Cache-Compression-for-LLMs.md"
  - "papers/Gu-and-Dao-2024-Mamba-Linear-Time-Sequence-Modeling-with-Selective-State-Spaces.md"
  - "papers/Hu-et-al-2025-DREAM-Drafting-with-Refined-Target-Features-and-Entropy-Adaptive-Cross-Attention-Fusion-for-Multimo.md"
  - "papers/Hu-et-al-2025-Speculative-Decoding-and-Beyond-An-In-Depth-Survey-of-Techniques.md"
related_methods:
  - "KV-cache compression"
  - "long-context attention"
  - "sparse attention"
related_topics:
  - "KV-cache compression"
  - "long-context inference"
  - "sparse attention"
related_claims:
related_evidence:
prerequisite_for:
  - "KV-cache compression"
  - "long-context attention"
  - "sparse attention"
supports:
contradicts:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "concept-10587f69b8"
---
# Cache retention policy

## What It Is

`Cache retention policy` is a compiled preliminary-knowledge concept: a recurring mechanism or implementation background that appears across papers/methods and affects how a researcher understands, implements, debugs, or ablates the method family.

## Why It Matters

- Cache compression is a policy problem as much as a size problem: deciding which tokens or heads to retain determines whether the model preserves task-relevant context.

## Where It Appears

- [[papers/13979-STAR-Speculative-Decodin]]
- [[papers/1909-13144v2]]
- [[papers/27323-KVCapsule-Efficient-Temp]]
- [[papers/3549-Train-Freeze-or-Exit-Dyna]]
- [[papers/Adnan-et-al-2024-Keyformer-KV-Cache-Reduction-through-Key-Tokens-Selection-for-Efficient-Generative-Inference]]
- [[papers/Bouda-et-al-2016-Box-Counting-Dimension-Revisited-Presenting-an-Efficient-Method-of-Minimizing-Quantization-Error-an]]
- [[papers/Cai-et-al-2025-PyramidKV-Dynamic-KV-Cache-Compression-based-on-Pyramidal-Information-Funneling]]
- [[papers/Computer-Architecture-A-Quantitative-Approach-5th-edition]]
- [[papers/Dai-2024-DeepSeekMoE-Towards-Ultimate-Expert-Specialization-in-Mixture-of-Experts-Language-Models]]
- [[papers/DeepSeek-AI-2024-DeepSeek-V2-A-Strong-Economical-and-Efficient-Mixture-of-Experts-Language-Model]]
- [[papers/DeepSeek-V4]]
- [[papers/Dehghani-et-al-2019-Universal-Transformers]]
- [[papers/ERNIE-Technical-Report]]
- [[papers/Elhoushi-et-al-2024-LayerSkip-Enabling-Early-Exit-Inference-and-Self-Speculative-Decoding]]
- [[papers/Frantar-et-al-2023-GPTQ-Accurate-Post-Training-Quantization-for-Generative-Pre-trained-Transformers]]
- [[papers/GLM-5-Team-2026-GLM-5-from-Vibe-Coding-to-Agentic-Engineering]]
- [[papers/Ge-et-al-2024-Model-Tells-You-What-to-Discard-Adaptive-KV-Cache-Compression-for-LLMs]]
- [[papers/Gu-and-Dao-2024-Mamba-Linear-Time-Sequence-Modeling-with-Selective-State-Spaces]]
- [[papers/Hu-et-al-2025-DREAM-Drafting-with-Refined-Target-Features-and-Entropy-Adaptive-Cross-Attention-Fusion-for-Multimo]]
- [[papers/Hu-et-al-2025-Speculative-Decoding-and-Beyond-An-In-Depth-Survey-of-Techniques]]

## Used By Methods

- [[methods/KV-cache-compression|KV-cache compression]]
- [[methods/long-context-attention|long-context attention]]
- [[methods/sparse-attention|sparse attention]]

## Implementation Implications

- Log retained-token identities and attention mass rather than only retained counts.
- Compare policy quality separately from the kernel or storage format.

## Common Failure Modes

- A policy keeps recent tokens but drops rare long-range evidence.
- Compression ratios look good while downstream answers fail on dependency-heavy prompts.

## Minimal Checks / Probes

- Run recency-only, attention-score, and oracle retention baselines on the same prompts.
- Inspect failure cases by dependency distance and retained-token category.

## Evidence / Provenance

- [[papers/13979-STAR-Speculative-Decodin|13979_STAR_Speculative_Decodin]]: 13979 star speculative decodin 13979 star speculative decodin speculative decoding kv cache compression transformer architecture draft acceptance context extrapolation speculative decoding kv cache compression transformer architecture speculative decoding sett...
- [[papers/1909-13144v2|1909.13144v2]]: 1909 13144v2 1909 13144v2 low bit quantization non uniform quantization hardware aware quantization lookup table inference learned quantization intervals post training quantization calibration aware ptq non uniform weight quantization hardware aware quantizati...
- [[papers/27323-KVCapsule-Efficient-Temp|27323_KVCapsule_Efficient_Temp]]: 27323 kvcapsule efficient temp 27323 kvcapsule efficient temp calibration data selection long context inference kv cache compression low rank adaptation visual reasoning transformer architecture performance evaluation parameter efficient adaptation context ext...
- [[papers/3549-Train-Freeze-or-Exit-Dyna|3549_Train_Freeze_or_Exit_Dyna]]: 3549 train freeze or exit dyna 3549 train freeze or exit dyna low bit quantization hardware aware quantization lookup table inference self speculative decoding transformer architecture performance evaluation parameter efficient adaptation transformer architect...
- [[papers/Adnan-et-al-2024-Keyformer-KV-Cache-Reduction-through-Key-Tokens-Selection-for-Efficient-Generative-Inference|Adnan et al. - 2024 - Keyformer KV Cache Reduction through Key Tokens Selection for Efficient Generative Inference]]: adnan et al 2024 keyformer kv cache reduction through key tokens selection for efficient generative inference adnan et al 2024 keyformer kv cache reduction through key tokens selection for efficient generative inference long context inference kv cache compress...
- [[papers/Bouda-et-al-2016-Box-Counting-Dimension-Revisited-Presenting-an-Efficient-Method-of-Minimizing-Quantization-Error-an|Bouda et al. - 2016 - Box-Counting Dimension Revisited Presenting an Efficient Method of Minimizing Quantization Error an]]: bouda et al 2016 box counting dimension revisited presenting an efficient method of minimizing quantization error an box counting bouda et al 2016 box counting dimension revisited presenting an efficient method of minimizing quantization error an low bit quant...
- [[papers/Cai-et-al-2025-PyramidKV-Dynamic-KV-Cache-Compression-based-on-Pyramidal-Information-Funneling|Cai et al. - 2025 - PyramidKV Dynamic KV Cache Compression based on Pyramidal Information Funneling]]: cai et al 2025 pyramidkv dynamic kv cache compression based on pyramidal information funneling pyramidkv cai et al 2025 pyramidkv dynamic kv cache compression based on pyramidal information funneling long context inference kv cache compression transformer arch...
- [[papers/Computer-Architecture-A-Quantitative-Approach-5th-edition|Computer Architecture A Quantitative Approach (5th edition)]]: computer architecture a quantitative approach 5th edition computer architecture a quantitative approach 5th edition computer architecture performance evaluation hardware systems reference synthesis performance evaluation long form reference setting computer ar...

## Related Concepts

- [[concepts/KV-cache-memory-bandwidth|KV-cache memory bandwidth]]
- [[concepts/Attention-sink|Attention sink]]

## Open Questions

- Which linked papers provide the strongest source-grounded evidence for this concept?
- Which methods fail when this concept is ignored?

## Retrieval Hooks

- Use for KV-cache retention, token eviction, sparse attention, and long-context failure analysis.
