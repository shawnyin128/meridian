---
type: "concept"
title: "Speculative decoding acceptance rate"
status: "active"
created: "2026-05-21"
updated: "2026-05-21"
aliases:
  - "acceptance rate"
  - "accepted tokens"
  - "speculative acceptance"
sources:
  - "papers/13979-STAR-Speculative-Decodin.md"
  - "papers/Cai-et-al-2024-Medusa-Simple-LLM-Inference-Acceleration-Framework-with-Multiple-Decoding-Heads.md"
  - "papers/DeepSeek-AI-2025-DeepSeek-V3-Technical-Report.md"
  - "papers/ERNIE-Technical-Report.md"
  - "papers/Elhoushi-et-al-2024-LayerSkip-Enabling-Early-Exit-Inference-and-Self-Speculative-Decoding.md"
  - "papers/Fu-et-al-2024-Break-the-Sequential-Dependency-of-LLM-Inference-Using-Lookahead-Decoding.md"
  - "papers/GLM-5-Team-2026-GLM-5-from-Vibe-Coding-to-Agentic-Engineering.md"
  - "papers/GQA-Training-Generalized-Multi-Query-Transformer-Models-from-Multi-Head-Checkpoints.md"
  - "papers/Guan-et-al-2025-Dynamic-Speculative-Agent-Planning.md"
  - "papers/Hu-et-al-2025-DREAM-Drafting-with-Refined-Target-Features-and-Entropy-Adaptive-Cross-Attention-Fusion-for-Multimo.md"
  - "papers/Hu-et-al-2025-Speculative-Decoding-and-Beyond-An-In-Depth-Survey-of-Techniques.md"
  - "papers/Hu-et-al-2026-Bridging-Draft-Policy-Misalignment-Group-Tree-Optimization-for-Speculative-Decoding.md"
  - "papers/Li-et-al-2024-EAGLE-2-Faster-Inference-of-Language-Models-with-Dynamic-Draft-Trees.md"
  - "papers/Li-et-al-2025-EAGLE-3-Scaling-up-Inference-Acceleration-of-Large-Language-Models-via-Training-Time-Test.md"
  - "papers/Li-et-al-2025-EAGLE-Speculative-Sampling-Requires-Rethinking-Feature-Uncertainty.md"
  - "papers/Li-et-al-2025-Gumiho-A-Hybrid-Architecture-to-Prioritize-Early-Tokens-in-Speculative-Decoding.md"
  - "papers/Liu-et-al-2024-Kangaroo-Lossless-Self-Speculative-Decoding-via-Double-Early-Exiting.md"
  - "papers/Liu-et-al-2025-PEARL-Parallel-Speculative-Decoding-with-Adaptive-Draft-Length.md"
  - "papers/Lu-et-al-2022-A-continental-scale-analysis-reveals-widespread-root-bimodality.md"
  - "papers/Miao-et-al-2024-SpecInfer-Accelerating-Generative-Large-Language-Model-Serving-with-Tree-based-Speculative-Inferenc.md"
source_papers:
  - "papers/13979-STAR-Speculative-Decodin.md"
  - "papers/Cai-et-al-2024-Medusa-Simple-LLM-Inference-Acceleration-Framework-with-Multiple-Decoding-Heads.md"
  - "papers/DeepSeek-AI-2025-DeepSeek-V3-Technical-Report.md"
  - "papers/ERNIE-Technical-Report.md"
  - "papers/Elhoushi-et-al-2024-LayerSkip-Enabling-Early-Exit-Inference-and-Self-Speculative-Decoding.md"
  - "papers/Fu-et-al-2024-Break-the-Sequential-Dependency-of-LLM-Inference-Using-Lookahead-Decoding.md"
  - "papers/GLM-5-Team-2026-GLM-5-from-Vibe-Coding-to-Agentic-Engineering.md"
  - "papers/GQA-Training-Generalized-Multi-Query-Transformer-Models-from-Multi-Head-Checkpoints.md"
  - "papers/Guan-et-al-2025-Dynamic-Speculative-Agent-Planning.md"
  - "papers/Hu-et-al-2025-DREAM-Drafting-with-Refined-Target-Features-and-Entropy-Adaptive-Cross-Attention-Fusion-for-Multimo.md"
  - "papers/Hu-et-al-2025-Speculative-Decoding-and-Beyond-An-In-Depth-Survey-of-Techniques.md"
  - "papers/Hu-et-al-2026-Bridging-Draft-Policy-Misalignment-Group-Tree-Optimization-for-Speculative-Decoding.md"
  - "papers/Li-et-al-2024-EAGLE-2-Faster-Inference-of-Language-Models-with-Dynamic-Draft-Trees.md"
  - "papers/Li-et-al-2025-EAGLE-3-Scaling-up-Inference-Acceleration-of-Large-Language-Models-via-Training-Time-Test.md"
  - "papers/Li-et-al-2025-EAGLE-Speculative-Sampling-Requires-Rethinking-Feature-Uncertainty.md"
  - "papers/Li-et-al-2025-Gumiho-A-Hybrid-Architecture-to-Prioritize-Early-Tokens-in-Speculative-Decoding.md"
  - "papers/Liu-et-al-2024-Kangaroo-Lossless-Self-Speculative-Decoding-via-Double-Early-Exiting.md"
  - "papers/Liu-et-al-2025-PEARL-Parallel-Speculative-Decoding-with-Adaptive-Draft-Length.md"
  - "papers/Lu-et-al-2022-A-continental-scale-analysis-reveals-widespread-root-bimodality.md"
  - "papers/Miao-et-al-2024-SpecInfer-Accelerating-Generative-Large-Language-Model-Serving-with-Tree-based-Speculative-Inferenc.md"
