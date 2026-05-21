---
type: "synthesis"
title: "Activation Outlier Quantization Evidence Map"
status: "draft"
created: "2026-05-21"
updated: "2026-05-21"
proposal_id: "Activation-Outlier-Quantization-Evidence-Map"
query: "I need an evidence map for activation outliers in low-bit LLM quantization, including which papers support smoothing, scaling, routing, and error-propagation claims."
source_papers:
  - "claims/Lin-et-al-2024-DuQuant-Distributing-Outliers-via-Dual-Transformation-Makes-Stronger-Quantized-LLMs-claim-003"
  - "evidence/Computer-Architecture-A-Quantitative-Approach-5th-edition-evidence-p0001"
  - "papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models"
  - "syntheses/Outlier-Aware-Quantization-Method-Family-Synthesis"
  - "papers/Yi-et-al-2024-Rotated-Runtime-Smooth-Training-Free-Activation-Smoother-for-accurate-INT4-inference"
  - "syntheses/Low-Bit-Quantization-Topic-Overview"
source_sections:
  - "evidence/Computer-Architecture-A-Quantitative-Approach-5th-edition-evidence-p0001#Supports"
  - "evidence/Computer-Architecture-A-Quantitative-Approach-5th-edition-evidence-p0001#Evidence Item"
  - "evidence/Computer-Architecture-A-Quantitative-Approach-5th-edition-evidence-p0001#Reliability"
  - "evidence/Computer-Architecture-A-Quantitative-Approach-5th-edition-evidence-p0001#Metric or Observation"
  - "evidence/Computer-Architecture-A-Quantitative-Approach-5th-edition-evidence-p0001#Limits"
  - "papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models#What To Remember"
  - "papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models#Mechanism"
  - "papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models#When To Retrieve This Paper"
  - "papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models#Evidence Map"
  - "papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models#Implementation Hooks"
  - "papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models#Paper Positioning"
  - "papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models#Mechanism Details To Verify"
  - "papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models#Limitations / Uncertainty"
  - "syntheses/Outlier-Aware-Quantization-Method-Family-Synthesis#Evidence Map"
  - "syntheses/Outlier-Aware-Quantization-Method-Family-Synthesis#Source Facts"
  - "syntheses/Outlier-Aware-Quantization-Method-Family-Synthesis#Wiki Synthesis"
  - "syntheses/Outlier-Aware-Quantization-Method-Family-Synthesis#Retrieval Hooks"
  - "syntheses/Outlier-Aware-Quantization-Method-Family-Synthesis#What This Page Is For"
  - "syntheses/Outlier-Aware-Quantization-Method-Family-Synthesis#User Ideas / Decisions"
  - "syntheses/Outlier-Aware-Quantization-Method-Family-Synthesis#Open Questions"
  - "syntheses/Outlier-Aware-Quantization-Method-Family-Synthesis#Publish / Review Notes"
  - "papers/Yi-et-al-2024-Rotated-Runtime-Smooth-Training-Free-Activation-Smoother-for-accurate-INT4-inference#Evidence Map"
  - "papers/Yi-et-al-2024-Rotated-Runtime-Smooth-Training-Free-Activation-Smoother-for-accurate-INT4-inference#Mechanism"
  - "papers/Yi-et-al-2024-Rotated-Runtime-Smooth-Training-Free-Activation-Smoother-for-accurate-INT4-inference#What To Remember"
  - "papers/Yi-et-al-2024-Rotated-Runtime-Smooth-Training-Free-Activation-Smoother-for-accurate-INT4-inference#When To Retrieve This Paper"
  - "papers/Yi-et-al-2024-Rotated-Runtime-Smooth-Training-Free-Activation-Smoother-for-accurate-INT4-inference#Implementation Hooks"
  - "papers/Yi-et-al-2024-Rotated-Runtime-Smooth-Training-Free-Activation-Smoother-for-accurate-INT4-inference#Mechanism Details To Verify"
  - "papers/Yi-et-al-2024-Rotated-Runtime-Smooth-Training-Free-Activation-Smoother-for-accurate-INT4-inference#Paper Positioning"
  - "papers/Yi-et-al-2024-Rotated-Runtime-Smooth-Training-Free-Activation-Smoother-for-accurate-INT4-inference#Limitations / Uncertainty"
  - "syntheses/Low-Bit-Quantization-Topic-Overview#Evidence Map"
  - "syntheses/Low-Bit-Quantization-Topic-Overview#Retrieval Hooks"
  - "syntheses/Low-Bit-Quantization-Topic-Overview#Source Facts"
  - "syntheses/Low-Bit-Quantization-Topic-Overview#Wiki Synthesis"
  - "syntheses/Low-Bit-Quantization-Topic-Overview#What This Page Is For"
  - "syntheses/Low-Bit-Quantization-Topic-Overview#User Ideas / Decisions"
  - "syntheses/Low-Bit-Quantization-Topic-Overview#Open Questions"
  - "syntheses/Low-Bit-Quantization-Topic-Overview#Publish / Review Notes"
