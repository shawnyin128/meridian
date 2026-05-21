---
type: "synthesis"
title: "Lookup-Table Inference Topic Overview"
status: "draft"
created: "2026-05-21"
updated: "2026-05-21"
proposal_id: "Lookup-Table-Inference-Topic-Overview"
query: "I need a topic overview for lookup-table inference that connects key papers, method families, claims, evidence, and open questions."
source_papers:
  - "papers/Adnan-et-al-2024-Keyformer-KV-Cache-Reduction-through-Key-Tokens-Selection-for-Efficient-Generative-Inference.md"
  - "papers/Wang-et-al-2024-BitNet-a4-8-4-bit-Activations-for-1-bit-LLMs.md"
  - "papers/Wang-et-al-2025-SVD-LLM-Truncation-aware-Singular-Value-Decomposition-for-Large-Language-Model-Compression.md"
  - "papers/Qiu-et-al-2025-Gated-Attention-for-Large-Language-Model....md"
  - "papers/2511-10645v1.md"
  - "papers/Liang-et-al-2025-ParoQuant-Pairwise-Rotation-Quantization-for-Efficient-Reasoning-LLM-Inference.md"
  - "papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models.md"
  - "papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression.md"
  - "papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models.md"
  - "papers/Chee-et-al-2024-QuIP-2-Bit-Quantization-of-Lar....md"
source_sections:
  - "methods/long-context-inference#What It Is"
  - "methods/long-context-inference#Failure Modes"
  - "methods/long-context-inference#Mechanism"
  - "methods/long-context-inference#Used By Papers"
  - "methods/long-context-inference#Implementation Hooks"
  - "methods/long-context-inference#Open Questions"
  - "concepts/Per-channel-scaling#Evidence / Provenance"
  - "concepts/Per-channel-scaling#What It Is"
  - "concepts/Per-channel-scaling#Where It Appears"
  - "concepts/Per-channel-scaling#Open Questions"
  - "syntheses/Benchmark-Evaluation-Topic-Overview#Retrieval Hooks"
  - "syntheses/Benchmark-Evaluation-Topic-Overview#Wiki Synthesis"
  - "syntheses/Benchmark-Evaluation-Topic-Overview#What This Page Is For"
  - "syntheses/Benchmark-Evaluation-Topic-Overview#Source Facts"
  - "syntheses/Benchmark-Evaluation-Topic-Overview#Evidence Map"
  - "syntheses/Benchmark-Evaluation-Topic-Overview#User Ideas / Decisions"
  - "syntheses/Benchmark-Evaluation-Topic-Overview#Open Questions"
  - "syntheses/Benchmark-Evaluation-Topic-Overview#Publish / Review Notes"
  - "topics/lookup-table-inference#Scope"
  - "topics/lookup-table-inference#Retrieval Hooks"
  - "topics/lookup-table-inference#Key Papers"
  - "topics/lookup-table-inference#Claims"
  - "topics/lookup-table-inference#Key Concepts"
  - "topics/lookup-table-inference#Method Families"
  - "evidence/Computer-Architecture-A-Quantitative-Approach-5th-edition-evidence-p0001#Evidence Item"
  - "evidence/Computer-Architecture-A-Quantitative-Approach-5th-edition-evidence-p0001#Metric or Observation"
  - "evidence/Computer-Architecture-A-Quantitative-Approach-5th-edition-evidence-p0001#Supports"
  - "evidence/Computer-Architecture-A-Quantitative-Approach-5th-edition-evidence-p0001#Limits"
source_context: ".drafts/proposals/product-maturity-synthesis-r2/Lookup-Table-Inference-Topic-Overview/source_context.json"
user_inputs:
  - "inline_user_note"
confidence: "low"
review_state: "published_proposal"
tags:
  - "paper-wiki/synthesis"
  - "paper-wiki/synthesis"
aliases:
  - "Lookup-Table Inference Topic Overview"
  - "I need a topic overview for lookup-table inference that connects key papers, method families, claims, evidence, and open questions."
topics:
methods:
related:
  - "methods/long-context-inference"
  - "concepts/Per-channel-scaling"
  - "syntheses/Benchmark-Evaluation-Topic-Overview"
  - "topics/lookup-table-inference"
  - "claims/Xie-et-al-2022-Crystal-Diffusion-Variational-Autoencoder-for-Periodic-Material-Generation-claim-004"
  - "evidence/Computer-Architecture-A-Quantitative-Approach-5th-edition-evidence-p0001"
