---
type: "synthesis"
title: "Speculative Decoding Topic Overview"
status: "draft"
created: "2026-05-21"
updated: "2026-05-21"
proposal_id: "Speculative-Decoding-Topic-Overview"
query: "I need a topic overview for speculative decoding that connects key papers, method families, claims, evidence, and open questions."
source_papers:
  - "papers/Hu-et-al-2025-Speculative-Decoding-and-Beyond-An-In-Depth-Survey-of-Techniques.md"
  - "papers/Miao-et-al-2024-SpecInfer-Accelerating-Generative-Large-Language-Model-Serving-with-Tree-based-Speculative-Inferenc.md"
  - "papers/Liu-et-al-2025-PEARL-Paralle....md"
  - "papers/13979-STAR-Speculative-Decodin.md"
  - "papers/Cai-et-al-2024-Medusa-Simple-LLM-Inference-Acceleration-Framework-with-Multiple-Decoding-Heads.md"
  - "papers/DeepSeek-AI-2025-DeepSeek-V3-Technical-Report.md"
  - "papers/ERNIE-Technical-Report.md"
  - "papers/El....md"
  - "papers/Lu-et-al-2022-A-continental-scale-analysis-reveals-widespread-root-bimodality.md"
  - "papers/Tiwari-et-al-2025-QuantSpec-Self-Speculative-Decoding-with-Hierarc....md"
source_sections:
  - "methods/speculative-decoding#What It Is"
  - "methods/speculative-decoding#Prerequisite Concepts"
  - "methods/speculative-decoding#Mechanism"
  - "methods/speculative-decoding#Failure Modes"
  - "methods/speculative-decoding#Used By Papers"
  - "methods/speculative-decoding#Implementation Hooks"
  - "methods/speculative-decoding#Open Questions"
  - "concepts/Speculative-decoding-acceptance-rate#Evidence / Provenance"
  - "concepts/Speculative-decoding-acceptance-rate#What It Is"
  - "concepts/Speculative-decoding-acceptance-rate#Retrieval Hooks"
  - "concepts/Speculative-decoding-acceptance-rate#Why It Matters"
  - "concepts/Speculative-decoding-acceptance-rate#Where It Appears"
  - "concepts/Speculative-decoding-acceptance-rate#Open Questions"
  - "syntheses/Calibration-Data-Selection-Topic-Overview#Retrieval Hooks"
  - "syntheses/Calibration-Data-Selection-Topic-Overview#Wiki Synthesis"
  - "syntheses/Calibration-Data-Selection-Topic-Overview#Evidence Map"
  - "syntheses/Calibration-Data-Selection-Topic-Overview#What This Page Is For"
  - "syntheses/Calibration-Data-Selection-Topic-Overview#Source Facts"
  - "syntheses/Calibration-Data-Selection-Topic-Overview#User Ideas / Decisions"
  - "syntheses/Calibration-Data-Selection-Topic-Overview#Open Questions"
  - "syntheses/Calibration-Data-Selection-Topic-Overview#Publish / Review Notes"
  - "topics/speculative-decoding#Key Concepts"
  - "topics/speculative-decoding#Scope"
  - "topics/speculative-decoding#Claims"
  - "topics/speculative-decoding#Key Papers"
  - "topics/speculative-decoding#Retrieval Hooks"
  - "topics/speculative-decoding#Method Families"
  - "evidence/Computer-Architecture-A-Quantitative-Approach-5th-edition-evidence-p0001#Evidence Item"
  - "evidence/Computer-Architecture-A-Quantitative-Approach-5th-edition-evidence-p0001#Supports"
  - "evidence/Computer-Architecture-A-Quantitative-Approach-5th-edition-evidence-p0001#Metric or Observation"
  - "evidence/Computer-Architecture-A-Quantitative-Approach-5th-edition-evidence-p0001#Limits"
source_context: ".drafts/proposals/product-maturity-synthesis-r2/Speculative-Decoding-Topic-Overview/source_context.json"
user_inputs:
  - "inline_user_note"
confidence: "low"
review_state: "published_proposal"
tags:
  - "paper-wiki/synthesis"
  - "paper-wiki/synthesis"
aliases:
  - "Speculative Decoding Topic Overview"
  - "I need a topic overview for speculative decoding that connects key papers, method families, claims, evidence, and open questions."
topics:
methods:
related:
  - "methods/speculative-decoding"
  - "concepts/Speculative-decoding-acceptance-rate"
  - "syntheses/Calibration-Data-Selection-Topic-Overview"
  - "topics/speculative-decoding"
  - "claims/Xie-et-al-2022-Crystal-Diffusion-Variational-Autoencoder-for-Periodic-Material-Generation-claim-004"
  - "evidence/Computer-Architecture-A-Quantitative-Approach-5th-edition-evidence-p0001"
