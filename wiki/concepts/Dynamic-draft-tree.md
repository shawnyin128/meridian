---
type: "concept"
title: "Dynamic draft tree"
status: "active"
created: "2026-05-21"
updated: "2026-05-21"
aliases:
  - "dynamic draft tree"
  - "tree speculation"
  - "draft tree"
  - "speculative tree"
sources:
  - "papers/Cai-et-al-2024-Medusa-Simple-LLM-Inference-Acceleration-Framework-with-Multiple-Decoding-Heads.md"
  - "papers/Fu-et-al-2024-Break-the-Sequential-Dependency-of-LLM-Inference-Using-Lookahead-Decoding.md"
  - "papers/Hu-et-al-2026-Bridging-Draft-Policy-Misalignment-Group-Tree-Optimization-for-Speculative-Decoding.md"
  - "papers/Li-et-al-2024-EAGLE-2-Faster-Inference-of-Language-Models-with-Dynamic-Draft-Trees.md"
  - "papers/Li-et-al-2025-EAGLE-3-Scaling-up-Inference-Acceleration-of-Large-Language-Models-via-Training-Time-Test.md"
  - "papers/Liu-et-al-2024-Kangaroo-Lossless-Self-Speculative-Decoding-via-Double-Early-Exiting.md"
  - "papers/Miao-et-al-2024-SpecInfer-Accelerating-Generative-Large-Language-Model-Serving-with-Tree-based-Speculative-Inferenc.md"
  - "papers/Sadhukhan-et-al-2025-MagicDec-Breaking-the-Latency-Throughput-Tradeoff-for-Long-Context-Generation-with-Speculative-Deco.md"
  - "papers/Samarin-et-al-2026-LK-Losses-Direct-Acceptance-Rate-Optimization-for-Speculative-Decoding.md"
  - "papers/Tiwari-et-al-2025-QuantSpec-Self-Speculative-Decoding-with-Hierarchical-Quantized-KV-Cache.md"
  - "papers/Xu-et-al-2025-Speculative-Knowledge-Distillation-Bridging-the-Teacher-Student-Gap-Through-Interleaved-Sampling.md"
  - "papers/Yang-et-al-2025-LongSpec-Long-Context-Lossless-Speculative-Decoding-with-Efficient-Drafting-and-Verification.md"
  - "papers/Zhang-et-al-2026-Learning-to-Draft-Adaptive-Speculative-Decoding-with-Reinforcement-Learning.md"
source_papers:
  - "papers/Cai-et-al-2024-Medusa-Simple-LLM-Inference-Acceleration-Framework-with-Multiple-Decoding-Heads.md"
  - "papers/Fu-et-al-2024-Break-the-Sequential-Dependency-of-LLM-Inference-Using-Lookahead-Decoding.md"
  - "papers/Hu-et-al-2026-Bridging-Draft-Policy-Misalignment-Group-Tree-Optimization-for-Speculative-Decoding.md"
  - "papers/Li-et-al-2024-EAGLE-2-Faster-Inference-of-Language-Models-with-Dynamic-Draft-Trees.md"
  - "papers/Li-et-al-2025-EAGLE-3-Scaling-up-Inference-Acceleration-of-Large-Language-Models-via-Training-Time-Test.md"
  - "papers/Liu-et-al-2024-Kangaroo-Lossless-Self-Speculative-Decoding-via-Double-Early-Exiting.md"
  - "papers/Miao-et-al-2024-SpecInfer-Accelerating-Generative-Large-Language-Model-Serving-with-Tree-based-Speculative-Inferenc.md"
  - "papers/Sadhukhan-et-al-2025-MagicDec-Breaking-the-Latency-Throughput-Tradeoff-for-Long-Context-Generation-with-Speculative-Deco.md"
  - "papers/Samarin-et-al-2026-LK-Losses-Direct-Acceptance-Rate-Optimization-for-Speculative-Decoding.md"
  - "papers/Tiwari-et-al-2025-QuantSpec-Self-Speculative-Decoding-with-Hierarchical-Quantized-KV-Cache.md"
  - "papers/Xu-et-al-2025-Speculative-Knowledge-Distillation-Bridging-the-Teacher-Student-Gap-Through-Interleaved-Sampling.md"
  - "papers/Yang-et-al-2025-LongSpec-Long-Context-Lossless-Speculative-Decoding-with-Efficient-Drafting-and-Verification.md"
  - "papers/Zhang-et-al-2026-Learning-to-Draft-Adaptive-Speculative-Decoding-with-Reinforcement-Learning.md"
