---
type: "synthesis"
title: "Parameter-Efficient Adaptation Topic Overview"
status: "draft"
created: "2026-05-21"
updated: "2026-05-21"
proposal_id: "Parameter-Efficient-Adaptation-Topic-Overview"
query: "I need a topic overview for parameter-efficient adaptation that connects key papers, method families, claims, evidence, and open questions."
source_papers:
  - "papers/Zhang-et-al-2025-RefLoRA-Refactored-Low-Rank-Adaptation-for-Efficient-Fine-Tuning-of-Large-Models.md"
  - "papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression.md"
  - "papers/Wang-et-al-2025-BitNet-v2-Native-4-bit-Activations-with-Hadamard-Transformation-for-1-bit-LLMs.md"
  - "papers/Hu-et-al-2025-OstQuant-Refining-Large-Langua....md"
  - "papers/Cai-et-al-2025-PyramidKV-Dynamic-KV-Cache-Compression-based-on-Pyramidal-Information-Funneling.md"
  - "papers/Qiu-et-al-2025-Gated-Attention-for-Large-Language-Models-Non-linearity-Sparsity-and-Attention-Sink-Free.md"
  - "papers/Xiao-et-al-2024-Efficien....md"
  - "papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models.md"
  - "papers/3549-Train-Freeze-or-Exit-Dyna.md"
  - "papers/Chitsaz-et-al-2024-Exploring-Quantization-for-Efficient-Pre-Training-of-Transformer-Language-Models....md"
source_sections:
  - "methods/rotation-based-quantization#What It Is"
  - "methods/rotation-based-quantization#Failure Modes"
  - "methods/rotation-based-quantization#Mechanism"
  - "methods/rotation-based-quantization#Implementation Hooks"
  - "methods/rotation-based-quantization#Used By Papers"
  - "methods/rotation-based-quantization#Open Questions"
  - "concepts/Attention-sink#Evidence / Provenance"
  - "concepts/Attention-sink#What It Is"
  - "concepts/Attention-sink#Where It Appears"
  - "concepts/Attention-sink#Open Questions"
  - "syntheses/Performance-Evaluation-Topic-Overview#Retrieval Hooks"
  - "syntheses/Performance-Evaluation-Topic-Overview#Wiki Synthesis"
  - "syntheses/Performance-Evaluation-Topic-Overview#What This Page Is For"
  - "syntheses/Performance-Evaluation-Topic-Overview#Source Facts"
  - "syntheses/Performance-Evaluation-Topic-Overview#Evidence Map"
  - "syntheses/Performance-Evaluation-Topic-Overview#User Ideas / Decisions"
  - "syntheses/Performance-Evaluation-Topic-Overview#Open Questions"
  - "syntheses/Performance-Evaluation-Topic-Overview#Publish / Review Notes"
  - "topics/parameter-efficient-adaptation#Scope"
  - "topics/parameter-efficient-adaptation#Retrieval Hooks"
  - "topics/parameter-efficient-adaptation#Claims"
  - "topics/parameter-efficient-adaptation#Key Papers"
  - "topics/parameter-efficient-adaptation#Key Concepts"
  - "evidence/Computer-Architecture-A-Quantitative-Approach-5th-edition-evidence-p0001#Evidence Item"
  - "evidence/Computer-Architecture-A-Quantitative-Approach-5th-edition-evidence-p0001#Supports"
  - "evidence/Computer-Architecture-A-Quantitative-Approach-5th-edition-evidence-p0001#Metric or Observation"
  - "evidence/Computer-Architecture-A-Quantitative-Approach-5th-edition-evidence-p0001#Limits"
source_context: ".drafts/proposals/product-maturity-synthesis-r2/Parameter-Efficient-Adaptation-Topic-Overview/source_context.json"
user_inputs:
  - "inline_user_note"
confidence: "low"
review_state: "published_proposal"
tags:
  - "paper-wiki/synthesis"
  - "paper-wiki/synthesis"
aliases:
  - "Parameter-Efficient Adaptation Topic Overview"
  - "I need a topic overview for parameter-efficient adaptation that connects key papers, method families, claims, evidence, and open questions."