related_papers:
  - "papers/Hu-et-al-2025-Speculative-Decoding-and-Beyond-An-In-Depth-Survey-of-Techniques.md"
  - "papers/Miao-et-al-2024-SpecInfer-Accelerating-Generative-Large-Language-Model-Serving-with-Tree-based-Speculative-Inferenc.md"
  - "papers/Liu-et-al-2025-PEARL-Paralle....md"
  - "papers/13979-STAR-Speculative-Decodin.md"
  - "papers/Cai-et-al-2024-Medusa-Simple-LLM-Inference-Acceleration-Framework-with-Multiple-Decoding-Heads.md"
  - "papers/DeepSeek-AI-2025-DeepSeek-V3-Technical-Report.md"
  - "papers/ERNIE-Technical-Report.md"
  - "papers/El....md"
  - "papers/Lu-et-al-2022-A-continental-scale-analysis-reveals-widespread-root-bimodality.md"
  - "papers/Tiwari-et-al-2025-QuantSpec-Self-Speculative-Decoding-with-Hierarc....md"
related_methods:
related_topics:
source_quality_risk: false
evolution_state: "active"
revision_id: "synthesis-Speculative-Decoding-Topic-Overview"
sources:
  - "papers/Hu-et-al-2025-Speculative-Decoding-and-Beyond-An-In-Depth-Survey-of-Techniques.md"
  - "papers/Miao-et-al-2024-SpecInfer-Accelerating-Generative-Large-Language-Model-Serving-with-Tree-based-Speculative-Inferenc.md"
  - "papers/Liu-et-al-2025-PEARL-Paralle....md"
  - "papers/13979-STAR-Speculative-Decodin.md"
  - "papers/Cai-et-al-2024-Medusa-Simple-LLM-Inference-Acceleration-Framework-with-Multiple-Decoding-Heads.md"
  - "papers/DeepSeek-AI-2025-DeepSeek-V3-Technical-Report.md"
  - "papers/ERNIE-Technical-Report.md"
  - "papers/El....md"
  - "papers/Lu-et-al-2022-A-continental-scale-analysis-reveals-widespread-root-bimodality.md"
  - "papers/Tiwari-et-al-2025-QuantSpec-Self-Speculative-Decoding-with-Hierarc....md"
  - "methods/speculative-decoding.md"
  - "concepts/Speculative-decoding-acceptance-rate.md"
  - "syntheses/Calibration-Data-Selection-Topic-Overview.md"
  - "topics/speculative-decoding.md"
  - "claims/Xie-et-al-2022-Crystal-Diffusion-Variational-Autoencoder-for-Periodic-Material-Generation-claim-004.md"
  - "evidence/Computer-Architecture-A-Quantitative-Approach-5th-edition-evidence-p0001.md"
  - "syntheses/Transformer-Architecture-Topic-Overview.md"
  - "methods/clustering-algorithm.md"
  - "methods/audio-language-modeling.md"
  - "methods/multimodal-instruction-tuning.md"
  - "methods/....md"
supports:
contradicts:
supersedes:
superseded_by:
---
# Speculative Decoding Topic Overview

## What This Page Is For

- Proposal type: `synthesis`.
- Original research query: I need a topic overview for speculative decoding that connects key papers, method families, claims, evidence, and open questions.
- Publish target after review: `syntheses/Speculative-Decoding-Topic-Overview.md`.
- This draft exists to preserve useful retrieval context without pretending that synthesis is already final.

## Source Facts