related_methods:
  - "speculative decoding"
  - "draft-model decoding"
  - "self-speculative decoding"
related_topics:
  - "dynamic draft tree"
  - "speculative decoding"
  - "draft acceptance"
related_claims:
related_evidence:
prerequisite_for:
  - "speculative decoding"
  - "draft-model decoding"
  - "self-speculative decoding"
supports:
contradicts:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "concept-b4a1c591a4"
---
# Dynamic draft tree

## What It Is

`Dynamic draft tree` is a compiled preliminary-knowledge concept: a recurring mechanism or implementation background that appears across papers/methods and affects how a researcher understands, implements, debugs, or ablates the method family.

## Why It Matters

- Tree-shaped draft proposals trade off breadth, depth, verification cost, and acceptance probability, so they need different diagnostics than linear speculative decoding.

## Where It Appears

- [[papers/Cai-et-al-2024-Medusa-Simple-LLM-Inference-Acceleration-Framework-with-Multiple-Decoding-Heads]]
- [[papers/Fu-et-al-2024-Break-the-Sequential-Dependency-of-LLM-Inference-Using-Lookahead-Decoding]]
- [[papers/Hu-et-al-2026-Bridging-Draft-Policy-Misalignment-Group-Tree-Optimization-for-Speculative-Decoding]]
- [[papers/Li-et-al-2024-EAGLE-2-Faster-Inference-of-Language-Models-with-Dynamic-Draft-Trees]]
- [[papers/Li-et-al-2025-EAGLE-3-Scaling-up-Inference-Acceleration-of-Large-Language-Models-via-Training-Time-Test]]
- [[papers/Liu-et-al-2024-Kangaroo-Lossless-Self-Speculative-Decoding-via-Double-Early-Exiting]]
- [[papers/Miao-et-al-2024-SpecInfer-Accelerating-Generative-Large-Language-Model-Serving-with-Tree-based-Speculative-Inferenc]]
- [[papers/Sadhukhan-et-al-2025-MagicDec-Breaking-the-Latency-Throughput-Tradeoff-for-Long-Context-Generation-with-Speculative-Deco]]
- [[papers/Samarin-et-al-2026-LK-Losses-Direct-Acceptance-Rate-Optimization-for-Speculative-Decoding]]
- [[papers/Tiwari-et-al-2025-QuantSpec-Self-Speculative-Decoding-with-Hierarchical-Quantized-KV-Cache]]
- [[papers/Xu-et-al-2025-Speculative-Knowledge-Distillation-Bridging-the-Teacher-Student-Gap-Through-Interleaved-Sampling]]
- [[papers/Yang-et-al-2025-LongSpec-Long-Context-Lossless-Speculative-Decoding-with-Efficient-Drafting-and-Verification]]
- [[papers/Zhang-et-al-2026-Learning-to-Draft-Adaptive-Speculative-Decoding-with-Reinforcement-Learning]]

## Used By Methods

- [[methods/speculative-decoding|speculative decoding]]
- [[methods/draft-model-decoding|draft-model decoding]]
- [[methods/self-speculative-decoding|self-speculative decoding]]

## Implementation Implications

- Log branch factor, depth, accepted path length, and verifier work per generated token.
- Separate tree construction policy from target verification semantics.

## Common Failure Modes

- A wider tree increases candidate coverage but overloads verification.
- Accepted-token averages hide that most branches are wasted.

## Minimal Checks / Probes

- Ablate tree depth and branching at fixed target quality.
- Bucket rejected branches by position and confidence.

## Evidence / Provenance