related_papers:
  - "papers/Adnan-et-al-2024-Keyformer-KV-Cache-Reduction-through-Key-Tokens-Selection-for-Efficient-Generative-Inference.md"
  - "papers/Wang-et-al-2024-BitNet-a4-8-4-bit-Activations-for-1-bit-LLMs.md"
  - "papers/Wang-et-al-2025-SVD-LLM-Truncation-aware-Singular-Value-Decomposition-for-Large-Language-Model-Compression.md"
  - "papers/Qiu-et-al-2025-Gated-Attention-for-Large-Language-Model....md"
  - "papers/2511-10645v1.md"
  - "papers/Liang-et-al-2025-ParoQuant-Pairwise-Rotation-Quantization-for-Efficient-Reasoning-LLM-Inference.md"
  - "papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models.md"
  - "papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression.md"
  - "papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models.md"
  - "papers/Chee-et-al-2024-QuIP-2-Bit-Quantization-of-Lar....md"
related_methods:
related_topics:
source_quality_risk: false
evolution_state: "active"
revision_id: "synthesis-Lookup-Table-Inference-Topic-Overview"
sources:
  - "papers/Adnan-et-al-2024-Keyformer-KV-Cache-Reduction-through-Key-Tokens-Selection-for-Efficient-Generative-Inference.md"
  - "papers/Wang-et-al-2024-BitNet-a4-8-4-bit-Activations-for-1-bit-LLMs.md"
  - "papers/Wang-et-al-2025-SVD-LLM-Truncation-aware-Singular-Value-Decomposition-for-Large-Language-Model-Compression.md"
  - "papers/Qiu-et-al-2025-Gated-Attention-for-Large-Language-Model....md"
  - "papers/2511-10645v1.md"
  - "papers/Liang-et-al-2025-ParoQuant-Pairwise-Rotation-Quantization-for-Efficient-Reasoning-LLM-Inference.md"
  - "papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models.md"
  - "papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression.md"
  - "papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models.md"
  - "papers/Chee-et-al-2024-QuIP-2-Bit-Quantization-of-Lar....md"
  - "methods/long-context-inference.md"
  - "concepts/Per-channel-scaling.md"
  - "syntheses/Benchmark-Evaluation-Topic-Overview.md"
  - "topics/lookup-table-inference.md"
  - "claims/Xie-et-al-2022-Crystal-Diffusion-Variational-Autoencoder-for-Periodic-Material-Generation-claim-004.md"
  - "evidence/Computer-Architecture-A-Quantitative-Approach-5th-edition-evidence-p0001.md"
  - "syntheses/Transformer-Architecture-Topic-Overview.md"
  - "concepts/K-means-objective-landscape.md"
  - "concepts/Speculative-decoding-acceptance-rate.md"
  - "concepts/Attention-sink.md"
  - "concepts/KV-cache-memory-bandwidth.md"
  - "methods/transformer-architecture.md"
  - "methods/post-training-quantization.md"
  - "methods/MoE-quantization.md"
  - "methods/calibration-aware-PTQ.md"
  - "methods/rotation-b....md"
supports:
contradicts:
supersedes:
superseded_by:
---
# Lookup-Table Inference Topic Overview

## What This Page Is For

- Proposal type: `synthesis`.
- Original research query: I need a topic overview for lookup-table inference that connects key papers, method families, claims, evidence, and open questions.
- Publish target after review: `syntheses/Lookup-Table-Inference-Topic-Overview.md`.
- This draft exists to preserve useful retrieval context without pretending that synthesis is already final.

## Source Facts