- [[methods/speculative-decoding|speculative decoding]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `What It Is`: This is a compiled method-family page for `speculative decoding`.
  - `Prerequisite Concepts`: - [[concepts/Speculative-decoding-acceptance-rate|Speculative decoding acceptance rate]]
  - `Mechanism`: - 2025 - Speculative Decoding and Beyond An In-Depth Survey of Techniques - Purpose: Compresses the decode-time KV cache by selecting which cached key/value entries to retain under a cache budget, then evaluates the quality, m...
  - `Failure Modes`: - 2025 - Speculative Decoding and Beyond An In-Depth Survey of Techniques]]: - Attention architecture claims can depend on sequence length, mask convention, positional encoding, and training compute.
  - `Used By Papers`: - [[papers/Hu-et-al-2025-Speculative-Decoding-and-Beyond-An-In-Depth-Survey-of-Techniques]] - [[papers/Miao-et-al-2024-SpecInfer-Accelerating-Generative-Large-Language-Model-Serving-with-Tree-based-Speculative-Inferenc]] - [[papers/Liu-et-al-2025-PEARL-Paralle...
  - `Implementation Hooks`: - [[papers/Hu-et-al-2025-Speculative-Decoding-and-Beyond-An-In-Depth-Survey-of-Techniques|Hu et al.
  - `Open Questions`: - Which linked papers provide the strongest source-grounded evidence for this method family?
- [[concepts/Speculative-decoding-acceptance-rate|Speculative decoding acceptance rate]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Evidence / Provenance`: - [[papers/13979-STAR-Speculative-Decodin|13979_STAR_Speculative_Decodin]]: 13979 star speculative decodin 13979 star speculative decodin speculative decoding kv cache compression transformer architecture draft acceptance context extrapolation speculative deco...
  - `What It Is`: `Speculative decoding acceptance rate` is a compiled preliminary-knowledge concept: a recurring mechanism or implementation background that appears across papers/methods and affects how a researcher understands, implements, debugs, or ablates the method family...
  - `Retrieval Hooks`: - Use for speculative decoding debug, acceptance-rate regressions, and draft/target ablations.
  - `Why It Matters`: - Speculative decoding speed depends on how many draft tokens survive target-model verification, not just draft model throughput.
  - `Where It Appears`: - [[papers/13979-STAR-Speculative-Decodin]] - [[papers/Cai-et-al-2024-Medusa-Simple-LLM-Inference-Acceleration-Framework-with-Multiple-Decoding-Heads]] - [[papers/DeepSeek-AI-2025-DeepSeek-V3-Technical-Report]] - [[papers/ERNIE-Technical-Report]] - [[papers/El...
  - `Open Questions`: - Which linked papers provide the strongest source-grounded evidence for this concept? - Which methods fail when this concept is ignored?
- [[syntheses/Calibration-Data-Selection-Topic-Overview|Calibration Data Selection Topic Overview]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Retrieval Hooks`: - Query: "I need a topic overview for calibration data selection that connects key papers, method families, claims, evidence, and open questions." Use because: It is the original research intent that produced `Calibration Data Selection Topic Overview`.
  - `Wiki Synthesis`: - Intended use: I need a topic overview for calibration data selection that connects key papers, method families, claims, evidence, and open questions.
  - `Evidence Map`: - [[syntheses/Transformer-Architecture-Topic-Overview|Transformer Architecture Topic Overview]]: candidate evidence sections: Retrieval Hooks, Wiki Synthesis, What This Page Is For, Evidence Map, Source Facts, User Ideas / Decisions, Open Questions, Publish /...
  - `What This Page Is For`: - Original research query: I need a topic overview for calibration data selection that connects key papers, method families, claims, evidence, and open questions.
  - `Source Facts`: - `Retrieval Hooks`: - Query: "I need a topic overview for transformer architecture that connects key papers, method families, claims, evidence, and open questions." Use because: It is the original research intent that produced `Transformer Architecture Topic...
  - `User Ideas / Decisions`: Automatically seeded by the final LLM Wiki synthesis growth loop from a compiled topic page.
  - `Open Questions`: - Which source facts are strong enough to preserve as canonical synthesis? - Which retrieved pages are adjacent context rather than direct evidence? - What should be checked against raw PDFs or user annotations before using this in a research decision?
  - `Publish / Review Notes`: - Run `meridian wiki proposal-lint` before publishing. - Keep source facts, wiki synthesis, and user ideas separated during review. - Do not promote source-quality holds as scientific evidence.
- [[topics/speculative-decoding|speculative decoding]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Key Concepts`: - [[concepts/Speculative-decoding-acceptance-rate|Speculative decoding acceptance rate]]
  - `Scope`: This topic page compiles canonical paper pages around `speculative decoding`.
  - `Claims`: - 2025 - Speculative Decoding and Beyond An In-Depth Survey of Techniques: Compresses the decode-time KV cache by selecting which cached key/value entries to retain under a cache budget, then evaluates the qual...
  - `Key Papers`: - [[papers/Lu-et-al-2022-A-continental-scale-analysis-reveals-widespread-root-bimodality]] - [[papers/Hu-et-al-2025-Speculative-Decoding-and-Beyond-An-In-Depth-Survey-of-Techniques]] - [[papers/Tiwari-et-al-2025-QuantSpec-Self-Speculative-Decoding-with-Hierarc...
  - `Retrieval Hooks`: - Retrieve this topic when comparing papers, mechanisms, limitations, or implementation hooks around `speculative decoding`.
  - `Method Families`: - [[methods/clustering-algorithm|clustering algorithm]] - [[methods/audio-language-modeling|audio-language modeling]] - [[methods/multimodal-instruction-tuning|multimodal instruction tuning]] - [[methods/speculative-decoding|speculative decoding]] - [[methods/...
- [[claims/Xie-et-al-2022-Crystal-Diffusion-Variational-Autoencoder-for-Periodic-Material-Generation-claim-004|4 PROPOSED METHOD Our approach generates new materials via a two-step process: 1) We sample a z from the latent space and use it to predict 3 aggregated properties of a material: composition (c), lattice (L), and number of atoms (N), which are then used to randomly initialize a material structure ˜ M = ( ˜ A, ˜ X, L).]]: retrieved source page; extract only directly supported facts with page/section provenance.
- [[evidence/Computer-Architecture-A-Quantitative-Approach-5th-edition-evidence-p0001|evidence-p0001]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Evidence Item`: No summary.
  - `Supports`: - `none recorded`
  - `Metric or Observation`: - Evidence type: `page` - Observation: No summary.
  - `Limits`: - This evidence item is paper-local until synthesized with other evidence.

## Wiki Synthesis

- This is a low-confidence synthesis scaffold generated from canonical retrieval context.
- Preserve the source facts below as evidence candidates; do not treat this scaffold as a final thesis.
- Intended use: I need a topic overview for speculative decoding that connects key papers, method families, claims, evidence, and open questions.
- Next reviewer action: compress retrieved source facts into a tighter cross-paper thesis only after checking provenance.

## User Ideas / Decisions

Automatically seeded by the final LLM Wiki synthesis growth loop from a compiled topic page.

## Evidence Map

- [[methods/speculative-decoding|speculative decoding]]: candidate evidence sections: What It Is, Prerequisite Concepts, Mechanism, Failure Modes, Used By Papers, Implementation Hooks, Open Questions.
- [[concepts/Speculative-decoding-acceptance-rate|Speculative decoding acceptance rate]]: candidate evidence sections: Evidence / Provenance, What It Is, Retrieval Hooks, Why It Matters, Where It Appears, Open Questions.
- [[syntheses/Calibration-Data-Selection-Topic-Overview|Calibration Data Selection Topic Overview]]: candidate evidence sections: Retrieval Hooks, Wiki Synthesis, Evidence Map, What This Page Is For, Source Facts, User Ideas / Decisions, Open Questions, Publish / Review Notes.
- [[topics/speculative-decoding|speculative decoding]]: candidate evidence sections: Key Concepts, Scope, Claims, Key Papers, Retrieval Hooks, Method Families.
- [[claims/Xie-et-al-2022-Crystal-Diffusion-Variational-Autoencoder-for-Periodic-Material-Generation-claim-004|4 PROPOSED METHOD Our approach generates new materials via a two-step process: 1) We sample a z from the latent space and use it to predict 3 aggregated properties of a material: composition (c), lattice (L), and number of atoms (N), which are then used to randomly initialize a material structure ˜ M = ( ˜ A, ˜ X, L).]]: candidate evidence sections: needs manual section selection.
- [[evidence/Computer-Architecture-A-Quantitative-Approach-5th-edition-evidence-p0001|evidence-p0001]]: candidate evidence sections: Evidence Item, Supports, Metric or Observation, Limits.

## Open Questions

- Which source facts are strong enough to preserve as canonical synthesis?
- Which retrieved pages are adjacent context rather than direct evidence?
- What should be checked against raw PDFs or user annotations before using this in a research decision?

## Retrieval Hooks

- Query: "I need a topic overview for speculative decoding that connects key papers, method families, claims, evidence, and open questions."
  Use because: It is the original research intent that produced `Speculative Decoding Topic Overview`.

## Publish / Review Notes

- Run `meridian wiki proposal-lint` before publishing.
- Keep source facts, wiki synthesis, and user ideas separated during review.
- Do not promote source-quality holds as scientific evidence.

## Source Links

- [[methods/speculative-decoding|speculative decoding]]
- [[concepts/Speculative-decoding-acceptance-rate|Speculative decoding acceptance rate]]
- [[syntheses/Calibration-Data-Selection-Topic-Overview|Calibration Data Selection Topic Overview]]
- [[topics/speculative-decoding|speculative decoding]]
- [[claims/Xie-et-al-2022-Crystal-Diffusion-Variational-Autoencoder-for-Periodic-Material-Generation-claim-004|4 PROPOSED METHOD Our approach generates new materials via a two-step process: 1) We sample a z from the latent space and use it to predict 3 aggregated properties of a material: composition (c), lattice (L), and number of atoms (N), which are then used to randomly initialize a material structure ˜ M = ( ˜ A, ˜ X, L).]]
- [[evidence/Computer-Architecture-A-Quantitative-Approach-5th-edition-evidence-p0001|evidence-p0001]]