topics:
methods:
related:
  - "methods/rotation-based-quantization"
  - "concepts/Attention-sink"
  - "syntheses/Performance-Evaluation-Topic-Overview"
  - "topics/parameter-efficient-adaptation"
  - "claims/Xie-et-al-2022-Crystal-Diffusion-Variational-Autoencoder-for-Periodic-Material-Generation-claim-004"
  - "evidence/Computer-Architecture-A-Quantitative-Approach-5th-edition-evidence-p0001"
related_papers:
  - "papers/Zhang-et-al-2025-RefLoRA-Refactored-Low-Rank-Adaptation-for-Efficient-Fine-Tuning-of-Large-Models.md"
  - "papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression.md"
  - "papers/Wang-et-al-2025-BitNet-v2-Native-4-bit-Activations-with-Hadamard-Transformation-for-1-bit-LLMs.md"
  - "papers/Hu-et-al-2025-OstQuant-Refining-Large-Langua....md"
  - "papers/Cai-et-al-2025-PyramidKV-Dynamic-KV-Cache-Compression-based-on-Pyramidal-Information-Funneling.md"
  - "papers/Qiu-et-al-2025-Gated-Attention-for-Large-Language-Models-Non-linearity-Sparsity-and-Attention-Sink-Free.md"
  - "papers/Xiao-et-al-2024-Efficien....md"
  - "papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models.md"
  - "papers/3549-Train-Freeze-or-Exit-Dyna.md"
  - "papers/Chitsaz-et-al-2024-Exploring-Quantization-for-Efficient-Pre-Training-of-Transformer-Language-Models....md"
related_methods:
related_topics:
source_quality_risk: false
evolution_state: "active"
revision_id: "synthesis-Parameter-Efficient-Adaptation-Topic-Overview"
sources:
  - "papers/Zhang-et-al-2025-RefLoRA-Refactored-Low-Rank-Adaptation-for-Efficient-Fine-Tuning-of-Large-Models.md"
  - "papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression.md"
  - "papers/Wang-et-al-2025-BitNet-v2-Native-4-bit-Activations-with-Hadamard-Transformation-for-1-bit-LLMs.md"
  - "papers/Hu-et-al-2025-OstQuant-Refining-Large-Langua....md"
  - "papers/Cai-et-al-2025-PyramidKV-Dynamic-KV-Cache-Compression-based-on-Pyramidal-Information-Funneling.md"
  - "papers/Qiu-et-al-2025-Gated-Attention-for-Large-Language-Models-Non-linearity-Sparsity-and-Attention-Sink-Free.md"
  - "papers/Xiao-et-al-2024-Efficien....md"
  - "papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models.md"
  - "papers/3549-Train-Freeze-or-Exit-Dyna.md"
  - "papers/Chitsaz-et-al-2024-Exploring-Quantization-for-Efficient-Pre-Training-of-Transformer-Language-Models....md"
  - "methods/rotation-based-quantization.md"
  - "concepts/Attention-sink.md"
  - "syntheses/Performance-Evaluation-Topic-Overview.md"
  - "topics/parameter-efficient-adaptation.md"
  - "claims/Xie-et-al-2022-Crystal-Diffusion-Variational-Autoencoder-for-Periodic-Material-Generation-claim-004.md"
  - "evidence/Computer-Architecture-A-Quantitative-Approach-5th-edition-evidence-p0001.md"
  - "syntheses/Transformer-Architecture-Topic-Overview.md"
  - "concepts/KL-regularization.md"
supports:
contradicts:
supersedes:
superseded_by:
---
# Parameter-Efficient Adaptation Topic Overview

## What This Page Is For

- Proposal type: `synthesis`.
- Original research query: I need a topic overview for parameter-efficient adaptation that connects key papers, method families, claims, evidence, and open questions.
- Publish target after review: `syntheses/Parameter-Efficient-Adaptation-Topic-Overview.md`.
- This draft exists to preserve useful retrieval context without pretending that synthesis is already final.

## Source Facts