source_context: ".drafts/proposals/product-maturity-synthesis-r3/Activation-Outlier-Quantization-Evidence-Map/source_context.json"
user_inputs:
  - "inline_user_note"
confidence: "low"
review_state: "published_proposal"
tags:
  - "paper-wiki/synthesis"
  - "paper-wiki/synthesis"
aliases:
  - "Activation Outlier Quantization Evidence Map"
  - "I need an evidence map for activation outliers in low-bit LLM quantization, including which papers support smoothing, scaling, routing, and error-propagation claims."
topics:
  - "post-training quantization"
  - "low-bit quantization"
  - "activation outliers"
  - "hardware-aware quantization"
  - "low-rank adaptation"
  - "vision-language quantization"
  - "rotation-based quantization"
methods:
  - "post-training quantization"
  - "outlier-aware quantization"
related:
  - "claims/Lin-et-al-2024-DuQuant-Distributing-Outliers-via-Dual-Transformation-Makes-Stronger-Quantized-LLMs-claim-003"
  - "evidence/Computer-Architecture-A-Quantitative-Approach-5th-edition-evidence-p0001"
  - "papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models"
  - "syntheses/Outlier-Aware-Quantization-Method-Family-Synthesis"
  - "papers/Yi-et-al-2024-Rotated-Runtime-Smooth-Training-Free-Activation-Smoother-for-accurate-INT4-inference"
  - "syntheses/Low-Bit-Quantization-Topic-Overview"
related_papers:
  - "claims/Lin-et-al-2024-DuQuant-Distributing-Outliers-via-Dual-Transformation-Makes-Stronger-Quantized-LLMs-claim-003"
  - "evidence/Computer-Architecture-A-Quantitative-Approach-5th-edition-evidence-p0001"
  - "papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models"
  - "syntheses/Outlier-Aware-Quantization-Method-Family-Synthesis"
  - "papers/Yi-et-al-2024-Rotated-Runtime-Smooth-Training-Free-Activation-Smoother-for-accurate-INT4-inference"
  - "syntheses/Low-Bit-Quantization-Topic-Overview"
related_methods:
  - "post-training quantization"
  - "outlier-aware quantization"
related_topics:
  - "post-training quantization"
  - "low-bit quantization"
  - "activation outliers"
  - "hardware-aware quantization"
  - "low-rank adaptation"
  - "vision-language quantization"
  - "rotation-based quantization"
source_quality_risk: false
evolution_state: "active"
revision_id: "synthesis-Activation-Outlier-Quantization-Evidence-Map"
---
# Activation Outlier Quantization Evidence Map

## What This Page Is For

- Proposal type: `synthesis`.
- Original research query: I need an evidence map for activation outliers in low-bit LLM quantization, including which papers support smoothing, scaling, routing, and error-propagation claims.
- Publish target after review: `syntheses/Activation-Outlier-Quantization-Evidence-Map.md`.
- This draft exists to preserve useful retrieval context without pretending that synthesis is already final.

## Source Facts