related_methods:
  - "speculative decoding"
  - "draft-model decoding"
  - "verification decoding"
related_topics:
  - "long-context attention"
  - "systems ML"
related_claims:
related_evidence:
prerequisite_for:
  - "speculative decoding"
  - "draft-model decoding"
  - "verification decoding"
supports:
contradicts:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "concept-5d7831aea2"
---
# Speculative decoding acceptance rate

## What It Is

`Speculative decoding acceptance rate` is a compiled preliminary-knowledge concept: a recurring mechanism or implementation background that appears across papers/methods and affects how a researcher understands, implements, debugs, or ablates the method family.

## Why It Matters

- Speculative decoding speed depends on how many draft tokens survive target-model verification, not just draft model throughput.

## Where It Appears

- [[papers/13979-STAR-Speculative-Decodin]]
- [[papers/Cai-et-al-2024-Medusa-Simple-LLM-Inference-Acceleration-Framework-with-Multiple-Decoding-Heads]]
- [[papers/DeepSeek-AI-2025-DeepSeek-V3-Technical-Report]]
- [[papers/ERNIE-Technical-Report]]
- [[papers/Elhoushi-et-al-2024-LayerSkip-Enabling-Early-Exit-Inference-and-Self-Speculative-Decoding]]
- [[papers/Fu-et-al-2024-Break-the-Sequential-Dependency-of-LLM-Inference-Using-Lookahead-Decoding]]
- [[papers/GLM-5-Team-2026-GLM-5-from-Vibe-Coding-to-Agentic-Engineering]]
- [[papers/GQA-Training-Generalized-Multi-Query-Transformer-Models-from-Multi-Head-Checkpoints]]
- [[papers/Guan-et-al-2025-Dynamic-Speculative-Agent-Planning]]
- [[papers/Hu-et-al-2025-DREAM-Drafting-with-Refined-Target-Features-and-Entropy-Adaptive-Cross-Attention-Fusion-for-Multimo]]
- [[papers/Hu-et-al-2025-Speculative-Decoding-and-Beyond-An-In-Depth-Survey-of-Techniques]]
- [[papers/Hu-et-al-2026-Bridging-Draft-Policy-Misalignment-Group-Tree-Optimization-for-Speculative-Decoding]]
- [[papers/Li-et-al-2024-EAGLE-2-Faster-Inference-of-Language-Models-with-Dynamic-Draft-Trees]]
- [[papers/Li-et-al-2025-EAGLE-3-Scaling-up-Inference-Acceleration-of-Large-Language-Models-via-Training-Time-Test]]
- [[papers/Li-et-al-2025-EAGLE-Speculative-Sampling-Requires-Rethinking-Feature-Uncertainty]]
- [[papers/Li-et-al-2025-Gumiho-A-Hybrid-Architecture-to-Prioritize-Early-Tokens-in-Speculative-Decoding]]
- [[papers/Liu-et-al-2024-Kangaroo-Lossless-Self-Speculative-Decoding-via-Double-Early-Exiting]]
- [[papers/Liu-et-al-2025-PEARL-Parallel-Speculative-Decoding-with-Adaptive-Draft-Length]]
- [[papers/Lu-et-al-2022-A-continental-scale-analysis-reveals-widespread-root-bimodality]]
- [[papers/Miao-et-al-2024-SpecInfer-Accelerating-Generative-Large-Language-Model-Serving-with-Tree-based-Speculative-Inferenc]]