- [[methods/rotation-based-quantization|rotation-based quantization]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `What It Is`: It groups canonical paper pages that use or discuss the method; source-grounded claims remain on the linked paper/evidence pages.
  - `Failure Modes`: Open questions: - Do key f...
  - `Mechanism`: - [[papers/Zhang-et-al-2025-RefLoRA-Refactored-Low-Rank-Adaptation-for-Efficient-Fine-Tuning-of-Large-Models|Zhang et al.
  - `Implementation Hooks`: - [[papers/Zhang-et-al-2025-RefLoRA-Refactored-Low-Rank-Adaptation-for-Efficient-Fine-Tuning-of-Large-Models|Zhang et al.
  - `Used By Papers`: - [[papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression]] - [[papers/Wang-et-al-2025-BitNet-v2-Native-4-bit-Activations-with-Hadamard-Transformation-for-1-bit-LLMs]] - [[papers/Hu-et-al-2025-OstQuant-Refining-Large-Langua...
  - `Open Questions`: - Which linked papers provide the strongest source-grounded evidence for this method family?
- [[concepts/Attention-sink|Attention sink]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Evidence / Provenance`: - 2024 - Efficient Streaming Language Models with Attention Sinks]]: xiao et al 2024 efficient streaming language models with attention sinks xiao et al 2024 efficient streaming language models with attention sinks low precision attention computer architecture...
  - `What It Is`: `Attention sink` is a compiled preliminary-knowledge concept: a recurring mechanism or implementation background that appears across papers/methods and affects how a researcher understands, implements, debugs, or ablates the method family.
  - `Where It Appears`: - [[papers/Cai-et-al-2025-PyramidKV-Dynamic-KV-Cache-Compression-based-on-Pyramidal-Information-Funneling]] - [[papers/Qiu-et-al-2025-Gated-Attention-for-Large-Language-Models-Non-linearity-Sparsity-and-Attention-Sink-Free]] - [[papers/Xiao-et-al-2024-Efficien...
  - `Open Questions`: - Which linked papers provide the strongest source-grounded evidence for this concept? - Which methods fail when this concept is ignored?
- [[syntheses/Performance-Evaluation-Topic-Overview|Performance Evaluation Topic Overview]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Retrieval Hooks`: - Query: "I need a topic overview for performance evaluation that connects key papers, method families, claims, evidence, and open questions." Use because: It is the original research intent that produced `Performance Evaluation Topic Overview`.
  - `Wiki Synthesis`: - Intended use: I need a topic overview for performance evaluation that connects key papers, method families, claims, evidence, and open questions.
  - `What This Page Is For`: - Original research query: I need a topic overview for performance evaluation that connects key papers, method families, claims, evidence, and open questions.
  - `Source Facts`: - `Retrieval Hooks`: - Query: "I need a topic overview for transformer architecture that connects key papers, method families, claims, evidence, and open questions." Use because: It is the original research intent that produced `Transformer Architecture Topic...
  - `Evidence Map`: - [[syntheses/Transformer-Architecture-Topic-Overview|Transformer Architecture Topic Overview]]: candidate evidence sections: Retrieval Hooks, Wiki Synthesis, What This Page Is For, Evidence Map, Source Facts, User Ideas / Decisions, Open Questions, Publish /...
  - `User Ideas / Decisions`: Automatically seeded by the final LLM Wiki synthesis growth loop from a compiled topic page.
  - `Open Questions`: - Which source facts are strong enough to preserve as canonical synthesis? - Which retrieved pages are adjacent context rather than direct evidence? - What should be checked against raw PDFs or user annotations before using this in a research decision?
  - `Publish / Review Notes`: - Run `meridian wiki proposal-lint` before publishing. - Keep source facts, wiki synthesis, and user ideas separated during review. - Do not promote source-quality holds as scientific evidence.
- [[topics/parameter-efficient-adaptation|parameter-efficient adaptation]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Scope`: This topic page compiles canonical paper pages around `parameter-efficient adaptation`.
  - `Retrieval Hooks`: - Retrieve this topic when comparing papers, mechanisms, limitations, or implementation hooks around `parameter-efficient adaptation`.
  - `Claims`: - [[papers/Zhang-et-al-2025-RefLoRA-Refactored-Low-Rank-Adaptation-for-Efficient-Fine-Tuning-of-Large-Models|Zhang et al.
  - `Key Papers`: - [[papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models]] - [[papers/3549-Train-Freeze-or-Exit-Dyna]] - [[papers/Chitsaz-et-al-2024-Exploring-Quantization-for-Efficient-Pre-Training-of-Transformer-Language-Models...
  - `Key Concepts`: - [[concepts/KL-regularization|KL regularization]]
- [[claims/Xie-et-al-2022-Crystal-Diffusion-Variational-Autoencoder-for-Periodic-Material-Generation-claim-004|4 PROPOSED METHOD Our approach generates new materials via a two-step process: 1) We sample a z from the latent space and use it to predict 3 aggregated properties of a material: composition (c), lattice (L), and number of atoms (N), which are then used to randomly initialize a material structure ˜ M = ( ˜ A, ˜ X, L).]]: retrieved source page; extract only directly supported facts with page/section provenance.
- [[evidence/Computer-Architecture-A-Quantitative-Approach-5th-edition-evidence-p0001|evidence-p0001]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Evidence Item`: No summary.
  - `Supports`: - `none recorded`
  - `Metric or Observation`: - Evidence type: `page` - Observation: No summary.
  - `Limits`: - This evidence item is paper-local until synthesized with other evidence.

## Wiki Synthesis

- This is a low-confidence synthesis scaffold generated from canonical retrieval context.
- Preserve the source facts below as evidence candidates; do not treat this scaffold as a final thesis.
- Intended use: I need a topic overview for parameter-efficient adaptation that connects key papers, method families, claims, evidence, and open questions.
- Next reviewer action: compress retrieved source facts into a tighter cross-paper thesis only after checking provenance.

## User Ideas / Decisions

Automatically seeded by the final LLM Wiki synthesis growth loop from a compiled topic page.

## Evidence Map

- [[methods/rotation-based-quantization|rotation-based quantization]]: candidate evidence sections: What It Is, Failure Modes, Mechanism, Implementation Hooks, Used By Papers, Open Questions.
- [[concepts/Attention-sink|Attention sink]]: candidate evidence sections: Evidence / Provenance, What It Is, Where It Appears, Open Questions.
- [[syntheses/Performance-Evaluation-Topic-Overview|Performance Evaluation Topic Overview]]: candidate evidence sections: Retrieval Hooks, Wiki Synthesis, What This Page Is For, Source Facts, Evidence Map, User Ideas / Decisions, Open Questions, Publish / Review Notes.
- [[topics/parameter-efficient-adaptation|parameter-efficient adaptation]]: candidate evidence sections: Scope, Retrieval Hooks, Claims, Key Papers, Key Concepts.
- [[claims/Xie-et-al-2022-Crystal-Diffusion-Variational-Autoencoder-for-Periodic-Material-Generation-claim-004|4 PROPOSED METHOD Our approach generates new materials via a two-step process: 1) We sample a z from the latent space and use it to predict 3 aggregated properties of a material: composition (c), lattice (L), and number of atoms (N), which are then used to randomly initialize a material structure ˜ M = ( ˜ A, ˜ X, L).]]: candidate evidence sections: needs manual section selection.
- [[evidence/Computer-Architecture-A-Quantitative-Approach-5th-edition-evidence-p0001|evidence-p0001]]: candidate evidence sections: Evidence Item, Supports, Metric or Observation, Limits.

## Open Questions

- Which source facts are strong enough to preserve as canonical synthesis?
- Which retrieved pages are adjacent context rather than direct evidence?
- What should be checked against raw PDFs or user annotations before using this in a research decision?

## Retrieval Hooks

- Query: "I need a topic overview for parameter-efficient adaptation that connects key papers, method families, claims, evidence, and open questions."
  Use because: It is the original research intent that produced `Parameter-Efficient Adaptation Topic Overview`.

## Publish / Review Notes

- Run `meridian wiki proposal-lint` before publishing.
- Keep source facts, wiki synthesis, and user ideas separated during review.
- Do not promote source-quality holds as scientific evidence.

## Source Links

- [[methods/rotation-based-quantization|rotation-based quantization]]
- [[concepts/Attention-sink|Attention sink]]
- [[syntheses/Performance-Evaluation-Topic-Overview|Performance Evaluation Topic Overview]]
- [[topics/parameter-efficient-adaptation|parameter-efficient adaptation]]
- [[claims/Xie-et-al-2022-Crystal-Diffusion-Variational-Autoencoder-for-Periodic-Material-Generation-claim-004|4 PROPOSED METHOD Our approach generates new materials via a two-step process: 1) We sample a z from the latent space and use it to predict 3 aggregated properties of a material: composition (c), lattice (L), and number of atoms (N), which are then used to randomly initialize a material structure ˜ M = ( ˜ A, ˜ X, L).]]
- [[evidence/Computer-Architecture-A-Quantitative-Approach-5th-edition-evidence-p0001|evidence-p0001]]