- [[methods/long-context-inference|long-context inference]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `What It Is`: It groups canonical paper pages that use or discuss the method; source-grounded claims remain on the linked paper/evidence pages.
  - `Failure Modes`: Open questions: - Do key f...
  - `Mechanism`: - [[papers/Adnan-et-al-2024-Keyformer-KV-Cache-Reduction-through-Key-Tokens-Selection-for-Efficient-Generative-Inference|Adnan et al.
  - `Used By Papers`: - [[papers/Wang-et-al-2024-BitNet-a4-8-4-bit-Activations-for-1-bit-LLMs]] - [[papers/Wang-et-al-2025-SVD-LLM-Truncation-aware-Singular-Value-Decomposition-for-Large-Language-Model-Compression]] - [[papers/Qiu-et-al-2025-Gated-Attention-for-Large-Language-Model...
  - `Implementation Hooks`: - [[papers/Adnan-et-al-2024-Keyformer-KV-Cache-Reduction-through-Key-Tokens-Selection-for-Efficient-Generative-Inference|Adnan et al.
  - `Open Questions`: - Which linked papers provide the strongest source-grounded evidence for this method family?
- [[concepts/Per-channel-scaling|Per-channel scaling]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Evidence / Provenance`: - [[papers/2511-10645v1|2511.10645v1]]: 2511 10645v1 2511 10645v1 post training quantization low bit quantization quantization error rotation based quantization hardware aware quantization lookup table inference benchmark evaluation survey synthesis survey syn...
  - `What It Is`: `Per-channel scaling` is a compiled preliminary-knowledge concept: a recurring mechanism or implementation background that appears across papers/methods and affects how a researcher understands, implements, debugs, or ablates the method family.
  - `Where It Appears`: - [[papers/2511-10645v1]] - [[papers/Liang-et-al-2025-ParoQuant-Pairwise-Rotation-Quantization-for-Efficient-Reasoning-LLM-Inference]] - [[papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models]]
  - `Open Questions`: - Which linked papers provide the strongest source-grounded evidence for this concept? - Which methods fail when this concept is ignored?
- [[syntheses/Benchmark-Evaluation-Topic-Overview|Benchmark Evaluation Topic Overview]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Retrieval Hooks`: - Query: "I need a topic overview for benchmark evaluation that connects key papers, method families, claims, evidence, and open questions." Use because: It is the original research intent that produced `Benchmark Evaluation Topic Overview`.
  - `Wiki Synthesis`: - Intended use: I need a topic overview for benchmark evaluation that connects key papers, method families, claims, evidence, and open questions.
  - `What This Page Is For`: - Original research query: I need a topic overview for benchmark evaluation that connects key papers, method families, claims, evidence, and open questions.
  - `Source Facts`: - `Retrieval Hooks`: - Query: "I need a topic overview for transformer architecture that connects key papers, method families, claims, evidence, and open questions." Use because: It is the original research intent that produced `Transformer Architecture Topic...
  - `Evidence Map`: - [[syntheses/Transformer-Architecture-Topic-Overview|Transformer Architecture Topic Overview]]: candidate evidence sections: Retrieval Hooks, Wiki Synthesis, What This Page Is For, Evidence Map, Source Facts, User Ideas / Decisions, Open Questions, Publish /...
  - `User Ideas / Decisions`: Automatically seeded by the final LLM Wiki synthesis growth loop from a compiled topic page.
  - `Open Questions`: - Which source facts are strong enough to preserve as canonical synthesis? - Which retrieved pages are adjacent context rather than direct evidence? - What should be checked against raw PDFs or user annotations before using this in a research decision?
  - `Publish / Review Notes`: - Run `meridian wiki proposal-lint` before publishing. - Keep source facts, wiki synthesis, and user ideas separated during review. - Do not promote source-quality holds as scientific evidence.
- [[topics/lookup-table-inference|lookup-table inference]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Scope`: This topic page compiles canonical paper pages around `lookup-table inference`.
  - `Retrieval Hooks`: - Retrieve this topic when comparing papers, mechanisms, limitations, or implementation hooks around `lookup-table inference`.
  - `Key Papers`: - [[papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression]] - [[papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models]] - [[papers/Chee-et-al-2024-QuIP-2-Bit-Quantization-of-Lar...
  - `Claims`: - 2024 - QuIP 2-Bit Quantization of Large Language Models With Guarantees: Deploys clustered weights through lookup-table kernels so non-uniform centroids can be used for lower memory and faster inference.
  - `Key Concepts`: - [[concepts/K-means-objective-landscape|K-means objective landscape]] - [[concepts/Speculative-decoding-acceptance-rate|Speculative decoding acceptance rate]] - [[concepts/Attention-sink|Attention sink]] - [[concepts/KV-cache-memory-bandwidth|KV-cache memory...
  - `Method Families`: - [[methods/transformer-architecture|transformer architecture]] - [[methods/post-training-quantization|post-training quantization]] - [[methods/MoE-quantization|MoE quantization]] - [[methods/calibration-aware-PTQ|calibration-aware PTQ]] - [[methods/rotation-b...
- [[claims/Xie-et-al-2022-Crystal-Diffusion-Variational-Autoencoder-for-Periodic-Material-Generation-claim-004|4 PROPOSED METHOD Our approach generates new materials via a two-step process: 1) We sample a z from the latent space and use it to predict 3 aggregated properties of a material: composition (c), lattice (L), and number of atoms (N), which are then used to randomly initialize a material structure ˜ M = ( ˜ A, ˜ X, L).]]: retrieved source page; extract only directly supported facts with page/section provenance.
- [[evidence/Computer-Architecture-A-Quantitative-Approach-5th-edition-evidence-p0001|evidence-p0001]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Evidence Item`: No summary.
  - `Metric or Observation`: - Evidence type: `page` - Observation: No summary.
  - `Supports`: - `none recorded`
  - `Limits`: - This evidence item is paper-local until synthesized with other evidence.

## Wiki Synthesis

- This is a low-confidence synthesis scaffold generated from canonical retrieval context.
- Preserve the source facts below as evidence candidates; do not treat this scaffold as a final thesis.
- Intended use: I need a topic overview for lookup-table inference that connects key papers, method families, claims, evidence, and open questions.
- Next reviewer action: compress retrieved source facts into a tighter cross-paper thesis only after checking provenance.

## User Ideas / Decisions

Automatically seeded by the final LLM Wiki synthesis growth loop from a compiled topic page.

## Evidence Map

- [[methods/long-context-inference|long-context inference]]: candidate evidence sections: What It Is, Failure Modes, Mechanism, Used By Papers, Implementation Hooks, Open Questions.
- [[concepts/Per-channel-scaling|Per-channel scaling]]: candidate evidence sections: Evidence / Provenance, What It Is, Where It Appears, Open Questions.
- [[syntheses/Benchmark-Evaluation-Topic-Overview|Benchmark Evaluation Topic Overview]]: candidate evidence sections: Retrieval Hooks, Wiki Synthesis, What This Page Is For, Source Facts, Evidence Map, User Ideas / Decisions, Open Questions, Publish / Review Notes.
- [[topics/lookup-table-inference|lookup-table inference]]: candidate evidence sections: Scope, Retrieval Hooks, Key Papers, Claims, Key Concepts, Method Families.
- [[claims/Xie-et-al-2022-Crystal-Diffusion-Variational-Autoencoder-for-Periodic-Material-Generation-claim-004|4 PROPOSED METHOD Our approach generates new materials via a two-step process: 1) We sample a z from the latent space and use it to predict 3 aggregated properties of a material: composition (c), lattice (L), and number of atoms (N), which are then used to randomly initialize a material structure ˜ M = ( ˜ A, ˜ X, L).]]: candidate evidence sections: needs manual section selection.
- [[evidence/Computer-Architecture-A-Quantitative-Approach-5th-edition-evidence-p0001|evidence-p0001]]: candidate evidence sections: Evidence Item, Metric or Observation, Supports, Limits.

## Open Questions

- Which source facts are strong enough to preserve as canonical synthesis?
- Which retrieved pages are adjacent context rather than direct evidence?
- What should be checked against raw PDFs or user annotations before using this in a research decision?

## Retrieval Hooks

- Query: "I need a topic overview for lookup-table inference that connects key papers, method families, claims, evidence, and open questions."
  Use because: It is the original research intent that produced `Lookup-Table Inference Topic Overview`.

## Publish / Review Notes

- Run `meridian wiki proposal-lint` before publishing.
- Keep source facts, wiki synthesis, and user ideas separated during review.
- Do not promote source-quality holds as scientific evidence.

## Source Links

- [[methods/long-context-inference|long-context inference]]
- [[concepts/Per-channel-scaling|Per-channel scaling]]
- [[syntheses/Benchmark-Evaluation-Topic-Overview|Benchmark Evaluation Topic Overview]]
- [[topics/lookup-table-inference|lookup-table inference]]
- [[claims/Xie-et-al-2022-Crystal-Diffusion-Variational-Autoencoder-for-Periodic-Material-Generation-claim-004|4 PROPOSED METHOD Our approach generates new materials via a two-step process: 1) We sample a z from the latent space and use it to predict 3 aggregated properties of a material: composition (c), lattice (L), and number of atoms (N), which are then used to randomly initialize a material structure ˜ M = ( ˜ A, ˜ X, L).]]
- [[evidence/Computer-Architecture-A-Quantitative-Approach-5th-edition-evidence-p0001|evidence-p0001]]