## Used By Methods

- [[methods/speculative-decoding|speculative decoding]]
- [[methods/draft-model-decoding|draft-model decoding]]
- [[methods/verification-decoding|verification decoding]]

## Implementation Implications

- Log acceptance length distributions, not only average speedup.
- Tie acceptance statistics to target model, prompt domain, and draft batch schedule.

## Common Failure Modes

- A faster draft model reduces acceptance enough to lose end-to-end speedup.
- Acceptance metrics are computed before rejection handling or EOS corner cases.

## Minimal Checks / Probes

- Compare accepted tokens per target forward pass across domains.
- Validate that output distribution matches the target model under the verification rule.

## Evidence / Provenance

- [[papers/13979-STAR-Speculative-Decodin|13979_STAR_Speculative_Decodin]]: 13979 star speculative decodin 13979 star speculative decodin speculative decoding kv cache compression transformer architecture draft acceptance context extrapolation speculative decoding kv cache compression transformer architecture speculative decoding sett...
- [[papers/Cai-et-al-2024-Medusa-Simple-LLM-Inference-Acceleration-Framework-with-Multiple-Decoding-Heads|Cai et al. - 2024 - Medusa Simple LLM Inference Acceleration Framework with Multiple Decoding Heads]]: cai et al 2024 medusa simple llm inference acceleration framework with multiple decoding heads cai et al 2024 medusa simple llm inference acceleration framework with multiple decoding heads speculative decoding dynamic draft tree human preference feedback rewa...
- [[papers/DeepSeek-AI-2025-DeepSeek-V3-Technical-Report|DeepSeek-AI 等 - 2025 - DeepSeek-V3 Technical Report]]: deepseek ai 2025 deepseek v3 technical report deepseek ai deepseek v3 deepseek ai 2025 deepseek v3 technical report benchmark evaluation speculative decoding speculative action execution long context inference human preference feedback reward modeling policy o...
- [[papers/ERNIE-Technical-Report|ERNIE_Technical_Report]]: ernie technical report ernie technical report moe quantization expert routing hardware aware quantization lookup table inference speculative decoding long context inference kv cache compression vision language quantization transformer architecture parameter ef...
- [[papers/Elhoushi-et-al-2024-LayerSkip-Enabling-Early-Exit-Inference-and-Self-Speculative-Decoding|Elhoushi et al. - 2024 - LayerSkip Enabling Early Exit Inference and Self-Speculative Decoding]]: elhoushi et al 2024 layerskip enabling early exit inference and self speculative decoding layerskip self speculative elhoushi et al 2024 layerskip enabling early exit inference and self speculative decoding speculative decoding kv cache compression self specul...
- [[papers/Fu-et-al-2024-Break-the-Sequential-Dependency-of-LLM-Inference-Using-Lookahead-Decoding|Fu et al. - 2024 - Break the Sequential Dependency of LLM Inference Using Lookahead Decoding]]: fu et al 2024 break the sequential dependency of llm inference using lookahead decoding fu et al 2024 break the sequential dependency of llm inference using lookahead decoding speculative decoding attention kernel scheduling io aware attention low precision at...
- [[papers/GLM-5-Team-2026-GLM-5-from-Vibe-Coding-to-Agentic-Engineering|GLM-5-Team 等 - 2026 - GLM-5 from Vibe Coding to Agentic Engineering]]: glm 5 team 2026 glm 5 from vibe coding to agentic engineering glm 5 glm 5 team 2026 glm 5 from vibe coding to agentic engineering speculative decoding long context inference kv cache compression context extrapolation speculative decoding long context inference...
- [[papers/GQA-Training-Generalized-Multi-Query-Transformer-Models-from-Multi-Head-Checkpoints|GQA: Training Generalized Multi-Query Transformer Models from Multi-Head Checkpoints]]: gqa training generalized multi query transformer models from multi head checkpoints gqa gqa multi query multi head grouped query attention checkpoint conversion grouped query attention transformer architecture kv cache memory attention head sharing grouped que...

## Related Concepts

- [[concepts/Draft-target-distribution-mismatch|Draft-target distribution mismatch]]
- [[concepts/Verification-cost-model|Verification cost model]]

## Open Questions

- Which linked papers provide the strongest source-grounded evidence for this concept?
- Which methods fail when this concept is ignored?

## Retrieval Hooks

- Use for speculative decoding debug, acceptance-rate regressions, and draft/target ablations.