- [[papers/Cai-et-al-2024-Medusa-Simple-LLM-Inference-Acceleration-Framework-with-Multiple-Decoding-Heads|Cai et al. - 2024 - Medusa Simple LLM Inference Acceleration Framework with Multiple Decoding Heads]]: cai et al 2024 medusa simple llm inference acceleration framework with multiple decoding heads cai et al 2024 medusa simple llm inference acceleration framework with multiple decoding heads speculative decoding dynamic draft tree human preference feedback rewa...
- [[papers/Fu-et-al-2024-Break-the-Sequential-Dependency-of-LLM-Inference-Using-Lookahead-Decoding|Fu et al. - 2024 - Break the Sequential Dependency of LLM Inference Using Lookahead Decoding]]: fu et al 2024 break the sequential dependency of llm inference using lookahead decoding fu et al 2024 break the sequential dependency of llm inference using lookahead decoding speculative decoding attention kernel scheduling io aware attention low precision at...
- [[papers/Hu-et-al-2026-Bridging-Draft-Policy-Misalignment-Group-Tree-Optimization-for-Speculative-Decoding|Hu et al. - 2026 - Bridging Draft Policy Misalignment Group Tree Optimization for Speculative Decoding]]: hu et al 2026 bridging draft policy misalignment group tree optimization for speculative decoding hu et al 2026 bridging draft policy misalignment group tree optimization for speculative decoding calibration data selection benchmark evaluation speculative deco...
- [[papers/Li-et-al-2024-EAGLE-2-Faster-Inference-of-Language-Models-with-Dynamic-Draft-Trees|Li et al. - 2024 - EAGLE-2 Faster Inference of Language Models with Dynamic Draft Trees]]: li et al 2024 eagle 2 faster inference of language models with dynamic draft trees eagle 2 context aware dynamic draft tree calibration data selection benchmark evaluation speculative decoding dynamic draft tree feature uncertainty draft acceptance verificatio...
- [[papers/Li-et-al-2025-EAGLE-3-Scaling-up-Inference-Acceleration-of-Large-Language-Models-via-Training-Time-Test|Li et al. - 2025 - EAGLE-3 Scaling up Inference Acceleration of Large Language Models via Training-Time Test]]: li et al 2025 eagle 3 scaling up inference acceleration of large language models via training time test eagle 3 training time li et al 2025 eagle 3 scaling up inference acceleration of large language models via training time test calibration data selection spe...
- [[papers/Liu-et-al-2024-Kangaroo-Lossless-Self-Speculative-Decoding-via-Double-Early-Exiting|Liu et al. - 2024 - Kangaroo Lossless Self-Speculative Decoding via Double Early Exiting]]: liu et al 2024 kangaroo lossless self speculative decoding via double early exiting self speculative kangaroo double early exit self speculative decoding calibration data selection speculative decoding dynamic draft tree self speculative decoding transformer a...
- [[papers/Miao-et-al-2024-SpecInfer-Accelerating-Generative-Large-Language-Model-Serving-with-Tree-based-Speculative-Inferenc|Miao et al. - 2024 - SpecInfer Accelerating Generative Large Language Model Serving with Tree-based Speculative Inferenc]]: miao et al 2024 specinfer accelerating generative large language model serving with tree based speculative inferenc specinfer miao et al 2024 specinfer accelerating generative large language model serving with tree based speculative inferenc low bit quantizati...
- [[papers/Sadhukhan-et-al-2025-MagicDec-Breaking-the-Latency-Throughput-Tradeoff-for-Long-Context-Generation-with-Speculative-Deco|Sadhukhan et al. - 2025 - MagicDec Breaking the Latency-Throughput Tradeoff for Long Context Generation with Speculative Deco]]: sadhukhan et al 2025 magicdec breaking the latency throughput tradeoff for long context generation with speculative deco magicdec latency throughput sadhukhan et al 2025 magicdec breaking the latency throughput tradeoff for long context generation with specula...

## Related Concepts

- [[concepts/Speculative-decoding-acceptance-rate|Speculative decoding acceptance rate]]
- [[concepts/Verification-cost-model|Verification cost model]]

## Open Questions

- Which linked papers provide the strongest source-grounded evidence for this concept?
- Which methods fail when this concept is ignored?

## Retrieval Hooks

- Use for speculative decoding tree design, acceptance-rate debugging, and verifier cost analysis.