- [[claims/Lin-et-al-2024-DuQuant-Distributing-Outliers-via-Dual-Transformation-Makes-Stronger-Quantized-LLMs-claim-003|DuQuant simplifies the quantization process and excels in managing outliers, outperforming the state-of-the-art baselines across various sizes and types of LLMs on multiple tasks, even with 4-bit weight-activation quantization.]]: retrieved source page; extract only directly supported facts with page/section provenance.
- [[evidence/Computer-Architecture-A-Quantitative-Approach-5th-edition-evidence-p0001|evidence-p0001]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Supports`: - `none recorded`
  - `Evidence Item`: No summary.
  - `Reliability`: - Confidence: `low` - Review state: `needs_review`
  - `Metric or Observation`: - Evidence type: `page` - Observation: No summary.
  - `Limits`: - This evidence item is paper-local until synthesized with other evidence.
- [[papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models|Wang 等 - LSVD Loss-Aware Low-Rank Approximation for Efficient Low-Precision Vision-Language Models]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `What To Remember`: Wang 等 - LSVD Loss-Aware Low-Rank Approximation for Efficient Low-Precision Vision-Language Models: Migrates quantization difficulty from activation outlier channels into weights through an offline mathematically equivalent scaling, so W8A8 activation and weig...
  - `Mechanism`: ### Activation-to-weight smoothing - Purpose: Migrates quantization difficulty from activation outlier channels into weights through an offline mathematically equivalent scaling, so W8A8 activation and weight quantization become hardware-friendly.
  - `When To Retrieve This Paper`: - Query: "I need papers that connect activation outliers, equivalent transformation, and hardware-aware quantization claims in post-training quantization and outlier-aware quantization to experimental evidence, accuracy, latency, and throughput, and results on...
  - `Evidence Map`: - `claim-003`: Representative LLM PTQ methods include GPTQ [14], AWQ [28], and SmoothQuant [54], which respectively use second-order error compensation, activation-aware channel protection, and channel-wise scaling to improve robustness.
  - `Implementation Hooks`: - Activation-to-weight smoothing: Implement scale search for alpha and verify Y = XW is preserved before quantization.
  - `Paper Positioning`: This is a W8A8 post-training quantization paper about moving activation outlier difficulty into weights through an equivalent smoothing transform.
  - `Mechanism Details To Verify`: - `table` / Table detail: By factorizing the query (Q), key (K), and value (V) projection matrices in self-attention blocks into low-rank components, prior studies have demonstrated notable reductions in parameter count and computational cost [6, 24, 26, 47, 4...
  - `Limitations / Uncertainty`: - The smoothing alpha trades activation difficulty against weight difficulty; a setting that preserves one model may not transfer unchanged.
- [[syntheses/Outlier-Aware-Quantization-Method-Family-Synthesis|Outlier-Aware Quantization Method Family Synthesis]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Evidence Map`: - [[concepts/Quantization-error-propagation|Quantization error propagation]]: candidate evidence sections: What It Is, Evidence / Provenance, Implementation Implications, Where It Appears, Common Failure Modes, Minimal Checks / Probes, Related Concepts, Why It...
  - `Source Facts`: - `Why It Matters`: - Outlier activations can dominate quantization scale choices and make low-bit activation or weight-activation quantization fail even when average error looks acceptable.
  - `Wiki Synthesis`: - Intended use: I need a cross-paper method-family synthesis for outlier-aware quantization with mechanism, implementation hooks, evidence boundaries, and failure modes.
  - `Retrieval Hooks`: - Query: "I need a cross-paper method-family synthesis for outlier-aware quantization with mechanism, implementation hooks, evidence boundaries, and failure modes." Use because: It is the original research intent that produced `Outlier-Aware Quantization Metho...
  - `What This Page Is For`: - Original research query: I need a cross-paper method-family synthesis for outlier-aware quantization with mechanism, implementation hooks, evidence boundaries, and failure modes.
  - `User Ideas / Decisions`: Automatically seeded by the final LLM Wiki synthesis growth loop from a compiled method page.
  - `Open Questions`: - Which retrieved pages are adjacent context rather than direct evidence?
  - `Publish / Review Notes`: - Run `meridian wiki proposal-lint` before publishing. - Keep source facts, wiki synthesis, and user ideas separated during review. - Do not promote source-quality holds as scientific evidence.
- [[papers/Yi-et-al-2024-Rotated-Runtime-Smooth-Training-Free-Activation-Smoother-for-accurate-INT4-inference|Yi et al. - 2024 - Rotated Runtime Smooth Training-Free Activation Smoother for accurate INT4 inference]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Evidence Map`: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, runtime or memory measurements, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate.
  - `Mechanism`: ### Activation-to-weight smoothing - Purpose: Migrates quantization difficulty from activation outlier channels into weights through an offline mathematically equivalent scaling, so W8A8 activation and weight quantization become hardware-friendly.
  - `What To Remember`: - 2024 - Rotated Runtime Smooth Training-Free Activation Smoother for accurate INT4 inference: Migrates quantization difficulty from activation outlier channels into weights through an offline mathematically equivalent scaling, so W8A8 activation and weight qu...
  - `When To Retrieve This Paper`: - Query: "I need papers that connect activation outliers, equivalent transformation, and rotation-based quantization claims in post-training quantization and outlier-aware quantization to experimental evidence, accuracy, perplexity, and latency, and results on...
  - `Implementation Hooks`: - Activation-to-weight smoothing: Implement scale search for alpha and verify Y = XW is preserved before quantization.
  - `Mechanism Details To Verify`: - `equivalent_transform` / SmoothQuant: SmoothQuant uses the equivalent scaling transform Y = (X diag(s)^-1)(diag(s) W): activation outliers are reduced offline by moving scale into weights, then both sides can use efficient W8A8 quantization.
  - `Paper Positioning`: This is a W8A8 post-training quantization paper about moving activation outlier difficulty into weights through an equivalent smoothing transform.
  - `Limitations / Uncertainty`: - The smoothing alpha trades activation difficulty against weight difficulty; a setting that preserves one model may not transfer unchanged.
- [[syntheses/Low-Bit-Quantization-Topic-Overview|Low-Bit Quantization Topic Overview]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Evidence Map`: - [[topics/low-bit-quantization|low-bit quantization]]: candidate evidence sections: Scope, Key Papers, Retrieval Hooks, Claims, Method Families.
  - `Retrieval Hooks`: - Query: "I need a topic overview for low-bit quantization that connects key papers, method families, claims, evidence, and open questions." Use because: It is the original research intent that produced `Low-Bit Quantization Topic Overview`.
  - `Source Facts`: - `Used By Papers`: - [[papers/Bhalgat-et-al-2020-LSQ-Improving-low-bit-quantization-through-learnable-offsets-and-better-initialization]] - `Open Questions`: - Which linked papers provide the strongest source-grounded evidence for this method family?
  - `Wiki Synthesis`: - Intended use: I need a topic overview for low-bit quantization that connects key papers, method families, claims, evidence, and open questions.
  - `What This Page Is For`: - Original research query: I need a topic overview for low-bit quantization that connects key papers, method families, claims, evidence, and open questions.
  - `User Ideas / Decisions`: Automatically seeded by the final LLM Wiki synthesis growth loop from a compiled topic page.
  - `Open Questions`: - Which retrieved pages are adjacent context rather than direct evidence?
  - `Publish / Review Notes`: - Run `meridian wiki proposal-lint` before publishing. - Keep source facts, wiki synthesis, and user ideas separated during review. - Do not promote source-quality holds as scientific evidence.

## Wiki Synthesis

- This is a low-confidence synthesis scaffold generated from canonical retrieval context.
- Preserve the source facts below as evidence candidates; do not treat this scaffold as a final thesis.
- Intended use: I need an evidence map for activation outliers in low-bit LLM quantization, including which papers support smoothing, scaling, routing, and error-propagation claims.
- Next reviewer action: compress retrieved source facts into a tighter cross-paper thesis only after checking provenance.

## User Ideas / Decisions

Seeded to cover the evidence-map synthesis type for quantization and compression research use.

## Evidence Map

- [[claims/Lin-et-al-2024-DuQuant-Distributing-Outliers-via-Dual-Transformation-Makes-Stronger-Quantized-LLMs-claim-003|DuQuant simplifies the quantization process and excels in managing outliers, outperforming the state-of-the-art baselines across various sizes and types of LLMs on multiple tasks, even with 4-bit weight-activation quantization.]]: candidate evidence sections: needs manual section selection.
- [[evidence/Computer-Architecture-A-Quantitative-Approach-5th-edition-evidence-p0001|evidence-p0001]]: candidate evidence sections: Supports, Evidence Item, Reliability, Metric or Observation, Limits.
- [[papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models|Wang 等 - LSVD Loss-Aware Low-Rank Approximation for Efficient Low-Precision Vision-Language Models]]: candidate evidence sections: What To Remember, Mechanism, When To Retrieve This Paper, Evidence Map, Implementation Hooks, Paper Positioning, Mechanism Details To Verify, Limitations / Uncertainty.
- [[syntheses/Outlier-Aware-Quantization-Method-Family-Synthesis|Outlier-Aware Quantization Method Family Synthesis]]: candidate evidence sections: Evidence Map, Source Facts, Wiki Synthesis, Retrieval Hooks, What This Page Is For, User Ideas / Decisions, Open Questions, Publish / Review Notes.
- [[papers/Yi-et-al-2024-Rotated-Runtime-Smooth-Training-Free-Activation-Smoother-for-accurate-INT4-inference|Yi et al. - 2024 - Rotated Runtime Smooth Training-Free Activation Smoother for accurate INT4 inference]]: candidate evidence sections: Evidence Map, Mechanism, What To Remember, When To Retrieve This Paper, Implementation Hooks, Mechanism Details To Verify, Paper Positioning, Limitations / Uncertainty.
- [[syntheses/Low-Bit-Quantization-Topic-Overview|Low-Bit Quantization Topic Overview]]: candidate evidence sections: Evidence Map, Retrieval Hooks, Source Facts, Wiki Synthesis, What This Page Is For, User Ideas / Decisions, Open Questions, Publish / Review Notes.

## Open Questions

- Which source facts are strong enough to preserve as canonical synthesis?
- Which retrieved pages are adjacent context rather than direct evidence?
- What should be checked against raw PDFs or user annotations before using this in a research decision?

## Retrieval Hooks

- Query: "I need an evidence map for activation outliers in low-bit LLM quantization, including which papers support smoothing, scaling, routing, and error-propagation claims."
  Use because: It is the original research intent that produced `Activation Outlier Quantization Evidence Map`.
- Query: "I need a cross-paper synthesis around post-training quantization and its implementation or evidence boundaries."
  Use because: This page links retrieved papers, mechanism notes, and open checks.
- Query: "I am mapping papers related to post-training quantization and need a higher-level summary rather than a single paper."
  Use because: This page is a synthesis artifact with source links and uncertainty notes.

## Publish / Review Notes

- Run `meridian wiki proposal-lint` before publishing.
- Keep source facts, wiki synthesis, and user ideas separated during review.
- Do not promote source-quality holds as scientific evidence.

## Source Links

- [[claims/Lin-et-al-2024-DuQuant-Distributing-Outliers-via-Dual-Transformation-Makes-Stronger-Quantized-LLMs-claim-003|DuQuant simplifies the quantization process and excels in managing outliers, outperforming the state-of-the-art baselines across various sizes and types of LLMs on multiple tasks, even with 4-bit weight-activation quantization.]]
- [[evidence/Computer-Architecture-A-Quantitative-Approach-5th-edition-evidence-p0001|evidence-p0001]]
- [[papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models|Wang 等 - LSVD Loss-Aware Low-Rank Approximation for Efficient Low-Precision Vision-Language Models]]
- [[syntheses/Outlier-Aware-Quantization-Method-Family-Synthesis|Outlier-Aware Quantization Method Family Synthesis]]
- [[papers/Yi-et-al-2024-Rotated-Runtime-Smooth-Training-Free-Activation-Smoother-for-accurate-INT4-inference|Yi et al. - 2024 - Rotated Runtime Smooth Training-Free Activation Smoother for accurate INT4 inference]]
- [[syntheses/Low-Bit-Quantization-Topic-Overview|Low-Bit Quantization Topic Overview]]
